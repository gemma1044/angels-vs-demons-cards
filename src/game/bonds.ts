// 羁绊：只看「自己场上有哪些单位」，纯函数，可单测。
// 三类：同主题羁绊（2 个 / 3 个两档，高档包含低档）、天使+恶魔混编羁绊、纯阵营羁绊。

import { THEME_INFO, type Faction, type Keyword, type Theme } from './cards';

export interface BondMember {
  theme: Theme;
  faction: Faction;
}

export interface StatMod {
  atk: number;
  hp: number;
  armor: number;
  keywords: Keyword[];
}

export interface BondTier {
  /** 界面上显示的条件，如 “2 圣像” */
  need: string;
  /** 界面上显示的效果文字 */
  text: string;
  test: (c: BondCounts) => boolean;
  /** 给哪些单位加属性；'all' 表示己方全体 */
  targets: Theme[] | 'all';
  mod?: Partial<StatMod>;
  /** 己方回合开始时为圣所恢复 */
  healOnTurnStart?: number;
  /** 己方开战结束后灼烧敌方圣所 */
  burnOnTurnEnd?: number;
}

export interface BondDef {
  id: string;
  name: string;
  kind: 'theme' | 'mixed' | 'faction';
  /** 参与计数的主题（界面用来画进度） */
  themes: Theme[];
  tiers: BondTier[];
}

export interface BondCounts {
  theme: Record<Theme, number>;
  angel: number;
  demon: number;
}

const themeBond = (
  id: string,
  name: string,
  theme: Theme,
  t1: Omit<BondTier, 'need' | 'test' | 'targets'>,
  t2: Omit<BondTier, 'need' | 'test' | 'targets'>,
): BondDef => ({
  id,
  name,
  kind: 'theme',
  themes: [theme],
  tiers: [
    { need: `2 ${THEME_INFO[theme].name}`, test: (c) => c.theme[theme] >= 2, targets: [theme], ...t1 },
    { need: `3 ${THEME_INFO[theme].name}`, test: (c) => c.theme[theme] >= 3, targets: [theme], ...t2 },
  ],
});

const pairBond = (id: string, name: string, a: Theme, b: Theme, tier: Omit<BondTier, 'need' | 'test' | 'targets'>): BondDef => ({
  id,
  name,
  kind: 'mixed',
  themes: [a, b],
  tiers: [
    {
      need: `${THEME_INFO[a].name} + ${THEME_INFO[b].name} 共 3`,
      test: (c) => c.theme[a] >= 1 && c.theme[b] >= 1 && c.theme[a] + c.theme[b] >= 3,
      targets: [a, b],
      ...tier,
    },
  ],
});

export const BONDS: BondDef[] = [
  // —— 同主题天使 ——
  themeBond('hymn', '颂歌', 'icon',
    { text: '圣像单位 +2 生命', mod: { hp: 2 } },
    { text: '每个己方回合开始，圣所恢复 3', healOnTurnStart: 3 }),
  themeBond('protocol', '协议', 'mech',
    { text: '机枢单位 +1 攻击', mod: { atk: 1 } },
    { text: '机枢单位 +1 护甲', mod: { armor: 1 } }),
  themeBond('drift', '流云', 'ink',
    { text: '云篆单位 +1 攻击 +1 生命', mod: { atk: 1, hp: 1 } },
    { text: '云篆单位获得「贯穿」', mod: { keywords: ['pierce'] } }),
  // —— 同主题恶魔 ——
  themeBond('boil', '沸腾', 'lava',
    { text: '熔渊单位 +1 攻击', mod: { atk: 1 } },
    { text: '每次己方开战后，灼烧敌方圣所 2', burnOnTurnEnd: 2 }),
  themeBond('feast', '血宴', 'goth',
    { text: '夜棘单位获得「吸取」', mod: { keywords: ['lifesteal'] } },
    { text: '夜棘单位 +1 攻击 +2 生命', mod: { atk: 1, hp: 2 } }),
  themeBond('overload', '过载', 'rust',
    { text: '蚀械单位 +2 生命', mod: { hp: 2 } },
    { text: '蚀械单位 +1 攻击 +1 护甲', mod: { atk: 1, armor: 1 } }),
  // —— 天使 + 恶魔混编 ——
  pairBond('forge', '同炉', 'mech', 'rust', { text: '机枢与蚀械单位 +1 攻击 +2 生命', mod: { atk: 1, hp: 2 } }),
  pairBond('holyfire', '圣火', 'icon', 'lava', { text: '圣像与熔渊单位 +2 生命；开战后灼烧敌方圣所 1', mod: { hp: 2 }, burnOnTurnEnd: 1 }),
  pairBond('inknight', '墨夜', 'ink', 'goth', { text: '云篆与夜棘单位 +1 攻击 +2 生命并获得「吸取」', mod: { atk: 1, hp: 2, keywords: ['lifesteal'] } }),
  // —— 纯阵营 ——
  {
    id: 'firmament',
    name: '天穹',
    kind: 'faction',
    themes: [],
    tiers: [
      { need: '3 天使且无恶魔', text: '己方全体 +1 攻击 +1 生命', test: (c) => c.angel >= 3 && c.demon === 0, targets: 'all', mod: { atk: 1, hp: 1 } },
    ],
  },
  {
    id: 'pandemonium',
    name: '万魔殿',
    kind: 'faction',
    themes: [],
    tiers: [
      { need: '3 恶魔且无天使', text: '己方全体 +1 攻击 +1 生命', test: (c) => c.demon >= 3 && c.angel === 0, targets: 'all', mod: { atk: 1, hp: 1 } },
    ],
  },
  {
    id: 'dusk',
    name: '黄昏契约',
    kind: 'mixed',
    themes: [],
    tiers: [
      {
        need: '2 天使 + 2 恶魔',
        text: '己方全体 +1 攻击',
        test: (c) => c.angel >= 2 && c.demon >= 2,
        targets: 'all',
        mod: { atk: 1 },
      },
    ],
  },
];

