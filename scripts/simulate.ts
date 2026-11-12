// AI 自对弈：检查各卡组胜率和对局长度，用来调数值。npm run sim
import { chooseMove } from '../src/game/ai';
import { DECKS } from '../src/game/decks';
import { createGame, endTurn, playCard } from '../src/game/engine';

const N = Number(process.argv[2] ?? 60);

function playOne(a: string[], b: string[], seed: number) {
  const { state } = createGame(a, b, seed);
  let guard = 0;
  while (state.winner === null && guard++ < 500) {
    let move;
    while ((move = chooseMove(state))) playCard(state, move.handIndex, move.lane);
    endTurn(state);
  }
  return state;
}

const rows: string[] = [];
const total: Record<string, { w: number; n: number }> = {};
let firstWins = 0;
let games = 0;
let turns = 0;
let blowouts = 0;
let loserDealt = 0;
for (const A of DECKS) {
  for (const B of DECKS) {
    let w = 0;
    let t = 0;
    for (let i = 0; i < N; i++) {
      const s = playOne(A.cards, B.cards, 1000 + i * 7919);
      if (s.winner === 0) w++;
      t += s.turn;
      games++;
      turns += s.turn;
      const dealt = 30 - Math.max(s.players[0].sanctum, s.players[1].sanctum);
      loserDealt += dealt;
      if (dealt <= 3) blowouts++;
      if (s.winner === 0) firstWins++;
      for (const [d, won] of [[A.id, s.winner === 0], [B.id, s.winner === 1]] as const) {
        total[d] ??= { w: 0, n: 0 };
        total[d].n++;
        if (won) total[d].w++;
      }
    }
    rows.push(`${A.name}(先) vs ${B.name}: 先手胜率 ${((w / N) * 100).toFixed(0)}%  平均 ${(t / N).toFixed(1)} 回合`);
  }
}
console.log(rows.join('\n'));
console.log('—— 卡组总胜率 ——');
for (const d of DECKS) console.log(`${d.name}: ${((total[d.id].w / total[d.id].n) * 100).toFixed(1)}%`);
console.log(`败方平均打掉胜方 ${(loserDealt / games).toFixed(1)} 血；败方伤害 ≤3 的碾压局占 ${((blowouts / games) * 100).toFixed(0)}%`);
console.log(`先手总胜率 ${((firstWins / games) * 100).toFixed(1)}%，平均 ${(turns / games).toFixed(1)} 回合/局（双方回合合计）`);
