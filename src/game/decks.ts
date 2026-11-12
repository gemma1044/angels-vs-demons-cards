import { CARDS, type Theme } from './cards';

export interface DeckDef {
  id: string;
  name: string;
  /** 半场与圣所的配色 */
  side: 'angel' | 'demon' | 'dusk';
  blurb: string;
  /** 开局界面展示的主打羁绊 */
  bonds: string[];
  cards: string[];
}

const ids = (...themes: Theme[]) => CARDS.filter((c) => themes.includes(c.theme)).map((c) => c.id);
const twice = (list: string[]) => [...list, ...list];

export const DECKS: DeckDef[] = [
  {
    id: 'angels',
    side: 'angel',
    name: '圣翼军团',
    blurb: '纯天使：圣像续航、机枢护甲、云篆贯穿。凑齐同主题拿高档羁绊。',
    bonds: ['hymn', 'protocol', 'drift'],
    cards: twice(ids('icon', 'mech', 'ink')),
  },
  {
    id: 'demons',
    side: 'demon',
    name: '深渊军团',
    blurb: '纯恶魔：熔渊灼烧、夜棘吸取、蚀械厚重。进攻性最强。',
    bonds: ['boil', 'feast', 'overload'],
    cards: twice(ids('lava', 'goth', 'rust')),
  },
  {
    id: 'forge',
    side: 'dusk',
    name: '同炉黄昏',
    blurb: '混编：机枢天使 + 蚀械恶魔触发「同炉」，再配圣像与熔渊凑「圣火」「黄昏契约」。',
    bonds: ['forge', 'holyfire', 'dusk'],
    cards: twice([...ids('mech', 'rust'), 'icon_choir', 'icon_shield', 'lava_imp', 'lava_brute']),
  },
  {
    id: 'inknight',
    side: 'dusk',
    name: '墨夜协奏',
    blurb: '混编：云篆天使 + 夜棘恶魔触发「墨夜」，全员吸取打消耗。',
    bonds: ['inknight', 'drift', 'feast', 'dusk'],
    cards: twice([...ids('ink', 'goth'), 'mech_drone', 'mech_sentinel', 'lava_imp', 'lava_hound']),
  },
];

export const DECK_BY_ID: Record<string, DeckDef> = Object.fromEntries(DECKS.map((d) => [d.id, d]));
