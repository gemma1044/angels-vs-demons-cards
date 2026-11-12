// 入口：把规则引擎（game/）、3D 战场（scene/）和 DOM 界面串起来。
// 引擎每个动作吐出事件列表，这里按顺序播放：3D 演出 + 更新状态栏/手牌/羁绊面板。

import { preloadModels } from './scene/models';
import { chooseMove } from './game/ai';
import { BOND_BY_ID, BONDS, countMembers, type BondDef } from './game/bonds';
import { CARD_BY_ID, CARDS, KEYWORD_INFO, THEME_INFO, type CardDef } from './game/cards';
import { DECK_BY_ID, DECKS, type DeckDef } from './game/decks';
import {
  canPlay, createGame, endTurn, LANES, membersOf, playCard, SANCTUM_HP, TURN_LIMIT, unitsOf, unitStats,
  type GameEvent, type GameState, type PlayerId,
} from './game/engine';
import { Battlefield } from './scene/battlefield';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const field = new Battlefield($('#field'));

// ———————————————————— 卡面 ————————————————————

const ROMAN = ['', 'Ⅰ', 'Ⅱ'];

/** 卡面图缺失时的代码卡面：主题色渐变 + 阵营纹章 */
function fallbackArt(card: CardDef): string {
  const t = THEME_INFO[card.theme];
  const glyph = card.faction === 'angel'
    ? '<circle cx="60" cy="38" r="16" fill="none" stroke="#fff" stroke-width="3"/><path d="M60 60 L20 40 L34 78 Z M60 60 L100 40 L86 78 Z" fill="#fff" opacity=".85"/>'
    : '<path d="M40 30 L48 62 L32 54 Z M80 30 L72 62 L88 54 Z" fill="#fff" opacity=".9"/><path d="M60 58 L18 46 L40 84 Z M60 58 L102 46 L80 84 Z" fill="#000" opacity=".55"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><radialGradient id="g" cy=".35"><stop offset="0" stop-color="${t.accent}"/><stop offset=".55" stop-color="${t.color}"/><stop offset="1" stop-color="#0b0d18"/></radialGradient></defs><rect width="120" height="120" fill="url(#g)"/>${glyph}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function cardText(card: CardDef): string {
  const parts: string[] = [];
  for (const k of card.keywords ?? []) parts.push(`<b>${KEYWORD_INFO[k].name}</b>`);
  if (card.armor) parts.push(`<b>护甲 ${card.armor}</b>`);
  const fx = card.onPlay;
  if (fx?.kind === 'healSanctum') parts.push(`入场：圣所恢复 ${fx.n}`);
  if (fx?.kind === 'healAllies') parts.push(`入场：其他友军恢复 ${fx.n}`);
  if (fx?.kind === 'strike') parts.push(`入场：对正面敌人造成 ${fx.n} 伤害`);
  if (fx?.kind === 'draw') parts.push(`入场：抽 ${fx.n} 张牌`);
  return parts.join('　') || `<i style="opacity:.7">${card.flavor}</i>`;
}

function cardEl(card: CardDef): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `card theme-${card.theme} faction-${card.faction}`;
  el.innerHTML = `
    <div class="card-in">
      <div class="card-art"><img src="/cards/${card.id}.jpg" alt="${card.name}" draggable="false"></div>
      <div class="card-frame"></div>
      <div class="card-name">${card.name}</div>
      <div class="card-text">${cardText(card)}</div>
      <div class="card-theme" style="background-image:url(/ui/theme_${card.theme}.png)" title="${THEME_INFO[card.theme].name}"></div>
      <div class="badge cost"><b>${card.cost}</b></div>
      <div class="badge atk"><b>${card.atk}</b></div>
      <div class="badge hp"><b>${card.hp}</b></div>
      ${card.armor ? `<div class="badge armor"><b>${card.armor}</b></div>` : ''}
    </div>`;
  if (card.cost >= 5) el.classList.add('legend');
  // 悬停时跟着指针做 3D 倾斜，并把全息反光移到指针位置
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    el.style.setProperty('--rx', `${((0.5 - y) * 22).toFixed(1)}deg`);
    el.style.setProperty('--ry', `${((x - 0.5) * 26).toFixed(1)}deg`);
  });
  el.addEventListener('pointerleave', () => {
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  });
  const img = el.querySelector('img')!;
  img.onerror = () => {
    img.onerror = null;
    img.src = fallbackArt(card);
  };
  return el;
}

