// 规则引擎：纯数据 + 纯函数式的状态变更，不依赖 DOM / Three。
// 每个动作返回事件列表，界面按事件顺序播放动画。
//
// 规则摘要
// - 双方各有一座圣所（30 生命），4 条战线，每条战线每方最多 1 个单位。
// - 每回合：灵息上限 +1（最多 8）并回满，抽 1 张牌；花灵息把手牌部署到己方空战线。
// - 点「开战」结束回合：己方单位从左到右依次攻击正对面的敌方单位；对面没人就打敌方圣所。
//   被攻击的单位会同时反击（反击不触发贯穿/吸取）；刚部署的单位本回合不主动进攻，除非有「突袭」。
// - 护甲：每次受到的伤害 -护甲值，最少 1。
// - 羁绊随场上单位实时重算；羁绊消失导致生命上限下降时，单位至少保留 1 点生命。
// - 圣所先归零的一方落败；第 40 回合仍未分胜负，圣所生命高者胜。

import { CARD_BY_ID, type CardDef, type Keyword } from './cards';
import { bondModFor, bondSignature, bondTurnEndBurn, bondTurnStartHeal, type BondMember } from './bonds';

export const LANES = 4;
export const SANCTUM_HP = 30;
export const MAX_ENERGY = 8;
export const HAND_LIMIT = 8;
export const TURN_LIMIT = 40;
export const OPENING_HAND = 4;

export type PlayerId = 0 | 1;

export interface Unit {
  uid: number;
  cardId: string;
  owner: PlayerId;
  lane: number;
  /** 已受到的伤害；当前生命 = 生命上限 - damage */
  damage: number;
  /** 本回合是否能参战 */
  ready: boolean;
}

export interface PlayerState {
  sanctum: number;
  energy: number;
  maxEnergy: number;
  deck: string[];
  hand: string[];
  board: (Unit | null)[];
}

export interface GameState {
  players: [PlayerState, PlayerState];
  current: PlayerId;
  turn: number;
  winner: PlayerId | 'draw' | null;
  nextUid: number;
  seed: number;
}

export type GameEvent =
  | { t: 'turnStart'; player: PlayerId; turn: number; energy: number; maxEnergy: number }
  /** 场面变化后的快照：所有在场单位的实际属性 + 双方羁绊签名，界面据此刷新 */
  | { t: 'stats'; units: Record<number, UnitStats>; bonds: [string[], string[]] }
  | { t: 'draw'; player: PlayerId; cardId: string; burned: boolean }
  | { t: 'summon'; player: PlayerId; lane: number; uid: number; cardId: string }
  | { t: 'strike'; player: PlayerId; fromUid: number; targetUid: number; amount: number }
  | { t: 'attack'; player: PlayerId; lane: number; uid: number; targetUid: number | null }
  | { t: 'damage'; uid: number; amount: number }
  | { t: 'sanctumDamage'; player: PlayerId; amount: number; source: 'attack' | 'pierce' | 'burn' }
  | { t: 'sanctumHeal'; player: PlayerId; amount: number; source: 'card' | 'lifesteal' | 'bond' }
  | { t: 'unitHeal'; uid: number; amount: number }
  | { t: 'death'; uid: number; player: PlayerId; lane: number }
  | { t: 'bonds'; player: PlayerId; gained: string[]; lost: string[] }
  | { t: 'gameOver'; winner: PlayerId | 'draw' };

export interface UnitStats {
  atk: number;
  maxHp: number;
  hp: number;
  armor: number;
  keywords: Keyword[];
  /** 相对卡面的羁绊加成，界面用来标绿 */
  bonus: { atk: number; hp: number; armor: number; keywords: Keyword[] };
}

// ———————————————————— 工具 ————————————————————

/** 确定性伪随机（mulberry32），保证同一种子的对局可复现 */
export function nextRandom(state: { seed: number }): number {
  state.seed = (state.seed + 0x6d2b79f5) | 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(arr: T[], state: { seed: number }): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export function cardOf(unit: Unit): CardDef {
  return CARD_BY_ID[unit.cardId];
}

export function unitsOf(state: GameState, player: PlayerId): Unit[] {
  return state.players[player].board.filter((u): u is Unit => u !== null);
}

export function membersOf(state: GameState, player: PlayerId): BondMember[] {
  return unitsOf(state, player).map((u) => {
    const c = cardOf(u);
    return { theme: c.theme, faction: c.faction };
  });
}

export function findUnit(state: GameState, uid: number): Unit | null {
  for (const p of state.players) for (const u of p.board) if (u && u.uid === uid) return u;
  return null;
}

/** 单位的实际属性 = 卡面 + 羁绊加成 */
export function unitStats(state: GameState, unit: Unit): UnitStats {
  const card = cardOf(unit);
  const bonus = bondModFor({ theme: card.theme, faction: card.faction }, membersOf(state, unit.owner));
  const keywords = [...(card.keywords ?? [])];
  const gainedKeywords: Keyword[] = [];
  for (const k of bonus.keywords) {
    if (!keywords.includes(k)) {
      keywords.push(k);
      gainedKeywords.push(k);
    }
  }
  const maxHp = card.hp + bonus.hp;
  return {
    atk: card.atk + bonus.atk,
    maxHp,
    hp: maxHp - unit.damage,
    armor: (card.armor ?? 0) + bonus.armor,
    keywords,
    bonus: { atk: bonus.atk, hp: bonus.hp, armor: bonus.armor, keywords: gainedKeywords },
  };
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      deck: p.deck.slice(),
      hand: p.hand.slice(),
      board: p.board.map((u) => (u ? { ...u } : null)),
    })) as [PlayerState, PlayerState],
  };
}

