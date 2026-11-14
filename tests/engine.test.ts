import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/game/ai';
import { activeBonds, bondModFor, bondTurnEndBurn, bondTurnStartHeal, BONDS, type BondMember } from '../src/game/bonds';
import { CARD_BY_ID, CARDS, THEME_INFO } from '../src/game/cards';
import { DECKS } from '../src/game/decks';
import {
  canPlay, createGame, endTurn, LANES, MAX_ENERGY, playCard, SANCTUM_HP, unitStats,
  type GameState, type PlayerId, type Unit,
} from '../src/game/engine';

// —— 测试工具：直接摆出想要的局面 ——
function blank(): GameState {
  const { state } = createGame([], [], 1);
  for (const p of state.players) {
    p.energy = 10;
    p.maxEnergy = 8;
  }
  return state;
}
function put(state: GameState, owner: PlayerId, lane: number, cardId: string, opts: Partial<Unit> = {}): Unit {
  const unit: Unit = { uid: state.nextUid++, cardId, owner, lane, damage: 0, ready: true, ...opts };
  state.players[owner].board[lane] = unit;
  return unit;
}
const m = (...ids: string[]): BondMember[] => ids.map((id) => ({ theme: CARD_BY_ID[id].theme, faction: CARD_BY_ID[id].faction }));
const bondIds = (members: BondMember[]) => activeBonds(members).map((b) => `${b.def.id}:${b.tier}`);

describe('卡牌数据', () => {
  it('至少 20 张，天使恶魔各半，每阵营至少 3 个主题', () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(20);
    const angels = CARDS.filter((c) => c.faction === 'angel');
    const demons = CARDS.filter((c) => c.faction === 'demon');
    expect(angels.length).toBe(demons.length);
    expect(new Set(angels.map((c) => c.theme)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(demons.map((c) => c.theme)).size).toBeGreaterThanOrEqual(3);
  });
  it('id 唯一，主题与阵营对得上', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) expect(THEME_INFO[c.theme].faction).toBe(c.faction);
  });
  it('预设卡组里的牌都存在', () => {
    for (const d of DECKS) for (const id of d.cards) expect(CARD_BY_ID[id], `${d.id}:${id}`).toBeDefined();
  });
});

describe('羁绊计算', () => {
  it('至少 4 种羁绊，含同主题天使、同主题恶魔、天使+恶魔混编', () => {
    expect(BONDS.length).toBeGreaterThanOrEqual(4);
    expect(BONDS.some((b) => b.kind === 'theme' && THEME_INFO[b.themes[0]].faction === 'angel')).toBe(true);
    expect(BONDS.some((b) => b.kind === 'theme' && THEME_INFO[b.themes[0]].faction === 'demon')).toBe(true);
    expect(BONDS.some((b) => b.kind === 'mixed')).toBe(true);
  });
  it('同主题天使：1 个不触发，2 个一档，3 个二档', () => {
    expect(bondIds(m('icon_acolyte'))).toEqual([]);
    expect(bondIds(m('icon_acolyte', 'icon_choir'))).toEqual(['hymn:1']);
    expect(bondIds(m('icon_acolyte', 'icon_choir', 'icon_shield'))).toContain('hymn:2');
  });
  it('同主题恶魔：熔渊 2 个 +1 攻，3 个追加灼烧', () => {
    const two = m('lava_imp', 'lava_hound');
    expect(bondModFor(two[0], two).atk).toBe(1);
    expect(bondTurnEndBurn(two)).toBe(0);
    const three = m('lava_imp', 'lava_hound', 'lava_brute');
    // 3 个恶魔且无天使，同时触发「万魔殿」+1 攻 +1 生命
    expect(bondIds(three)).toEqual(['boil:2', 'pandemonium:1']);
    expect(bondModFor(three[0], three)).toMatchObject({ atk: 2, hp: 1 });
    expect(bondTurnEndBurn(three)).toBe(2);
  });
  it('加成只给对应主题的单位', () => {
    const members = m('mech_drone', 'mech_sentinel', 'icon_acolyte');
    // 3 天使无恶魔 → 天穹 +1/+1 给全体；协议 +1 攻只给机枢
    expect(bondModFor(members[0], members)).toMatchObject({ atk: 2, hp: 1 });
    expect(bondModFor(members[2], members)).toMatchObject({ atk: 1, hp: 1 });
  });
  it('混编「同炉」：机枢 + 蚀械合计 3 个且各至少 1 个', () => {
    expect(bondIds(m('mech_drone', 'rust_mite'))).toEqual([]);
    expect(bondIds(m('mech_drone', 'mech_sentinel', 'mech_lancer'))).not.toContain('forge:1');
    const members = m('mech_drone', 'rust_mite', 'rust_saw');
    expect(bondIds(members)).toContain('forge:1');
    expect(bondModFor(members[0], members)).toMatchObject({ atk: 1, hp: 2 });
  });
  it('混编「墨夜」给云篆与夜棘加攻并赋予吸取', () => {
    const members = m('ink_crane', 'goth_bat', 'goth_organ');
    const mod = bondModFor(members[0], members);
    expect(mod.atk).toBe(1);
    expect(mod.keywords).toContain('lifesteal');
  });
  it('混编「黄昏契约」：2 天使 + 2 恶魔，全体 +1 攻', () => {
    expect(bondIds(m('icon_acolyte', 'mech_drone', 'lava_imp'))).not.toContain('dusk:1');
    const members = m('icon_acolyte', 'mech_drone', 'lava_imp', 'goth_bat');
    expect(bondIds(members)).toEqual(['dusk:1']);
    for (const x of members) expect(bondModFor(x, members).atk).toBe(1);
  });
  it('纯阵营羁绊混入对方阵营就失效', () => {
    expect(bondIds(m('icon_acolyte', 'mech_drone', 'ink_crane'))).toEqual(['firmament:1']);
    expect(bondIds(m('icon_acolyte', 'mech_drone', 'ink_crane', 'lava_imp'))).not.toContain('firmament:1');
  });
  it('圣像三件套：回合开始回复；圣火：灼烧 1', () => {
    expect(bondTurnStartHeal(m('icon_acolyte', 'icon_choir', 'icon_shield'))).toBe(3);
    expect(bondTurnEndBurn(m('icon_acolyte', 'icon_choir', 'lava_imp'))).toBe(1);
  });
});