// ———————————————————— 对局状态 ————————————————————

let state: GameState;
let decks: [DeckDef, DeckDef];
let busy = true;
let selected: number | null = null;
let gameSeq = 0;
/** 动画播放中的「显示值」，跟着事件逐步变化；一批事件播完再和真实状态对齐 */
const view = {
  sanctum: [SANCTUM_HP, SANCTUM_HP],
  energy: [0, 0],
  maxEnergy: [0, 0],
  hand: [] as string[],
  bonds: [[], []] as [string[], string[]],
};
let freshBonds = new Set<string>();

const who = (p: PlayerId) => (p === 0 ? '你' : '对手');

function log(text: string, cls: 'me' | 'foe' | 'sys'): void {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  const box = $('#log');
  box.appendChild(el);
  while (box.children.length > 60) box.firstChild!.remove();
  box.scrollTop = box.scrollHeight;
}

function toast(html: string, color: string, lost = false): void {
  const el = document.createElement('div');
  el.className = `toast ${lost ? 'lost' : ''}`;
  el.style.setProperty('--c', color);
  el.innerHTML = html;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 2900);
}

function banner(text: string, color: string): void {
  const el = $('#banner');
  el.textContent = text;
  el.style.color = color;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function bondColor(def: BondDef): string {
  if (def.kind === 'theme') return THEME_INFO[def.themes[0]].color;
  if (def.id === 'firmament') return '#f2c96b';
  if (def.id === 'pandemonium') return '#ff5a4f';
  return '#b48cff';
}
/** 羁绊图标：同主题用主题纹章，混编叠两枚，纯阵营和黄昏契约用阵营徽记 */
function bondIcon(def: BondDef): string {
  if (def.themes.length === 1) return `<div class="bond-ico"><img src="/ui/theme_${def.themes[0]}.png" alt=""></div>`;
  if (def.themes.length === 2) return `<div class="bond-ico two">${def.themes.map((t) => `<img src="/ui/theme_${t}.png" alt="">`).join('')}</div>`;
  const crest = def.id === 'firmament' ? 'angel' : def.id === 'pandemonium' ? 'demon' : 'dusk';
  return `<div class="bond-ico"><img src="/ui/crest_${crest}.png" alt=""></div>`;
}
const KIND_LABEL = { theme: '同主题', mixed: '混编', faction: '纯阵营' } as const;

// ———————————————————— 渲染 ————————————————————

function hudHtml(player: PlayerId): string {
  const p = state.players[player];
  const hp = view.sanctum[player];
  const crystals = Array.from({ length: Math.max(view.maxEnergy[player], view.energy[player], 1) }, (_, i) => `<i class="${i < view.energy[player] ? 'on' : ''}"></i>`).join('');
  const side = decks[player].side;
  return `
    <div class="hud-crest side-${side}"><img src="/ui/crest_${side}.png" alt=""></div>
    <div class="hud-main">
      <div class="who">${player === 0 ? '你' : '对手'}<small>${decks[player].name}</small></div>
      <div class="hp-bar side-${player}"><i style="width:${(hp / SANCTUM_HP) * 100}%"></i><span><small>圣所</small>${hp} / ${SANCTUM_HP}</span></div>
      <div class="hud-row">
        <div class="energy" title="灵息">${crystals}<b>${view.energy[player]}/${view.maxEnergy[player]}</b></div>
        <div class="stat">${player === 1 ? `<img src="/ui/icon_hand.png" alt="手牌" title="手牌"><b>${p.hand.length}</b>` : ''}<img src="/ui/icon_deck.png" alt="牌库" title="牌库"><b>${p.deck.length}</b></div>
      </div>
    </div>`;
}

function renderHud(): void {
  $('#enemy-hud').innerHTML = hudHtml(1);
  $('#player-hud').innerHTML = hudHtml(0);
  const mine = state.current === 0;
  const info = $('#turn-info');
  info.className = state.winner !== null ? '' : mine ? 'mine' : 'theirs';
  info.className = `panel plain ${info.className}`;
  info.innerHTML = `<b><img src="/ui/icon_turn.png" alt="">${state.winner !== null ? '对局结束' : mine ? '你的回合' : '对手回合'}</b><span class="stat">第 ${Math.ceil(state.turn / 2)} 轮（上限 ${TURN_LIMIT / 2} 轮）</span>`;
  ($('#btn-end') as HTMLButtonElement).disabled = busy || !mine || state.winner !== null;
}

function freeLanes(): number[] {
  return Array.from({ length: LANES }, (_, i) => i).filter((l) => state.players[0].board[l] === null);
}

function renderHand(enterFrom = -1): void {
  const hand = $('#hand');
  hand.innerHTML = '';
  const canAct = !busy && state.current === 0 && state.winner === null;
  const hasLane = freeLanes().length > 0;
  view.hand.forEach((id, i) => {
    const card = CARD_BY_ID[id];
    const el = cardEl(card);
    const playable = canAct && hasLane && card.cost <= state.players[0].energy;
    if (playable) el.classList.add('playable');
    if (selected === i) el.classList.add('selected');
    if (enterFrom >= 0 && i >= enterFrom) el.classList.add('enter');
    el.addEventListener('click', () => {
      if (!playable) return;
      select(selected === i ? null : i);
    });
    hand.appendChild(el);
  });
  const hint = $('#hint');
  if (state.winner !== null) hint.textContent = '';
  else if (state.current !== 0) hint.textContent = '对手行动中…';
  else if (busy) hint.textContent = '';
  else if (selected !== null) hint.textContent = '点击发光的战线部署（或按数字键 1–4），Esc 取消';
  else if (view.hand.some((id) => CARD_BY_ID[id].cost <= state.players[0].energy) && hasLane) hint.textContent = '选一张亮着的手牌部署，或点「开战」让场上单位进攻';
  else hint.textContent = '没有可出的牌了，点「开战」结束回合';
}

function select(index: number | null): void {
  selected = index;
  field.setSelectable(index === null ? [] : freeLanes());
  renderHand();
}

function bondEl(def: BondDef, sig: string[], counts: ReturnType<typeof countMembers> | null): HTMLDivElement {
  const tier = Number(sig.find((s) => s.startsWith(def.id + ':'))?.split(':')[1] ?? 0);
  const el = document.createElement('div');
  el.className = `bond ${tier > 0 ? 'active' : ''}`;
  el.style.setProperty('--c', bondColor(def));
  let count = '';
  if (counts) {
    if (def.themes.length) count = def.themes.map((t) => `${THEME_INFO[t].name} ${counts.theme[t]}`).join(' · ');
    else count = `天使 ${counts.angel} · 恶魔 ${counts.demon}`;
  }
  el.innerHTML =
    `${bondIcon(def)}<div class="bond-main"><div class="bond-head"><span class="bond-name">${def.name}${tier > 0 && def.tiers.length > 1 ? ' ' + ROMAN[tier] : ''}</span><span class="bond-kind">${KIND_LABEL[def.kind]}</span><span class="bond-count">${count}</span></div>` +
    def.tiers.map((t, i) => `<div class="bond-tier ${i < tier ? 'on' : ''}"><em>${t.need}：</em>${t.text}</div>`).join('') + '</div>';
  return el;
}

function renderBonds(): void {
  for (const player of [0, 1] as PlayerId[]) {
    const box = $(`#bonds-${player}`);
    box.innerHTML = '';
    const sig = view.bonds[player];
    const counts = countMembers(membersOf(state, player));
    // 我方：显示已生效的 + 已经有成员在场、差一点就能凑成的；对手：只显示已生效的
    const list = BONDS.filter((def) => {
      if (sig.some((s) => s.startsWith(def.id + ':'))) return true;
      if (player === 1) return false;
      return def.themes.some((t) => counts.theme[t] > 0);
    }).sort((a, b) => Number(sig.some((s) => s.startsWith(b.id + ':'))) - Number(sig.some((s) => s.startsWith(a.id + ':'))));
    if (!list.length) box.innerHTML = `<div class="bond-empty">${player === 0 ? '部署同主题或特定混编的单位来触发' : '暂无生效羁绊'}</div>`;
    for (const def of list) {
      const el = bondEl(def, sig, counts);
      if (freshBonds.has(`${player}:${def.id}`)) el.classList.add('fresh');
      box.appendChild(el);
    }
  }
  freshBonds = new Set();
}

function syncAll(): void {
  for (const p of [0, 1] as PlayerId[]) {
    view.sanctum[p] = state.players[p].sanctum;
    view.energy[p] = state.players[p].energy;
    view.maxEnergy[p] = state.players[p].maxEnergy;
  }
  view.hand = state.players[0].hand.slice();
  const stats: Record<number, ReturnType<typeof unitStats>> = {};
  for (const p of [0, 1] as PlayerId[]) for (const u of unitsOf(state, p)) stats[u.uid] = unitStats(state, u);
  field.setStats(stats);
  renderHud();
  renderHand();
  renderBonds();
}

// ———————————————————— 事件播放 ————————————————————

const nameOf = (uid: number) => field.actorCard(uid)?.name ?? '单位';

async function handle(e: GameEvent): Promise<void> {
  switch (e.t) {
    case 'turnStart': {
      view.energy[e.player] = e.energy;
      view.maxEnergy[e.player] = e.maxEnergy;
      renderHud();
      banner(e.player === 0 ? '你的回合' : '对手回合', e.player === 0 ? '#7dffb0' : '#ff6b6b');
      log(`—— 第 ${Math.ceil(e.turn / 2)} 轮 · ${who(e.player)}的回合 ——`, 'sys');
      await field.wait(e.turn === 1 ? 0.3 : 0.75);
      break;
    }
    case 'draw': {
      if (e.player === 0 && !e.burned) {
        view.hand.push(e.cardId);
        renderHand(view.hand.length - 1);
        await field.wait(0.12);
      } else if (e.burned) {
        log(`${who(e.player)}手牌已满，${CARD_BY_ID[e.cardId].name} 被弃掉`, 'sys');
      }
      break;
    }
    case 'summon': {
      const card = CARD_BY_ID[e.cardId];
      log(`${who(e.player)}部署 ${card.name}（${THEME_INFO[card.theme].name}）到第 ${e.lane + 1} 线`, e.player === 0 ? 'me' : 'foe');
      await field.summon(e.player, e.lane, e.uid, card);
      break;
    }
    case 'strike':
      log(`${nameOf(e.fromUid)} 入场打击 ${nameOf(e.targetUid)}`, e.player === 0 ? 'me' : 'foe');
      await field.strike(e.fromUid, e.targetUid);
      break;
    case 'attack':
      log(`${nameOf(e.uid)} 攻击 ${e.targetUid === null ? '圣所' : nameOf(e.targetUid)}`, e.player === 0 ? 'me' : 'foe');
      await field.attack(e.uid, e.targetUid);
      break;
    case 'damage':
      await field.hurt(e.uid, e.amount);
      break;
    case 'unitHeal':
      await field.healUnit(e.uid, e.amount);
      break;
    case 'death':
      log(`${nameOf(e.uid)} 阵亡`, 'sys');
      await field.kill(e.uid);
      break;
    case 'sanctumDamage': {
      view.sanctum[e.player] = Math.max(0, view.sanctum[e.player] - e.amount);
      renderHud();
      const src = e.source === 'burn' ? '灼烧' : e.source === 'pierce' ? '贯穿' : '攻击';
      log(`${who(e.player)}的圣所受到 ${e.amount} 点${src}伤害`, e.player === 0 ? 'foe' : 'me');
      await field.hitSanctum(e.player, e.amount, e.source);
      break;
    }
    case 'sanctumHeal': {
      view.sanctum[e.player] = Math.min(SANCTUM_HP, view.sanctum[e.player] + e.amount);
      renderHud();
      const src = e.source === 'lifesteal' ? '吸取' : e.source === 'bond' ? '羁绊' : '入场效果';
      log(`${who(e.player)}的圣所恢复 ${e.amount}（${src}）`, e.player === 0 ? 'me' : 'foe');
      await field.healSanctum(e.player, e.amount);
      break;
    }
    case 'bonds': {
      for (const sig of e.gained) {
        const [id, tier] = sig.split(':');
        const def = BOND_BY_ID[id];
        const t = def.tiers[Number(tier) - 1];
        const label = `${def.name}${def.tiers.length > 1 ? ' ' + ROMAN[Number(tier)] : ''}`;
        freshBonds.add(`${e.player}:${id}`);
        toast(`${bondIcon(def)}<div>${who(e.player)}的羁绊生效 · <b>${label}</b><br>${t.text}</div>`, bondColor(def));
        log(`${who(e.player)}的羁绊生效：${label} — ${t.text}`, e.player === 0 ? 'me' : 'foe');
        field.bondFlash(e.player, parseInt(bondColor(def).slice(1), 16));
      }
      for (const sig of e.lost) {
        const [id, tier] = sig.split(':');
        // 升档时旧档位会出现在 lost 里，不算中断
        if (e.gained.some((g) => g.startsWith(id + ':') && Number(g.split(':')[1]) > Number(tier))) continue;
        const def = BOND_BY_ID[id];
        toast(`${bondIcon(def)}<div>${who(e.player)}的羁绊中断 · <b>${def.name}</b></div>`, '#7a809c', true);
        log(`${who(e.player)}的羁绊中断：${def.name}`, 'sys');
      }
      break;
    }
    case 'stats':
      view.bonds = e.bonds;
      field.setStats(e.units);
      renderBonds();
      break;
    case 'gameOver':
      break;
  }
}

async function play(events: GameEvent[]): Promise<void> {
  const seq = gameSeq;
  busy = true;
  renderHud();
  for (const e of events) {
    if (seq !== gameSeq) return;
    await handle(e);
  }
  if (seq !== gameSeq) return;
  busy = false;
  syncAll();
  if (state.winner !== null) await finish();
}

async function finish(): Promise<void> {
  busy = true;
  renderHud();
  renderHand();
  const w = state.winner;
  if (w !== 'draw' && w !== null && state.players[w === 0 ? 1 : 0].sanctum <= 0) await field.shatter(w === 0 ? 1 : 0);
  await field.wait(0.5);
  showResult();
}

// ———————————————————— 玩家与电脑的操作 ————————————————————

async function playerPlay(lane: number): Promise<void> {
  if (busy || selected === null || !canPlay(state, 0, selected, lane)) return;
  const index = selected;
  selected = null;
  field.setSelectable([]);
  view.hand.splice(index, 1);
  const events = playCard(state, index, lane);
  view.energy[0] = state.players[0].energy;
  renderHand();
  await play(events);
}

async function playerEndTurn(): Promise<void> {
  if (busy || state.current !== 0 || state.winner !== null) return;
  const seq = gameSeq;
  selected = null;
  field.setSelectable([]);
  log('你下令开战', 'me');
  await play(endTurn(state));
  // 电脑回合
  while (seq === gameSeq && state.winner === null && (state.current as PlayerId) === 1) {
    busy = true;
    renderHud();
    renderHand();
    await field.wait(0.45);
    const move = chooseMove(state);
    if (seq !== gameSeq) return;
    if (move) {
      const events = playCard(state, move.handIndex, move.lane);
      view.energy[1] = state.players[1].energy;
      await play(events);
    } else {
      log('对手下令开战', 'foe');
      await play(endTurn(state));
    }
  }
}

field.onLaneClick = (lane) => void playerPlay(lane);
field.onUnitHover = (uid) => {
  const box = $('#preview');
  const card = uid === null ? null : field.actorCard(uid);
  box.classList.toggle('show', !!card);
  if (card) {
    box.innerHTML = '';
    box.appendChild(cardEl(card));
  }
};
$('#btn-end').addEventListener('click', () => void playerEndTurn());
$('#btn-codex').addEventListener('click', () => showCodex());
window.addEventListener('keydown', (e) => {
  if ($('#overlay').classList.contains('show')) return;
  if (e.key === 'Escape') select(null);
  else if (/^[1-4]$/.test(e.key) && selected !== null) void playerPlay(Number(e.key) - 1);
  else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    void playerEndTurn();
  }
});

