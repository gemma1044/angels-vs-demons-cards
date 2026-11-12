// 电脑对手：贪心 + 两步模拟。
// 每次从「所有能出的 (手牌, 战线)」里挑一个，模拟出牌、己方开战、对手回击后局面评分最高的；
// 没有比「不出」更好的选择就停手。

import { CARD_BY_ID } from './cards';
import { canPlay, cloneState, endTurn, LANES, other, playCard, unitStats, unitsOf, type GameState, type PlayerId } from './engine';

/** 从 player 视角给局面打分 */
export function evaluate(state: GameState, player: PlayerId): number {
  if (state.winner === player) return 10000;
  if (state.winner === other(player)) return -10000;
  const side = (p: PlayerId) => {
    let v = state.players[p].sanctum * 1.2;
    for (const u of unitsOf(state, p)) {
      const s = unitStats(state, u);
      v += s.atk * 1.5 + s.hp + s.armor * 1.5 + s.keywords.length * 0.8;
    }
    v += state.players[p].hand.length * 0.6;
    return v;
  };
  return side(player) - side(other(player));
}

/** 模拟「我开战 → 对手不出牌直接开战」后的局面分，这样能看到新单位会不会被对面白打 */
function scoreAfterCombat(state: GameState, player: PlayerId): number {
  const sim = cloneState(state);
  endTurn(sim);
  const afterMine = evaluate(sim, player);
  if (sim.winner !== null) return afterMine;
  endTurn(sim);
  return afterMine * 0.5 + evaluate(sim, player) * 0.5;
}

export interface AiMove {
  handIndex: number;
  lane: number;
}

/** 选出下一步出牌；返回 null 表示该结束回合了 */
export function chooseMove(state: GameState): AiMove | null {
  const player = state.current;
  const hand = state.players[player].hand;
  let best: AiMove | null = null;
  // 留着灵息不花没有收益，所以给「不出牌」一个略低的基准
  let bestScore = scoreAfterCombat(state, player) - 0.5;
  const seen = new Set<string>();
  for (let h = 0; h < hand.length; h++) {
    for (let lane = 0; lane < LANES; lane++) {
      if (!canPlay(state, player, h, lane)) continue;
      const key = `${hand[h]}@${lane}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sim = cloneState(state);
      playCard(sim, h, lane);
      // 费用高的牌略微优先，避免总是先下小怪卡住大怪
      const score = scoreAfterCombat(sim, player) + CARD_BY_ID[hand[h]].cost * 0.15;
      if (score > bestScore) {
        bestScore = score;
        best = { handIndex: h, lane };
      }
    }
  }
  return best;
}