describe('开局与费用', () => {
  it('双方起手 4 张，先手首回合不抽牌、1 点灵息；后手首回合多 1 点临时灵息', () => {
    const deck = DECKS[0].cards;
    const { state } = createGame(deck, deck, 42);
    expect(state.players[0].hand.length).toBe(4);
    expect(state.players[1].hand.length).toBe(4);
    expect(state.players[0].energy).toBe(1);
    expect(state.turn).toBe(1);
    endTurn(state);
    expect(state.players[1].hand.length).toBe(5);
    expect(state.players[1].maxEnergy).toBe(1);
    expect(state.players[1].energy).toBe(2);
    endTurn(state);
    endTurn(state);
    expect(state.players[1].energy).toBe(2);
  });
  it('同一种子洗牌结果相同', () => {
    const deck = DECKS[1].cards;
    expect(createGame(deck, deck, 7).state.players[0].hand).toEqual(createGame(deck, deck, 7).state.players[0].hand);
  });
  it('灵息不够不能出牌；出牌扣费', () => {
    const s = blank();
    s.players[0].hand = ['lava_tyrant', 'lava_imp'];
    s.players[0].energy = 3;
    expect(canPlay(s, 0, 0, 0)).toBe(false);
    expect(() => playCard(s, 0, 0)).toThrow();
    expect(canPlay(s, 0, 1, 0)).toBe(true);
    playCard(s, 1, 0);
    expect(s.players[0].energy).toBe(2);
    expect(s.players[0].hand).toEqual(['lava_tyrant']);
  });
  it('战线被占不能部署；不是自己的回合不能出牌', () => {
    const s = blank();
    put(s, 0, 2, 'icon_acolyte');
    s.players[0].hand = ['icon_choir'];
    s.players[1].hand = ['lava_imp'];
    expect(canPlay(s, 0, 0, 2)).toBe(false);
    expect(canPlay(s, 0, 0, LANES)).toBe(false);
    expect(canPlay(s, 1, 0, 0)).toBe(false);
  });
  it('灵息每回合 +1 并回满，上限 8', () => {
    const s = blank();
    s.turn = 11; // 避开后手首回合的临时灵息
    s.players[0].maxEnergy = 1;
    s.players[1].maxEnergy = 7;
    endTurn(s);
    expect(s.players[1].maxEnergy).toBe(8);
    expect(s.players[1].energy).toBe(8);
    endTurn(s);
    expect(s.players[0].maxEnergy).toBe(2);
    endTurn(s);
    expect(s.players[1].maxEnergy).toBe(MAX_ENERGY);
  });
});