// ———————————————————— 浮层：开局 / 结算 / 规则 ————————————————————

const RULES = [
  `双方各有一座 ${SANCTUM_HP} 生命的<b>圣所</b>，先把对方圣所打到 0 的一方获胜。`,
  '战场有 4 条<b>战线</b>，每条战线每方只能站 1 个单位。',
  '每回合<b>灵息</b>上限 +1（最多 8）并回满，抽 1 张牌。花灵息把手牌部署到己方空战线。先手首回合不抽牌，后手首回合多 1 点临时灵息。',
  '点<b>开战</b>结束回合：己方单位从左到右依次攻击<b>正对面</b>的敌人；对面没人就直接打圣所。',
  '被攻击的单位会<b>同时反击</b>（反击不触发贯穿和吸取）；刚部署的单位本回合不主动进攻，<b>突袭</b>除外。',
  '<b>护甲</b>：每次受伤 −护甲值（最少 1）。<b>贯穿</b>：击杀后溢出伤害打圣所。<b>吸取</b>：造成伤害时己方圣所恢复等量生命。',
  '<b>羁绊</b>只看自己场上的单位，随时重算：同主题 2 个/3 个两档；特定天使主题 + 恶魔主题合计 3 个触发混编羁绊；全天使或全恶魔还有纯阵营羁绊。',
  '羁绊成员阵亡后加成立刻消失；因此掉生命上限的单位至少保留 1 点生命。',
  `第 ${TURN_LIMIT / 2} 轮结束仍未分出胜负，圣所生命高的一方获胜。`,
];

