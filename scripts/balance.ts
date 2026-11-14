// 平衡试算：比较几种反击规则，并测「新手打法」先手对电脑的胜率。npx vite-node scripts/balance.ts [每组局数]
import { chooseMove, chooseMoveEasy } from '../src/game/ai';
import { CARD_BY_ID } from '../src/game/cards';
import { DECKS } from '../src/game/decks';
import { canPlay, COMBAT, createGame, endTurn, LANES, playCard, type GameState } from '../src/game/engine';

const N = Number(process.argv[2] ?? 40);
type Policy = (s: GameState) => { handIndex: number; lane: number } | null;

/** 新手打法：能出就出，先出最贵的，放最左边的空位；不看对面是谁 */
const naive: Policy = (s) => {
  const p = s.current;
  const hand = s.players[p].hand;
  const order = hand.map((id, i) => i).sort((a, b) => CARD_BY_ID[hand[b]].cost - CARD_BY_ID[hand[a]].cost);
  for (const h of order) for (let lane = 0; lane < LANES; lane++) if (canPlay(s, p, h, lane)) return { handIndex: h, lane };
  return null;
};
/** 稍微用心的新手：同样先出最贵的，但优先放到对面有人的战线去挡 */
const blocker: Policy = (s) => {
  const p = s.current;
  const hand = s.players[p].hand;
  const order = hand.map((id, i) => i).sort((a, b) => CARD_BY_ID[hand[b]].cost - CARD_BY_ID[hand[a]].cost);
  const foe = s.players[p === 0 ? 1 : 0].board;
  const lanes = [...Array(LANES).keys()].sort((a, b) => Number(!!foe[b]) - Number(!!foe[a]));
  for (const h of order) for (const lane of lanes) if (canPlay(s, p, h, lane)) return { handIndex: h, lane };
  return null;
};

function run(first: Policy, second: Policy) {
  let w = 0, games = 0, turns = 0, blow = 0;
  const perDeck: Record<string, [number, number]> = {};
  for (const A of DECKS) for (const B of DECKS) for (let i = 0; i < N; i++) {
    const { state } = createGame(A.cards, B.cards, 5000 + i * 7919);
    let guard = 0;
    while (state.winner === null && guard++ < 500) {
      const pol = state.current === 0 ? first : second;
      let m;
      while ((m = pol(state))) playCard(state, m.handIndex, m.lane);
      endTurn(state);
    }
    games++; turns += state.turn;
    if (state.winner === 0) w++;
    if (30 - Math.max(state.players[0].sanctum, state.players[1].sanctum) <= 3) blow++;
    for (const [d, won] of [[A.id, state.winner === 0], [B.id, state.winner === 1]] as const) {
      perDeck[d] ??= [0, 0]; perDeck[d][1]++; if (won) perDeck[d][0]++;
    }
  }
  return { first: (w / games * 100).toFixed(0) + '%', turns: (turns / games).toFixed(1), blow: (blow / games * 100).toFixed(0) + '%',
    decks: DECKS.map((d) => `${d.name} ${(perDeck[d.id][0] / perDeck[d.id][1] * 100).toFixed(0)}%`).join('  ') };
}

// 确定性的随机数，保证每次试算结果一致
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const easy: Policy = (s) => chooseMoveEasy(s, rnd);

const ai = run(chooseMove, chooseMove);
console.log(`反击规则 ${COMBAT.counter}`);
console.log(`普通电脑 vs 普通电脑：先手胜率 ${ai.first}，平均 ${ai.turns} 回合，碾压局 ${ai.blow}`);
console.log(`  卡组胜率：${ai.decks}`);
for (const [name, pol] of [['无脑出牌', naive], ['会去挡人', blocker]] as const) {
  console.log(`新手（${name}，先手）：对普通电脑 ${run(pol, chooseMove).first}，对简单电脑 ${run(pol, easy).first}`);
}
const top = run(chooseMove, easy);
console.log(`普通电脑的打法（先手）对简单电脑：${top.first}`);