export const BOND_BY_ID: Record<string, BondDef> = Object.fromEntries(BONDS.map((b) => [b.id, b]));

export function countMembers(members: BondMember[]): BondCounts {
  const theme: Record<Theme, number> = { icon: 0, mech: 0, ink: 0, lava: 0, goth: 0, rust: 0 };
  let angel = 0;
  let demon = 0;
  for (const m of members) {
    theme[m.theme]++;
    if (m.faction === 'angel') angel++;
    else demon++;
  }
  return { theme, angel, demon };
}

export interface ActiveBond {
  def: BondDef;
  /** 已达成的档数：1 或 2（混编羁绊只有 1） */
  tier: number;
}

/** 当前生效的羁绊（只返回至少达成一档的） */
export function activeBonds(members: BondMember[]): ActiveBond[] {
  const counts = countMembers(members);
  const out: ActiveBond[] = [];
  for (const def of BONDS) {
    let tier = 0;
    for (let i = 0; i < def.tiers.length; i++) {
      if (def.tiers[i].test(counts)) tier = i + 1;
      else break;
    }
    if (tier > 0) out.push({ def, tier });
  }
  return out;
}

/** 生效羁绊里已达成的所有档（高档包含低档） */
export function activeTiers(members: BondMember[]): BondTier[] {
  return activeBonds(members).flatMap((b) => b.def.tiers.slice(0, b.tier));
}

/** 某个单位从羁绊里拿到的属性加成 */
export function bondModFor(member: BondMember, members: BondMember[]): StatMod {
  const mod: StatMod = { atk: 0, hp: 0, armor: 0, keywords: [] };
  for (const tier of activeTiers(members)) {
    if (!tier.mod) continue;
    if (tier.targets !== 'all' && !tier.targets.includes(member.theme)) continue;
    mod.atk += tier.mod.atk ?? 0;
    mod.hp += tier.mod.hp ?? 0;
    mod.armor += tier.mod.armor ?? 0;
    for (const k of tier.mod.keywords ?? []) if (!mod.keywords.includes(k)) mod.keywords.push(k);
  }
  return mod;
}

export function bondTurnStartHeal(members: BondMember[]): number {
  return activeTiers(members).reduce((s, t) => s + (t.healOnTurnStart ?? 0), 0);
}

export function bondTurnEndBurn(members: BondMember[]): number {
  return activeTiers(members).reduce((s, t) => s + (t.burnOnTurnEnd ?? 0), 0);
}

/** 用于比较羁绊变化的签名，如 ["hymn:2","dusk:1"] */
export function bondSignature(members: BondMember[]): string[] {
  return activeBonds(members).map((b) => `${b.def.id}:${b.tier}`);
}