function bondChips(ids: string[]): string {
  return ids.map((id) => `<span class="chip" style="--c:${bondColor(BOND_BY_ID[id])}">${BOND_BY_ID[id].name}</span>`).join('');
}

/** dim=true：对局中弹出的浮层，压暗并模糊战场；否则铺主视觉当背景 */
function showOverlay(html: string, dim = false): HTMLElement {
  const o = $('#overlay');
  o.innerHTML = `<div class="sheet">${html}</div>`;
  o.classList.toggle('dim', dim);
  o.classList.add('show');
  o.scrollTop = 0;
  return o;
}

/** 卡组卡片上扇形摊开的三张代表牌：费用最高的放中间 */
function deckFan(d: DeckDef): HTMLElement {
  const fan = document.createElement('div');
  fan.className = 'fan';
  const picks = [...new Set(d.cards)].map((id) => CARD_BY_ID[id]).sort((a, b) => b.cost - a.cost).slice(0, 3);
  const order = [picks[1], picks[0], picks[2]].filter(Boolean);
  order.forEach((card, i) => {
    const el = cardEl(card);
    el.classList.remove('legend');
    el.style.setProperty('--dx', `${(i - 1) * 56}px`);
    el.style.setProperty('--rot', `${(i - 1) * 9}deg`);
    el.style.setProperty('--dy', i === 1 ? '-6px' : '6px');
    el.style.zIndex = i === 1 ? '2' : '1';
    fan.appendChild(el);
  });
  return fan;
}