describe('战斗与伤害', () => {
  it('对面没人就打圣所', () => {
    const s = blank();
    put(s, 0, 0, 'lava_brute'); // 5 攻
    endTurn(s);
    expect(s.players[1].sanctum).toBe(SANCTUM_HP - 5);
  });
  it('被攻击的单位活下来就会反击', () => {
    const s = blank();
    const a = put(s, 0, 1, 'icon_shield'); // 3/6 护甲 1
    const b = put(s, 1, 1, 'lava_brute'); // 5/5
    endTurn(s);
    expect(b.damage).toBe(3);
    expect(a.damage).toBe(4); // 5 - 护甲 1
  });
  it('一击打死的单位来不及反击', () => {
    const s = blank();
    const a = put(s, 0, 2, 'mech_drone'); // 2/1
    put(s, 1, 2, 'lava_hound'); // 3/2
    endTurn(s);
    expect(s.players[1].board[2]).toBeNull();
    expect(s.players[0].board[2]).toBe(a);
    expect(a.damage).toBe(0);
  });
  it('反击不触发吸取', () => {
    const s = blank();
    s.players[1].sanctum = 10;
    const a = put(s, 0, 0, 'mech_drone'); // 2/1
    const b = put(s, 1, 0, 'goth_bat'); // 1/3 吸取
    endTurn(s);
    expect(b.damage).toBe(2);
    expect(s.players[0].board[0]).toBeNull(); // 被反击打死
    expect(a.damage).toBe(1);
    expect(s.players[1].sanctum).toBe(10);
  });
  it('没被攻击的单位不会在对方回合出手', () => {
    const s = blank();
    put(s, 1, 3, 'lava_brute');
    endTurn(s);
    expect(s.players[0].sanctum).toBe(SANCTUM_HP);
  });
  it('刚部署的单位本回合不参战，突袭除外', () => {
    const s = blank();
    s.players[0].hand = ['icon_acolyte', 'mech_drone'];
    playCard(s, 0, 0); // 持烛侍童，无突袭
    playCard(s, 0, 1); // 巡光无人翼，突袭 2 攻
    endTurn(s);
    expect(s.players[1].sanctum).toBe(SANCTUM_HP - 2);
  });
  it('护甲减伤，最少造成 1 点', () => {
    const s = blank();
    put(s, 0, 0, 'icon_acolyte'); // 1 攻
    put(s, 0, 1, 'lava_brute'); // 5 攻
    const shield = put(s, 1, 0, 'goth_thorn'); // 护甲 1
    const shield2 = put(s, 1, 1, 'goth_thorn');
    endTurn(s);
    expect(shield.damage).toBe(1);
    expect(shield2.damage).toBe(4);
  });
  it('击杀后单位离场；贯穿把溢出伤害打到圣所', () => {
    const s = blank();
    put(s, 0, 0, 'mech_lancer'); // 4 攻 贯穿
    put(s, 0, 1, 'lava_brute'); // 5 攻 无贯穿
    put(s, 1, 0, 'lava_imp'); // 1 生命
    put(s, 1, 1, 'lava_imp');
    endTurn(s);
    expect(s.players[1].board[0]).toBeNull();
    expect(s.players[1].board[1]).toBeNull();
    expect(s.players[1].sanctum).toBe(SANCTUM_HP - 3);
  });
  it('吸取按实际造成的伤害回复圣所，不超过上限', () => {
    const s = blank();
    s.players[0].sanctum = 10;
    put(s, 0, 0, 'goth_countess'); // 4 攻 吸取
    put(s, 1, 0, 'lava_imp'); // 只有 1 生命
    put(s, 0, 1, 'goth_bat'); // 1 攻 吸取，打圣所
    endTurn(s);
    expect(s.players[0].sanctum).toBe(10 + 1 + 1);
  });
  it('圣所归零即分出胜负，之后不再结算', () => {
    const s = blank();
    s.players[1].sanctum = 3;
    put(s, 0, 0, 'lava_brute');
    put(s, 0, 1, 'lava_brute');
    const events = endTurn(s);
    expect(s.winner).toBe(0);
    expect(events.filter((e) => e.t === 'attack').length).toBe(1);
    expect(endTurn(s)).toEqual([]);
  });
});

