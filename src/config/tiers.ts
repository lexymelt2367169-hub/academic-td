export interface TierDef {
  id: string
  name: string
  short: string
  mmrMin: number
  starsPerTier: number
  protect: boolean
}

export const TIERS: TierDef[] = [
  { id: 'primary', name: '小学生', short: '小学', mmrMin: 0, starsPerTier: 3, protect: true },
  { id: 'junior', name: '初中生', short: '初', mmrMin: 200, starsPerTier: 3, protect: true },
  { id: 'senior', name: '高中生', short: '高', mmrMin: 400, starsPerTier: 4, protect: true },
  { id: 'college', name: '大学生', short: '大', mmrMin: 600, starsPerTier: 4, protect: true },
  { id: 'master', name: '硕士研究生', short: '硕', mmrMin: 800, starsPerTier: 5, protect: false },
  { id: 'phd', name: '博士研究生', short: '博', mmrMin: 1000, starsPerTier: 5, protect: false },
  { id: 'lecturer', name: '讲师', short: '讲', mmrMin: 1200, starsPerTier: 5, protect: false },
  { id: 'assoc', name: '副教授', short: '副', mmrMin: 1400, starsPerTier: 5, protect: false },
  { id: 'prof', name: '教授', short: '教', mmrMin: 1600, starsPerTier: 5, protect: false },
  { id: 'jy', name: '杰青', short: '杰', mmrMin: 1800, starsPerTier: 5, protect: false },
  { id: 'cj', name: '长江', short: '长', mmrMin: 2000, starsPerTier: 5, protect: false },
  { id: 'acad', name: '院士', short: '院', mmrMin: 2200, starsPerTier: 99, protect: false },
]

export function tierByMmr(mmr: number): TierDef {
  let cur = TIERS[0]
  for (const t of TIERS) {
    if (mmr >= t.mmrMin) cur = t
  }
  return cur
}