function showStart(): void {
  let mine = decks?.[0].id ?? 'angels';
  let foe = 'random';
  const draw = () => {
    const o = showOverlay(`
      <div class="hero">
        <img class="emblem" src="/ui/logo_emblem.png" alt="">
        <h1 class="title">翼烬战线</h1>
        <div class="subtitle">天使 vs 恶魔 · 卡牌对战</div>
      </div>
      <div class="section-title">选择你的卡组</div>
      <div class="deck-grid">${DECKS.map((d) => `
        <div class="deck side-${d.side} ${d.id === mine ? 'picked' : ''}" data-deck="${d.id}">
          <img class="crest" src="/ui/crest_${d.side}.png" alt="">
          <div class="fan-slot"></div>
          <h4>${d.name}</h4><p>${d.blurb}</p><div class="chips">${bondChips(d.bonds)}</div>
        </div>`).join('')}
      </div>
      <div class="foe-row"><span>对手</span>${[{ id: 'random', name: '随机' }, ...DECKS].map((d) => `<button class="pill ${d.id === foe ? 'picked' : ''}" data-foe="${d.id}">${d.name}</button>`).join('')}</div>
      <div class="center">
        <button class="btn ghost" id="btn-gallery">卡牌图鉴</button>
        <button class="btn" id="btn-start">开始对局</button>
        <button class="btn ghost" id="btn-rules">游戏规则</button>
      </div>`);
    o.querySelectorAll<HTMLElement>('[data-deck]').forEach((el) => {
      el.querySelector('.fan-slot')!.replaceWith(deckFan(DECK_BY_ID[el.dataset.deck!]));
      el.addEventListener('click', () => { mine = el.dataset.deck!; draw(); });
    });
    o.querySelectorAll<HTMLElement>('[data-foe]').forEach((el) => el.addEventListener('click', () => { foe = el.dataset.foe!; draw(); }));
    o.querySelector('#btn-start')!.addEventListener('click', () => {
      const foeId = foe === 'random' ? DECKS[Math.floor(Math.random() * DECKS.length)].id : foe;
      void startGame(mine, foeId);
    });
    o.querySelector('#btn-gallery')!.addEventListener('click', () => showCodex(true));
    o.querySelector('#btn-rules')!.addEventListener('click', () => showRules(true));
  };
  draw();
}

