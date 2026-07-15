export type UnitKind = '刀' | '枪' | '弓' | '骑'

export interface UnitStats {
  atk: number
  range: number
  cooldown: number
  splash?: number
  pierce?: number
}

/** Lv1-5 stats for each kind */
export const UNIT_STATS: Record<UnitKind, UnitStats[]> = {
  刀: [
    { atk: 12, range: 70, cooldown: 0.7 },
    { atk: 20, range: 75, cooldown: 0.65 },
    { atk: 34, range: 80, cooldown: 0.6 },
    { atk: 55, range: 85, cooldown: 0.55 },
    { atk: 90, range: 90, cooldown: 0.5 },
  ],
  枪: [
    { atk: 10, range: 85, cooldown: 0.85, pierce: 2 },
    { atk: 17, range: 90, cooldown: 0.8, pierce: 2 },
    { atk: 28, range: 95, cooldown: 0.75, pierce: 3 },
    { atk: 46, range: 100, cooldown: 0.7, pierce: 3 },
    { atk: 75, range: 110, cooldown: 0.65, pierce: 4 },
  ],
  弓: [
    { atk: 8, range: 160, cooldown: 0.45 },
    { atk: 13, range: 170, cooldown: 0.42 },
    { atk: 22, range: 180, cooldown: 0.4 },
    { atk: 36, range: 190, cooldown: 0.38 },
    { atk: 60, range: 210, cooldown: 0.35 },
  ],
  骑: [
    { atk: 11, range: 90, cooldown: 0.9, splash: 40 },
    { atk: 18, range: 95, cooldown: 0.85, splash: 45 },
    { atk: 30, range: 100, cooldown: 0.8, splash: 50 },
    { atk: 50, range: 110, cooldown: 0.75, splash: 55 },
    { atk: 82, range: 120, cooldown: 0.7, splash: 65 },
  ],
}

export const HIT_WORDS: Record<UnitKind, string[]> = {
  刀: ['批', '改', '删', '驳'],
  枪: ['质', '问', '刺', '难'],
  弓: ['投', '引', '注', '刊'],
  骑: ['赶', '冲', '卷', '肝'],
}

export const UNIT_KINDS: UnitKind[] = ['刀', '枪', '弓', '骑']

export const RECRUIT_COST = 10
export const REFRESH_FREE = 1
export const REFRESH_PAID_MAX = 2
export const REFRESH_COST = 8
export const SEARCH_PER_BATTLE = 1
/** Enough for the opening hand plus a few deliberate choices. */
export const START_COFFEE = 50
export const MANUSCRIPT_HP = 3
export const MAX_UNIT_LEVEL = 5
