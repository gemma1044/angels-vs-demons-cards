// 卡牌数据：天使 3 个主题 + 恶魔 3 个主题，每主题 4 张，共 24 张。
// 这里只放数据，不放规则；规则在 engine.ts / bonds.ts。

export type Faction = 'angel' | 'demon';
export type Theme = 'icon' | 'mech' | 'ink' | 'lava' | 'goth' | 'rust';
export type Keyword = 'rush' | 'pierce' | 'lifesteal';

export type PlayEffect =
  | { kind: 'healSanctum'; n: number }
  | { kind: 'healAllies'; n: number }
  | { kind: 'strike'; n: number } // 对正对面的敌方单位造成 n 点伤害（对面没人则无效）
  | { kind: 'draw'; n: number };

/** 3D 角色的造型参数，由 scene/characters.ts 解释 */
export interface ModelSpec {
  scale: number;
  wingPairs: number;
  weapon?: 'staff' | 'shield' | 'lance' | 'sword' | 'lute' | 'candle' | 'saw' | 'claws' | 'crown' | 'fan';
  bulky?: boolean;
  floating?: boolean;
  /** 体型：默认人形；beast 四足、swarm 一群小个体、drone 无人机 */
  form?: 'beast' | 'swarm' | 'drone';
}

export interface CardDef {
  id: string;
  name: string;
  faction: Faction;
  theme: Theme;
  cost: number;
  atk: number;
  hp: number;
  armor?: number;
  keywords?: Keyword[];
  onPlay?: PlayEffect;
  flavor: string;
  /** 卡面插画的英文画面描述（给出图工具用） */
  art: string;
  model: ModelSpec;
}

export const THEME_INFO: Record<Theme, { name: string; faction: Faction; color: string; accent: string; blurb: string }> = {
  icon: { name: '圣像', faction: 'angel', color: '#e9c46a', accent: '#fff6d6', blurb: '古典金箔圣像，擅长续航' },
  mech: { name: '机枢', faction: 'angel', color: '#4cc9f0', accent: '#d6f6ff', blurb: '赛博机械天使，攻守均衡' },
  ink: { name: '云篆', faction: 'angel', color: '#8fd3b6', accent: '#f1fff8', blurb: '东方水墨仙灵，灵动穿透' },
  lava: { name: '熔渊', faction: 'demon', color: '#ff6b35', accent: '#ffd0a8', blurb: '熔岩深渊恶魔，直伤快攻' },
  goth: { name: '夜棘', faction: 'demon', color: '#c2185b', accent: '#ffc2dc', blurb: '哥特夜宴贵族，吸取生命' },
  rust: { name: '蚀械', faction: 'demon', color: '#9bc53d', accent: '#e6ffb0', blurb: '锈蚀废械魔物，厚重碾压' },
};

export const KEYWORD_INFO: Record<Keyword, { name: string; text: string }> = {
  rush: { name: '突袭', text: '上场当回合就能参战' },
  pierce: { name: '贯穿', text: '击杀后溢出的伤害打到敌方圣所' },
  lifesteal: { name: '吸取', text: '造成伤害时为己方圣所恢复等量生命' },
};