describe('入场效果', () => {
  it('打击：对正对面的单位造成伤害，可击杀', () => {
    const s = blank();
    put(s, 1, 2, 'lava_imp');
    s.players[0].hand = ['rust_core']; // 打击 2
    playCard(s, 0, 2);
    expect(s.players[1].board[2]).toBeNull();
  });
  it('回复圣所 / 抽牌 / 治疗友军', () => {
    const s = blank();
    s.players[0].sanctum = 20;
    s.players[0].deck = ['lava_imp', 'lava_hound'];
    const hurt = put(s, 0, 3, 'icon_shield', { damage: 3 });
    s.players[0].hand = ['icon_choir', 'ink_crane', 'ink_lotus'];
    playCard(s, 0, 0);
    expect(s.players[0].sanctum).toBe(22);
    playCard(s, 0, 1);
    expect(s.players[0].hand).toContain('lava_imp');
    playCard(s, s.players[0].hand.indexOf('ink_lotus'), 2);
    expect(hurt.damage).toBe(1);
  });
});

describe('羁绊在对局中生效', () => {
  it('第二个同主题单位上场后属性立刻变化', () => {
    const s = blank();
    const a = put(s, 0, 0, 'icon_acolyte'); // 1/3
    expect(unitStats(s, a).maxHp).toBe(3);
    s.players[0].hand = ['icon_choir'];
    const events = playCard(s, 0, 1);
    expect(unitStats(s, a).maxHp).toBe(5);
    expect(unitStats(s, a).bonus.hp).toBe(2);
    expect(events).toContainEqual({ t: 'bonds', player: 0, gained: ['hymn:1'], lost: [] });
  });
  it('羁绊加的攻击计入战斗伤害', () => {
    const s = blank();
    put(s, 0, 0, 'lava_imp'); // 2 攻
    put(s, 0, 1, 'lava_hound'); // 3 攻，沸腾各 +1
    endTurn(s);
    expect(s.players[1].sanctum).toBe(SANCTUM_HP - (3 + 4));
  });
  it('羁绊成员阵亡后加成消失，受伤单位至少保留 1 生命', () => {
    const s = blank();
    const keeper = put(s, 1, 0, 'icon_acolyte', { damage: 4 }); // 3+2 生命，剩 1
    put(s, 1, 1, 'icon_choir', { damage: 4 }); // 3+2 生命，剩 1
    put(s, 0, 1, 'lava_brute');
    const events = endTurn(s);
    expect(s.players[1].board[1]).toBeNull();
    expect(events).toContainEqual({ t: 'bonds', player: 1, gained: [], lost: ['hymn:1'] });
    const stats = unitStats(s, keeper);
    expect(stats.maxHp).toBe(3);
    expect(stats.hp).toBe(1);
  });
  it('沸腾二档：开战后灼烧敌方圣所', () => {
    const s = blank();
    for (const [i, id] of ['lava_imp', 'lava_hound', 'lava_brute'].entries()) put(s, 0, i, id, { ready: false });
    const events = endTurn(s);
    expect(s.players[1].sanctum).toBe(SANCTUM_HP - 2);
    expect(events).toContainEqual({ t: 'sanctumDamage', player: 1, amount: 2, source: 'burn' });
  });
  it('颂歌二档：自己回合开始时圣所回复', () => {
    const s = blank();
    s.players[1].sanctum = 10;
    for (const [i, id] of ['icon_acolyte', 'icon_choir', 'icon_shield'].entries()) put(s, 1, i, id);
    endTurn(s);
    expect(s.players[1].sanctum).toBe(13);
  });
});

describe('电脑对手', () => {
  it('能自己打完一整局并分出胜负', () => {
    for (const seed of [1, 2, 3]) {
      const { state } = createGame(DECKS[0].cards, DECKS[1].cards, seed);
      let guard = 0;
      while (state.winner === null && guard++ < 200) {
        let move;
        while ((move = chooseMove(state))) playCard(state, move.handIndex, move.lane);
        endTurn(state);
      }
      expect(state.winner).not.toBeNull();
    }
  });
  it('有斩杀机会时会出牌', () => {
    const s = blank();
    s.players[1].sanctum = 2;
    s.players[0].energy = 1;
    s.players[0].hand = ['mech_drone']; // 突袭 2 攻
    const move = chooseMove(s);
    expect(move).not.toBeNull();
    playCard(s, move!.handIndex, move!.lane);
    endTurn(s);
    expect(s.winner).toBe(0);
  });
});