// ———————————————————— 内部步骤 ————————————————————

function drawCard(state: GameState, player: PlayerId, events: GameEvent[]): void {
  const p = state.players[player];
  const cardId = p.deck.shift();
  if (!cardId) return;
  if (p.hand.length >= HAND_LIMIT) {
    events.push({ t: 'draw', player, cardId, burned: true });
    return;
  }
  p.hand.push(cardId);
  events.push({ t: 'draw', player, cardId, burned: false });
}

function damageSanctum(state: GameState, victim: PlayerId, amount: number, source: 'attack' | 'pierce' | 'burn', events: GameEvent[]): void {
  if (amount <= 0 || state.winner !== null) return;
  const p = state.players[victim];
  p.sanctum = Math.max(0, p.sanctum - amount);
  events.push({ t: 'sanctumDamage', player: victim, amount, source });
  if (p.sanctum <= 0) {
    state.winner = other(victim);
    events.push({ t: 'gameOver', winner: state.winner });
  }
}

function healSanctum(state: GameState, player: PlayerId, amount: number, source: 'card' | 'lifesteal' | 'bond', events: GameEvent[]): void {
  const p = state.players[player];
  const healed = Math.min(amount, SANCTUM_HP - p.sanctum);
  if (healed <= 0) return;
  p.sanctum += healed;
  events.push({ t: 'sanctumHeal', player, amount: healed, source });
}

/** 伤害结算：返回 { dealt: 实际扣掉的生命, overflow: 击杀后溢出的伤害, died } */
function damageUnit(state: GameState, target: Unit, raw: number, events: GameEvent[]): { dealt: number; overflow: number; died: boolean } {
  const stats = unitStats(state, target);
  const amount = Math.max(1, raw - stats.armor);
  const dealt = Math.min(amount, stats.hp);
  target.damage += amount;
  events.push({ t: 'damage', uid: target.uid, amount });
  const died = target.damage >= stats.maxHp;
  return { dealt, overflow: died ? amount - dealt : 0, died };
}

/** 在一次场面变化前后包一层：移除死者、重算羁绊、发羁绊变化事件、夹住残余生命 */
function withBoardChange(state: GameState, events: GameEvent[], change: () => Unit[]): void {
  const before: [string[], string[]] = [bondSignature(membersOf(state, 0)), bondSignature(membersOf(state, 1))];
  const dead = change();
  for (const u of dead) {
    state.players[u.owner].board[u.lane] = null;
    events.push({ t: 'death', uid: u.uid, player: u.owner, lane: u.lane });
  }
  for (const player of [0, 1] as PlayerId[]) {
    const after = bondSignature(membersOf(state, player));
    const gained = after.filter((s) => !before[player].includes(s));
    const lost = before[player].filter((s) => !after.includes(s));
    if (gained.length || lost.length) events.push({ t: 'bonds', player, gained, lost });
    // 羁绊消失导致生命上限下降：至少保留 1 点生命
    for (const u of unitsOf(state, player)) {
      const maxHp = unitStats(state, u).maxHp;
      if (u.damage >= maxHp) u.damage = maxHp - 1;
    }
  }
  events.push(statsEvent(state));
}

function statsEvent(state: GameState): GameEvent {
  const units: Record<number, UnitStats> = {};
  for (const player of [0, 1] as PlayerId[]) for (const u of unitsOf(state, player)) units[u.uid] = unitStats(state, u);
  return { t: 'stats', units, bonds: [bondSignature(membersOf(state, 0)), bondSignature(membersOf(state, 1))] };
}

function startTurn(state: GameState, player: PlayerId, events: GameEvent[]): void {
  const p = state.players[player];
  state.current = player;
  state.turn++;
  p.maxEnergy = Math.min(MAX_ENERGY, p.maxEnergy + 1);
  p.energy = p.maxEnergy;
  // 后手的第一个回合多 1 点临时灵息，补偿先手的节奏优势
  if (state.turn === 2) p.energy += 1;
  for (const u of unitsOf(state, player)) u.ready = true;
  events.push({ t: 'turnStart', player, turn: state.turn, energy: p.energy, maxEnergy: p.maxEnergy });
  healSanctum(state, player, bondTurnStartHeal(membersOf(state, player)), 'bond', events);
  // 先手的第一个回合不抽牌，平衡先手优势
  if (state.turn > 1) drawCard(state, player, events);
}

// ———————————————————— 对外动作 ————————————————————