export const CARDS: CardDef[] = [
  // —— 圣像（古典金箔）——
  { id: 'icon_acolyte', name: '持烛侍童', faction: 'angel', theme: 'icon', cost: 1, atk: 1, hp: 3,
    flavor: '一支烛火，足够照亮一条战线。',
    art: 'a small child-like angel in gold-leaf robes holding a tall lit candle, tiny white wings, thin golden halo, mosaic cathedral background',
    model: { scale: 0.8, wingPairs: 1, weapon: 'candle' } },
  { id: 'icon_choir', name: '颂歌使', faction: 'angel', theme: 'icon', cost: 2, atk: 2, hp: 3,
    onPlay: { kind: 'healSanctum', n: 2 },
    flavor: '第一个音符落下，裂缝就开始愈合。',
    art: 'a serene singing angel with open hymn book, white feathered wings, golden halo, gold-leaf byzantine icon background with radiating lines',
    model: { scale: 0.95, wingPairs: 1, weapon: 'staff' } },
  { id: 'icon_shield', name: '圣盾守望者', faction: 'angel', theme: 'icon', cost: 3, atk: 3, hp: 6, armor: 1,
    flavor: '他从不前进，也从不后退。',
    art: 'a stoic armored angel standing behind a huge round golden shield engraved with a sun, white wings folded, gold-leaf icon background',
    model: { scale: 1.1, wingPairs: 1, weapon: 'shield', bulky: true } },
  { id: 'icon_seraph', name: '六翼炽辉', faction: 'angel', theme: 'icon', cost: 5, atk: 5, hp: 7,
    onPlay: { kind: 'healSanctum', n: 4 },
    flavor: '六翼展开时，没有影子。',
    art: 'a majestic six-winged seraph wreathed in golden fire, three pairs of white-gold wings, blazing double halo, gold-leaf icon background',
    model: { scale: 1.3, wingPairs: 3, weapon: 'crown', floating: true } },

  // —— 机枢（赛博机械）——
  { id: 'mech_drone', name: '巡光无人翼', faction: 'angel', theme: 'mech', cost: 1, atk: 2, hp: 1, keywords: ['rush'],
    flavor: '它不祈祷，它只执行。',
    art: 'a small sleek white-and-cyan angelic drone with blade-like panel wings and a glowing hexagonal halo, flying fast over a neon grid city',
    model: { scale: 0.8, wingPairs: 1, floating: true, form: 'drone' } },
  { id: 'mech_sentinel', name: '棱镜哨兵', faction: 'angel', theme: 'mech', cost: 2, atk: 2, hp: 4, armor: 1,
    flavor: '每一道光都被它折成盾。',
    art: 'a robotic angel sentinel in white ceramic armor holding a translucent prism shield, cyan light strips, hexagonal halo, clean sci-fi hangar',
    model: { scale: 0.95, wingPairs: 1, weapon: 'shield' } },
  { id: 'mech_lancer', name: '轨道枪骑', faction: 'angel', theme: 'mech', cost: 3, atk: 4, hp: 3, keywords: ['pierce'],
    flavor: '从近地轨道到你胸口，只需要一瞬。',
    art: 'a cybernetic angel knight diving with a long glowing energy lance, thruster wings with cyan exhaust, hexagonal halo, earth orbit backdrop',
    model: { scale: 1.05, wingPairs: 1, weapon: 'lance' } },
  { id: 'mech_archon', name: '阵列主天使', faction: 'angel', theme: 'mech', cost: 5, atk: 4, hp: 7, armor: 1,
    onPlay: { kind: 'draw', n: 1 },
    flavor: '一千个处理器，同一个意志。',
    art: 'a towering mechanical archangel with two pairs of segmented panel wings, floating data rings and triple hexagonal halo, cyan and white, server cathedral',
    model: { scale: 1.3, wingPairs: 2, weapon: 'staff', bulky: true } },

  // —— 云篆（东方水墨）——
  { id: 'ink_crane', name: '鹤羽信使', faction: 'angel', theme: 'ink', cost: 1, atk: 1, hp: 2,
    onPlay: { kind: 'draw', n: 1 },
    flavor: '信到了，人就不慌了。',
    art: 'a young celestial messenger in white hanfu robes with crane-feather wings carrying a scroll, jade ring halo, ink-wash mountains and mist',
    model: { scale: 0.8, wingPairs: 1, weapon: 'fan', floating: true } },
  { id: 'ink_blade', name: '飞白剑仙', faction: 'angel', theme: 'ink', cost: 2, atk: 3, hp: 2, keywords: ['rush'],
    flavor: '一笔飞白，剑已归鞘。',
    art: 'an eastern sword immortal mid-slash leaving a dry-brush calligraphy stroke, flowing white robes with jade sash, feathered wings, ink-wash style',
    model: { scale: 0.95, wingPairs: 1, weapon: 'sword' } },
  { id: 'ink_lotus', name: '莲台乐师', faction: 'angel', theme: 'ink', cost: 3, atk: 3, hp: 4,
    onPlay: { kind: 'healAllies', n: 2 },
    flavor: '弦一响，伤口就忘了疼。',
    art: 'a celestial musician seated on a floating lotus playing a pipa lute, long ribbons drifting like clouds, jade halo, ink-wash clouds',
    model: { scale: 1.0, wingPairs: 1, weapon: 'lute', floating: true } },
  { id: 'ink_dragon', name: '云龙天女', faction: 'angel', theme: 'ink', cost: 6, atk: 6, hp: 7, keywords: ['pierce'],
    flavor: '云是她的袖，龙是她的笔。',
    art: 'a celestial maiden riding a coiling cloud dragon painted in ink wash, long flowing sleeves, jade and white, two pairs of feathered wings, sea of clouds',
    model: { scale: 1.35, wingPairs: 2, weapon: 'sword', floating: true } },

  // —— 熔渊（熔岩深渊）——
  { id: 'lava_imp', name: '余烬小鬼', faction: 'demon', theme: 'lava', cost: 1, atk: 2, hp: 1,
    onPlay: { kind: 'strike', n: 1 },
    flavor: '先扔一颗火星，再问你是谁。',
    art: 'a mischievous small obsidian imp with glowing lava cracks throwing an ember, stubby horns and tail, volcanic cave with magma glow',
    model: { scale: 0.7, wingPairs: 1, weapon: 'claws' } },
  { id: 'lava_hound', name: '熔岩猎犬', faction: 'demon', theme: 'lava', cost: 2, atk: 3, hp: 2, keywords: ['rush'],
    flavor: '它闻到的不是气味，是温度。',
    art: 'a hulking horned hound-like demon made of cooling black lava with molten orange seams, charging through a river of magma',
    model: { scale: 1.0, wingPairs: 0, form: 'beast' } },
  { id: 'lava_brute', name: '黑曜蛮魔', faction: 'demon', theme: 'lava', cost: 4, atk: 5, hp: 5,
    flavor: '道理很简单：他比你硬。',
    art: 'a massive obsidian brute demon with jagged shoulders, large curved horns and fists dripping lava, volcanic eruption behind',
    model: { scale: 1.2, wingPairs: 1, weapon: 'claws', bulky: true } },
  { id: 'lava_tyrant', name: '火口暴君', faction: 'demon', theme: 'lava', cost: 6, atk: 7, hp: 6,
    onPlay: { kind: 'strike', n: 3 },
    flavor: '火山不是他的王座，是他的嘴。',
    art: 'a colossal demon tyrant rising from a volcano crater, crown of molten rock horns, huge ragged magma wings, sky of ash and fire',
    model: { scale: 1.4, wingPairs: 1, weapon: 'crown', bulky: true } },

  // —— 夜棘（哥特夜宴）——
  { id: 'goth_bat', name: '蝠翼侍女', faction: 'demon', theme: 'goth', cost: 1, atk: 1, hp: 3, keywords: ['lifesteal'],
    flavor: '她只收一点点小费。',
    art: 'a pale gothic demon maid with small bat wings carrying a silver tray with a crimson goblet, black lace dress, candle-lit gothic hall, rose thorns',
    model: { scale: 0.8, wingPairs: 1, weapon: 'candle' } },
  { id: 'goth_organ', name: '夜宴管风琴师', faction: 'demon', theme: 'goth', cost: 2, atk: 2, hp: 3,
    onPlay: { kind: 'draw', n: 1 },
    flavor: '宾客未到，序曲先行。',
    art: 'a gaunt horned demon organist in a high-collared black coat playing a towering pipe organ of thorns, crimson moonlight through stained glass',
    model: { scale: 0.95, wingPairs: 1, weapon: 'lute' } },
  { id: 'goth_thorn', name: '荆棘骑士', faction: 'demon', theme: 'goth', cost: 3, atk: 3, hp: 5, armor: 1,
    flavor: '铠甲里没有人，只有玫瑰。',
    art: 'a gothic demon knight in black filigree armor wrapped in rose thorns, crimson cape, curved horns on helm, holding a thorned shield, moonlit cathedral ruins',
    model: { scale: 1.1, wingPairs: 1, weapon: 'shield', bulky: true } },
  { id: 'goth_countess', name: '绯月女爵', faction: 'demon', theme: 'goth', cost: 4, atk: 4, hp: 4, keywords: ['lifesteal'],
    onPlay: { kind: 'strike', n: 2 },
    flavor: '请柬上只写了一个字：来。',
    art: 'an elegant demon countess with large bat wings and curved horns, crimson and black gown, holding a rapier, giant red moon behind gothic spires',
    model: { scale: 1.15, wingPairs: 1, weapon: 'sword', floating: true } },

  // —— 蚀械（锈蚀废械）——
  { id: 'rust_mite', name: '锈蚀螨群', faction: 'demon', theme: 'rust', cost: 1, atk: 2, hp: 2,
    flavor: '一只不算什么。可它从不是一只。',
    art: 'a swarm of small rusty mechanical mite demons with toxic green glowing eyes crawling over scrap metal, industrial wasteland',
    model: { scale: 0.9, wingPairs: 0, form: 'swarm' } },
  { id: 'rust_saw', name: '链锯拾荒者', faction: 'demon', theme: 'rust', cost: 2, atk: 3, hp: 2, keywords: ['pierce'],
    flavor: '别人的残骸，是他的备件。',
    art: 'a lanky scrap-metal demon scavenger with a roaring chainsaw arm, bent horn antennae, leaking toxic green coolant, junkyard at dusk',
    model: { scale: 0.95, wingPairs: 1, weapon: 'saw' } },
  { id: 'rust_core', name: '污染炉心', faction: 'demon', theme: 'rust', cost: 3, atk: 2, hp: 6,
    onPlay: { kind: 'strike', n: 2 },
    flavor: '它还在烧，只是烧的东西不对了。',
    art: 'a squat corroded furnace demon with a cracked reactor core glowing toxic green in its chest, smokestack horns, pipes and sludge',
    model: { scale: 1.05, wingPairs: 0, weapon: 'claws', bulky: true } },
  { id: 'rust_colossus', name: '残骸巨像', faction: 'demon', theme: 'rust', cost: 5, atk: 6, hp: 7, armor: 1,
    flavor: '一百台战争机器死后，站起来了一个。',
    art: 'a gigantic demon colossus assembled from wrecked war machines, scrap-plate wings, single toxic green eye, rust-orange and iron, stormy scrapyard',
    model: { scale: 1.4, wingPairs: 1, weapon: 'saw', bulky: true } },
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export function cardsOfTheme(theme: Theme): CardDef[] {
  return CARDS.filter((c) => c.theme === theme);
}