function showRules(fromStart = false): void {
  const o = showOverlay(`
    <div class="section-title">游戏规则</div>
    <div class="panel box"><ol class="rules">${RULES.map((r) => `<li>${r}</li>`).join('')}</ol></div>
    <div class="center"><button class="btn ghost" id="btn-close">返回</button></div>`, !fromStart);
  o.querySelector('#btn-close')!.addEventListener('click', () => (fromStart ? showStart() : showCodex(false)));
}

function showCodex(fromStart = false): void {
  const themes = Object.keys(THEME_INFO) as (keyof typeof THEME_INFO)[];
  const o = showOverlay(`
    <div class="section-title">羁绊</div>
    <div class="codex-grid" id="codex-bonds"></div>
    <div class="section-title">卡牌 · ${CARDS.length} 张</div>
    ${themes.map((t) => `
      <div class="theme-row" style="color:${THEME_INFO[t].color}"><img src="/ui/theme_${t}.png" alt="">${THEME_INFO[t].name}<small>${THEME_INFO[t].faction === 'angel' ? '天使' : '恶魔'} · ${THEME_INFO[t].blurb}</small></div>
      <div class="gallery" data-theme="${t}"></div>`).join('')}
    <div class="center"><button class="btn ghost" id="btn-rules">游戏规则</button><button class="btn" id="btn-close">返回</button></div>`, !fromStart);
  const sig = fromStart ? [] : view.bonds[0];
  for (const def of BONDS) o.querySelector('#codex-bonds')!.appendChild(bondEl(def, sig, null));
  for (const card of CARDS) o.querySelector(`.gallery[data-theme="${card.theme}"]`)!.appendChild(cardEl(card));
  o.querySelector('#btn-close')!.addEventListener('click', () => (fromStart ? showStart() : o.classList.remove('show')));
  o.querySelector('#btn-rules')!.addEventListener('click', () => showRules(fromStart));
}

