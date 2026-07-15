import { TIERS, tierByMmr, type TierDef } from '../config/tiers'

const KEY = 'academic-td-save-v1'

export interface PlayerSave {
  mmr: number
  stars: number
  wins: number
  losses: number
  friendWins: number
  unlockedChars: string[]
}

const DEFAULT: PlayerSave = {
  mmr: 0,
  stars: 0,
  wins: 0,
  losses: 0,
  friendWins: 0,
  unlockedChars: [],
}

export function loadSave(): PlayerSave {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT, unlockedChars: [] }
    return { ...DEFAULT, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT, unlockedChars: [] }
  }
}

export function writeSave(s: PlayerSave) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function currentTier(s: PlayerSave): TierDef {
  return tierByMmr(s.mmr)
}

export function applyRankedResult(won: boolean): {
  save: PlayerSave
  tier: TierDef
  deltaStars: number
  message: string
} {
  const save = loadSave()
  const tier = currentTier(save)
  let delta = 0

  if (won) {
    save.wins += 1
    save.stars += 1
    delta = 1
    save.mmr += 25
    while (true) {
      const t = currentTier(save)
      if (save.stars >= t.starsPerTier && t.id !== 'acad') {
        save.stars = 0
        save.mmr = Math.max(save.mmr, TIERS[TIERS.indexOf(t) + 1]?.mmrMin ?? save.mmr)
      } else break
    }
  } else {
    save.losses += 1
    if (tier.protect && save.stars === 0) {
      delta = 0
    } else {
      save.stars = Math.max(0, save.stars - 1)
      delta = -1
      save.mmr = Math.max(0, save.mmr - 18)
    }
  }

  writeSave(save)
  const newTier = currentTier(save)
  const message = won
    ? `答辩全票通过！${newTier.name} · ${save.stars}星`
    : delta === 0
      ? `答辩未通过（掉星保护）· ${newTier.name}`
      : `答辩未通过 · ${newTier.name} · ${save.stars}星`

  return { save, tier: newTier, deltaStars: delta, message }
}

export function unlockChar(ch: string) {
  const s = loadSave()
  if (!s.unlockedChars.includes(ch)) {
    s.unlockedChars.push(ch)
    writeSave(s)
  }
}

export function recordFriendWin() {
  const s = loadSave()
  s.friendWins += 1
  writeSave(s)
}