export function createGame(deck0: string[], deck1: string[], seed = 1): { state: GameState; events: GameEvent[] } {
  const state: GameState = {
    players: [newPlayer(), newPlayer()],
    current: 0,
    turn: 0,
    winner: null,
    nextUid: 1,
    seed,
  };
  state.players[0].deck = shuffle(deck0, state);
  state.players[1].deck = shuffle(deck1, state);
  const events: GameEvent[] = [];
  for (let i = 0; i < OPENING_HAND; i++) drawCard(state, 0, events);
  for (let i = 0; i < OPENING_HAND; i++) drawCard(state, 1, events);
  startTurn(state, 0, events);
  return { state, events };
}

function newPlayer(): PlayerState {
  return { sanctum: SANCTUM_HP, energy: 0, maxEnergy: 0, deck: [], hand: [], board: Array(LANES).fill(null) };
}

export function canPlay(state: GameState, player: PlayerId, handIndex: number, lane: number): boolean {
  if (state.winner !== null || state.current !== player) return false;
  const p = state.players[player];
  const cardId = p.hand[handIndex];
  if (!cardId) return false;
  if (lane < 0 || lane >= LANES || p.board[lane] !== null) return false;
  return CARD_BY_ID[cardId].cost <= p.energy;
}

/** 当前玩家把手牌 handIndex 部署到 lane。不合法时抛错。 */
export function playCard(state: GameState, handIndex: number, lane: number): GameEvent[] {
  const player = state.current;
  if (!canPlay(state, player, handIndex, lane)) throw new Error('非法出牌');
  const p = state.players[player];
  const [cardId] = p.hand.splice(handIndex, 1);
  const card = CARD_BY_ID[cardId];
  p.energy -= card.cost;
  const events: GameEvent[] = [];

  const unit: Unit = { uid: state.nextUid++, cardId, owner: player, lane, damage: 0, ready: card.keywords?.includes('rush') ?? false };
  withBoardChange(state, events, () => {
    p.board[lane] = unit;
    events.push({ t: 'summon', player, lane, uid: unit.uid, cardId });
    return [];
  });

  const fx = card.onPlay;
  if (fx?.kind === 'healSanctum') healSanctum(state, player, fx.n, 'card', events);
  if (fx?.kind === 'draw') for (let i = 0; i < fx.n; i++) drawCard(state, player, events);
  if (fx?.kind === 'healAllies') {
    for (const ally of unitsOf(state, player)) {
      if (ally.uid === unit.uid || ally.damage <= 0) continue;
      const amount = Math.min(fx.n, ally.damage);
      ally.damage -= amount;
      events.push({ t: 'unitHeal', uid: ally.uid, amount });
    }
    events.push(statsEvent(state));
  }
  if (fx?.kind === 'strike') {
    const target = state.players[other(player)].board[lane];
    if (target) {
      withBoardChange(state, events, () => {
        events.push({ t: 'strike', player, fromUid: unit.uid, targetUid: target.uid, amount: fx.n });
        return damageUnit(state, target, fx.n, events).died ? [target] : [];
      });
    }
  }
  return events;
}

/** 结束当前玩家的回合：开战 → 灼烧 → 轮到对方 */
export function endTurn(state: GameState): GameEvent[] {
  if (state.winner !== null) return [];
  const events: GameEvent[] = [];
  const player = state.current;
  const enemy = other(player);

  for (let lane = 0; lane < LANES && state.winner === null; lane++) {
    const unit = state.players[player].board[lane];
    if (!unit || !unit.ready) continue;
    const stats = unitStats(state, unit);
    if (stats.atk <= 0) continue;
    const target = state.players[enemy].board[lane];
    events.push({ t: 'attack', player, lane, uid: unit.uid, targetUid: target ? target.uid : null });
    if (target) {
      let result = { dealt: 0, overflow: 0, died: false };
      // 反击与攻击同时结算：被打的单位即使阵亡也会还手（反击不触发贯穿/吸取）
      const counter = unitStats(state, target).atk;
      withBoardChange(state, events, () => {
        result = damageUnit(state, target, stats.atk, events);
        const dead = result.died ? [target] : [];
        if (counter > 0 && damageUnit(state, unit, counter, events).died) dead.push(unit);
        return dead;
      });
      if (stats.keywords.includes('lifesteal')) healSanctum(state, player, result.dealt, 'lifesteal', events);
      if (result.overflow > 0 && stats.keywords.includes('pierce')) damageSanctum(state, enemy, result.overflow, 'pierce', events);
    } else {
      damageSanctum(state, enemy, stats.atk, 'attack', events);
      if (stats.keywords.includes('lifesteal')) healSanctum(state, player, stats.atk, 'lifesteal', events);
    }
  }

  if (state.winner === null) damageSanctum(state, enemy, bondTurnEndBurn(membersOf(state, player)), 'burn', events);

  if (state.winner === null && state.turn >= TURN_LIMIT) {
    const [a, b] = state.players;
    state.winner = a.sanctum === b.sanctum ? 'draw' : a.sanctum > b.sanctum ? 0 : 1;
    events.push({ t: 'gameOver', winner: state.winner });
  }
  if (state.winner === null) startTurn(state, enemy, events);
  return events;
}