function showResult(): void {
  const w = state.winner;
  const title = w === 0 ? '胜　利' : w === 1 ? '落　败' : '平　局';
  const o = showOverlay(`
    <div class="result ${w === 0 ? 'win' : 'lose'}">
      <img class="emblem" src="/ui/result_${w === 0 ? 'victory' : 'defeat'}.png" alt="">
      <h1 class="title">${title}</h1>
      <div class="subtitle">${decks[0].name} vs ${decks[1].name}</div>
      <div><div class="result-stats">
        <div><b>${Math.ceil(state.turn / 2)}</b>轮数</div>
        <div><b>${state.players[0].sanctum}</b>我方圣所</div>
        <div><b>${state.players[1].sanctum}</b>对手圣所</div>
      </div></div>
      <div class="center"><button class="btn ghost" id="btn-rematch">同卡组重赛</button><button class="btn" id="btn-again">再来一局</button></div>
    </div>`, true);
  o.querySelector('#btn-again')!.addEventListener('click', () => showStart());
  o.querySelector('#btn-rematch')!.addEventListener('click', () => void startGame(decks[0].id, decks[1].id));
}

async function startGame(mineId: string, foeId: string, seed = (Math.random() * 2 ** 31) | 0): Promise<void> {
  gameSeq++;
  decks = [DECK_BY_ID[mineId], DECK_BY_ID[foeId]];
  $('#overlay').classList.remove('show');
  $('#log').innerHTML = '';
  $('#toasts').innerHTML = '';
  field.reset(decks[0].side, decks[1].side);
  const created = createGame(decks[0].cards, decks[1].cards, seed);
  state = created.state;
  selected = null;
  view.sanctum = [SANCTUM_HP, SANCTUM_HP];
  view.energy = [0, 0];
  view.maxEnergy = [0, 0];
  view.hand = [];
  view.bonds = [[], []];
  log(`对局开始：${decks[0].name} vs ${decks[1].name}。你先手。`, 'sys');
  await play(created.events);
}

// 调试入口：方便在控制台或自动化检查里读状态
Object.assign(window, {
  __avd: {
    get state() { return state; },
    get busy() { return busy; },
    start: startGame,
    select,
    play: playerPlay,
    endTurn: playerEndTurn,
    inspect: (pos: [number, number, number], look: [number, number, number]) => field.inspect(pos, look),
    /** 只看造型：把指定卡牌直接摆上场（不走规则） */
    async showcase(mine: string[], foe: string[]) {
      gameSeq++;
      $('#overlay').classList.remove('show');
      field.reset('angel', 'demon');
      let uid = 9000;
      for (const [player, ids] of [[0, mine], [1, foe]] as const) {
        for (const [lane, id] of ids.entries()) void field.summon(player, lane, uid++, CARD_BY_ID[id]);
      }
    },
  },
});

void preloadModels().finally(() => showStart());
