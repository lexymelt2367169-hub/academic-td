import { GENERALS, type GeneralDef } from '../config/generals'
import {
  HIT_WORDS,
  MAX_UNIT_LEVEL,
  RECRUIT_COST,
  REFRESH_COST,
  REFRESH_FREE,
  REFRESH_PAID_MAX,
  SEARCH_PER_BATTLE,
  START_COFFEE,
  UNIT_KINDS,
  UNIT_STATS,
  type UnitKind,
} from '../config/units'
import { WAVES } from '../config/waves'
import { unlockChar } from '../meta/save'
import { dist, mulberry32, pickWeighted } from './util'

export type BattleMode = 'ranked' | 'hotseat'

export interface GridUnit {
  id: number
  kind: 'unit'
  unitKind: UnitKind
  level: number
  gx: number
  gy: number
  side: 0 | 1
  cd: number
  atkMul: number
  spdMul: number
  buffT: number
}

export interface FragmentUnit {
  id: number
  kind: 'frag'
  char: string
  gx: number
  gy: number
  side: 0 | 1
}

export interface ActiveGeneral {
  id: number
  kind: 'general'
  def: GeneralDef
  gx: number
  gy: number
  side: 0 | 1
  cd: number
  atkMul: number
  spdMul: number
  buffT: number
  skillCd: number
}

export type BoardEntity = GridUnit | FragmentUnit | ActiveGeneral

export interface Enemy {
  id: number
  x: number
  y: number
  hp: number
  maxHp: number
  speed: number
  side: 0 | 1
  slowT: number
  stunT: number
  boss: boolean
  pathIndex: number
}

export interface FloatText {
  x: number
  y: number
  text: string
  life: number
  color: string
}

export interface RecruitSlot {
  type: 'unit' | 'frag' | 'shovel' | 'empty'
  unitKind?: UnitKind
  char?: string
}

export interface BattleState {
  mode: BattleMode
  seed: number
  rand: () => number
  coffee: number
  coffee2: number
  hp: number
  hp2: number
  wave: number
  waveTimer: number
  spawnLeft: number
  spawnCd: number
  phase: 'playing' | 'won' | 'lost' | 'draw'
  entities: BoardEntity[]
  enemies: Enemy[]
  floats: FloatText[]
  recruit: RecruitSlot[]
  recruit2: RecruitSlot[]
  freeRefresh: number
  paidRefresh: number
  searchLeft: number
  searchKind: UnitKind | null
  freeRefresh2: number
  paidRefresh2: number
  searchLeft2: number
  searchKind2: UnitKind | null
  nextId: number
  silenceT: number
  silenceT2: number
  message: string
  shadowPressure: number
  cols: number
  rows: number
  unlockedCells: Set<string>
  unlockedCells2: Set<string>
  goldPity: number
  goldPity2: number
  defeated: number
  defeated2: number
}

function cellKey(gx: number, gy: number) {
  return `${gx},${gy}`
}

export function createBattle(mode: BattleMode, seed = Date.now()): BattleState {
  const rand = mulberry32(seed)
  const cols = 6
  const rows = 4
  const unlocked = new Set<string>()
  const unlocked2 = new Set<string>()
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      unlocked.add(cellKey(x, y))
      unlocked2.add(cellKey(x, y))
    }
  }

  const s: BattleState = {
    mode,
    seed,
    rand,
    coffee: START_COFFEE,
    coffee2: START_COFFEE,
    hp: 3,
    hp2: 3,
    wave: 0,
    waveTimer: 2,
    spawnLeft: 0,
    spawnCd: 0,
    phase: 'playing',
    entities: [],
    enemies: [],
    floats: [],
    recruit: emptyRecruit(),
    recruit2: emptyRecruit(),
    freeRefresh: REFRESH_FREE,
    paidRefresh: 0,
    searchLeft: SEARCH_PER_BATTLE,
    searchKind: null,
    freeRefresh2: REFRESH_FREE,
    paidRefresh2: 0,
    searchLeft2: SEARCH_PER_BATTLE,
    searchKind2: null,
    nextId: 1,
    silenceT: 0,
    silenceT2: 0,
    message: mode === 'ranked' ? '排位·影子答辩开始' : '好友热座·不计星',
    shadowPressure: 0.85 + rand() * 0.35,
    cols,
    rows,
    unlockedCells: unlocked,
    unlockedCells2: unlocked2,
    goldPity: 0,
    goldPity2: 0,
    defeated: 0,
    defeated2: 0,
  }

  // opening hand without coffee cost
  fillRecruit(s, 0)
  if (mode === 'hotseat') fillRecruit(s, 1)
  return s
}

function emptyRecruit(): RecruitSlot[] {
  return Array.from({ length: 5 }, () => ({ type: 'empty' as const }))
}

function nid(s: BattleState) {
  return s.nextId++
}

export function doRecruit(s: BattleState, side: 0 | 1) {
  const cost = RECRUIT_COST
  if (side === 0) {
    if (s.coffee < cost) {
      s.message = '咖啡不足'
      return false
    }
    s.coffee -= cost
  } else {
    if (s.coffee2 < cost) {
      s.message = 'P2 咖啡不足'
      return false
    }
    s.coffee2 -= cost
  }
  fillRecruit(s, side)
  return true
}

function fillRecruit(s: BattleState, side: 0 | 1) {
  const slots = side === 0 ? s.recruit : s.recruit2
  const searchKind = side === 0 ? s.searchKind : s.searchKind2
  let forced = 0
  const needForced = searchKind ? 2 : 0

  for (let i = 0; i < 5; i++) {
    slots[i] = rollSlot(s, side, searchKind, forced < needForced)
    if (searchKind && slots[i].type === 'unit' && slots[i].unitKind === searchKind) {
      forced++
    }
  }

  if (searchKind && forced < needForced) {
    for (let i = 0; i < 5 && forced < needForced; i++) {
      slots[i] = { type: 'unit', unitKind: searchKind }
      forced++
    }
  }

  if (side === 0) s.searchKind = null
  else s.searchKind2 = null
}

function rollSlot(
  s: BattleState,
  side: 0 | 1,
  prefer: UnitKind | null,
  forcePrefer: boolean,
): RecruitSlot {
  const r = s.rand()
  const pity = side === 0 ? s.goldPity : s.goldPity2

  if (forcePrefer && prefer) {
    return { type: 'unit', unitKind: prefer }
  }

  // shovel ~6%
  if (r < 0.06) return { type: 'shovel' }

  // gold fragment with pity
  const goldChance = pity >= 8 ? 1 : 0.12
  if (s.rand() < goldChance) {
    if (side === 0) s.goldPity = 0
    else s.goldPity2 = 0
    const g = pickWeighted(GENERALS, s.rand)
    const ch = s.rand() < 0.5 ? g.chars[0] : g.chars[1]
    unlockChar(ch)
    return { type: 'frag', char: ch }
  }

  if (side === 0) s.goldPity++
  else s.goldPity2++

  const kind =
    prefer && s.rand() < 0.35
      ? prefer
      : UNIT_KINDS[Math.floor(s.rand() * UNIT_KINDS.length)]
  return { type: 'unit', unitKind: kind }
}

export function refreshRecruit(s: BattleState, side: 0 | 1): boolean {
  if (side === 0) {
    if (s.freeRefresh > 0) {
      s.freeRefresh--
      fillRecruit(s, 0)
      s.message = '已换一批参考文献'
      return true
    }
    if (s.paidRefresh < REFRESH_PAID_MAX && s.coffee >= REFRESH_COST) {
      s.coffee -= REFRESH_COST
      s.paidRefresh++
      fillRecruit(s, 0)
      s.message = '付费刷新成功'
      return true
    }
    s.message = '刷新次数用尽或咖啡不足'
    return false
  }
  if (s.freeRefresh2 > 0) {
    s.freeRefresh2--
    fillRecruit(s, 1)
    return true
  }
  if (s.paidRefresh2 < REFRESH_PAID_MAX && s.coffee2 >= REFRESH_COST) {
    s.coffee2 -= REFRESH_COST
    s.paidRefresh2++
    fillRecruit(s, 1)
    return true
  }
  return false
}

export function setSearch(s: BattleState, side: 0 | 1, kind: UnitKind): boolean {
  if (side === 0) {
    if (s.searchLeft <= 0) {
      s.message = '本局检索已用完'
      return false
    }
    s.searchLeft--
    s.searchKind = kind
    s.message = `精准检索：下次招募偏${kind}`
    return true
  }
  if (s.searchLeft2 <= 0) return false
  s.searchLeft2--
  s.searchKind2 = kind
  return true
}

export function placeFromRecruit(
  s: BattleState,
  side: 0 | 1,
  slotIndex: number,
  gx: number,
  gy: number,
): boolean {
  const slots = side === 0 ? s.recruit : s.recruit2
  const slot = slots[slotIndex]
  if (!slot || slot.type === 'empty') return false

  const unlocked = side === 0 ? s.unlockedCells : s.unlockedCells2
  if (slot.type === 'shovel') {
    if (unlocked.has(cellKey(gx, gy))) {
      s.message = '此处已是工位'
      return false
    }
    // must be adjacent to unlocked
    const adj = [
      [gx - 1, gy],
      [gx + 1, gy],
      [gx, gy - 1],
      [gx, gy + 1],
    ]
    if (!adj.some(([x, y]) => unlocked.has(cellKey(x, y)))) {
      s.message = '只能扩建相邻工位'
      return false
    }
    if (gx < 0 || gy < 0 || gx >= s.cols || gy >= s.rows) return false
    unlocked.add(cellKey(gx, gy))
    slots[slotIndex] = { type: 'empty' }
    s.message = '申请工位成功'
    return true
  }

  if (!unlocked.has(cellKey(gx, gy))) {
    s.message = '未解锁的格子'
    return false
  }

  const occ = findAt(s, gx, gy, side)
  if (slot.type === 'unit') {
    if (occ && occ.kind === 'unit' && occ.unitKind === slot.unitKind && occ.level < MAX_UNIT_LEVEL) {
      occ.level += 1
      slots[slotIndex] = { type: 'empty' }
      s.message = `${slot.unitKind} 合成至 Lv${occ.level}`
      return true
    }
    if (occ) {
      s.message = '格子被占用'
      return false
    }
    s.entities.push({
      id: nid(s),
      kind: 'unit',
      unitKind: slot.unitKind!,
      level: 1,
      gx,
      gy,
      side,
      cd: 0,
      atkMul: 1,
      spdMul: 1,
      buffT: 0,
    })
    slots[slotIndex] = { type: 'empty' }
    return true
  }

  if (slot.type === 'frag') {
    if (occ) {
      s.message = '格子被占用'
      return false
    }
    s.entities.push({
      id: nid(s),
      kind: 'frag',
      char: slot.char!,
      gx,
      gy,
      side,
    })
    slots[slotIndex] = { type: 'empty' }
    tryActivateGeneral(s, side)
    return true
  }

  return false
}

function findAt(s: BattleState, gx: number, gy: number, side: 0 | 1) {
  return s.entities.find((e) => e.gx === gx && e.gy === gy && e.side === side)
}

function tryActivateGeneral(s: BattleState, side: 0 | 1) {
  for (const g of GENERALS) {
    const [a, b] = g.chars
    const frags = s.entities.filter((e) => e.kind === 'frag' && e.side === side) as FragmentUnit[]
    for (const f1 of frags) {
      if (f1.char !== a) continue
      const f2 = frags.find(
        (f) =>
          f.id !== f1.id &&
          f.char === b &&
          ((f.gx === f1.gx + 1 && f.gy === f1.gy) ||
            (f.gx === f1.gx && f.gy === f1.gy + 1)),
      )
      if (!f2) continue
      // remove frags, place general at f1
      s.entities = s.entities.filter((e) => e.id !== f1.id && e.id !== f2.id)
      s.entities.push({
        id: nid(s),
        kind: 'general',
        def: g,
        gx: f1.gx,
        gy: f1.gy,
        side,
        cd: 0,
        atkMul: 1,
        spdMul: 1,
        buffT: 0,
        skillCd: 0,
      })
      s.message = `${g.name} 激活！`
      unlockChar(a)
      unlockChar(b)
      return
    }
  }
}

export function mergeDrag(
  s: BattleState,
  side: 0 | 1,
  fromId: number,
  tx: number,
  ty: number,
): boolean {
  const from = s.entities.find((e) => e.id === fromId && e.side === side)
  if (!from || from.kind !== 'unit') return false
  const unlocked = side === 0 ? s.unlockedCells : s.unlockedCells2
  if (!unlocked.has(cellKey(tx, ty))) return false

  const to = findAt(s, tx, ty, side)
  if (
    to &&
    to.kind === 'unit' &&
    to.id !== from.id &&
    to.unitKind === from.unitKind &&
    to.level === from.level &&
    to.level < MAX_UNIT_LEVEL
  ) {
    to.level += 1
    s.entities = s.entities.filter((e) => e.id !== from.id)
    s.message = `${to.unitKind} 合成至 Lv${to.level}`
    return true
  }

  if (!to) {
    from.gx = tx
    from.gy = ty
    tryActivateGeneral(s, side)
    return true
  }

  // swap
  if (to && to.id !== from.id) {
    const fx = from.gx
    const fy = from.gy
    from.gx = to.gx
    from.gy = to.gy
    to.gx = fx
    to.gy = fy
    tryActivateGeneral(s, side)
    return true
  }
  return false
}

function cellCenter(
  s: BattleState,
  gx: number,
  gy: number,
  side: 0 | 1,
  layout: Layout,
) {
  const board = (side === 0 ? layout.board0 : layout.board1) ?? layout.board0
  const cw = board.w / s.cols
  const ch = board.h / s.rows
  return {
    x: board.x + gx * cw + cw / 2,
    y: board.y + gy * ch + ch / 2,
    cw,
    ch,
  }
}

export interface Layout {
  w: number
  h: number
  board0: { x: number; y: number; w: number; h: number }
  board1: { x: number; y: number; w: number; h: number } | null
  path0: { x: number; y: number }[]
  path1: { x: number; y: number }[] | null
}

export function makeLayout(w: number, h: number, hotseat: boolean): Layout {
  if (!hotseat) {
    const board = { x: w * 0.08, y: h * 0.12, w: w * 0.84, h: h * 0.48 }
    const path = [
      { x: board.x + board.w + 20, y: board.y + board.h * 0.2 },
      { x: board.x + board.w * 0.85, y: board.y + board.h * 0.25 },
      { x: board.x + board.w * 0.55, y: board.y + board.h * 0.55 },
      { x: board.x + board.w * 0.25, y: board.y + board.h * 0.7 },
      { x: board.x + 30, y: board.y + board.h * 0.85 },
    ]
    return { w, h, board0: board, board1: null, path0: path, path1: null }
  }
  const board0 = { x: w * 0.08, y: h * 0.06, w: w * 0.84, h: h * 0.28 }
  const board1 = { x: w * 0.08, y: h * 0.42, w: w * 0.84, h: h * 0.28 }
  const path0 = [
    { x: board0.x + board0.w + 10, y: board0.y + 20 },
    { x: board0.x + board0.w * 0.5, y: board0.y + board0.h * 0.5 },
    { x: board0.x + 20, y: board0.y + board0.h - 10 },
  ]
  const path1 = [
    { x: board1.x + board1.w + 10, y: board1.y + 20 },
    { x: board1.x + board1.w * 0.5, y: board1.y + board1.h * 0.5 },
    { x: board1.x + 20, y: board1.y + board1.h - 10 },
  ]
  return { w, h, board0, board1, path0, path1 }
}

export function castSkill(s: BattleState, generalId: number): boolean {
  const g = s.entities.find((e) => e.id === generalId && e.kind === 'general') as
    | ActiveGeneral
    | undefined
  if (!g || g.skillCd > 0) return false
  g.skillCd = g.def.cd
  const side = g.side
  const enemies = s.enemies.filter((e) => e.side === side)

  switch (g.def.id) {
    case 'tsinghua': {
      for (const e of s.entities) {
        if (e.side !== side) continue
        if (e.kind === 'unit' || e.kind === 'general') {
          if (Math.abs(e.gx - g.gx) + Math.abs(e.gy - g.gy) <= 2) {
            e.spdMul = 1.3
            e.buffT = 8
          }
        }
      }
      s.message = '水木清华·攻速提升'
      break
    }
    case 'pku': {
      g.atkMul = 1.6
      g.spdMul = 1.5
      g.buffT = 6
      s.message = '未名湖畔·强化自身'
      break
    }
    case 'fudan': {
      for (const en of enemies) {
        en.slowT = 4
        en.hp -= 40 * s.shadowPressure
      }
      s.message = '日月光华·大修减速'
      break
    }
    case 'sjtu': {
      if (enemies.length) {
        const target = enemies.reduce((a, b) => (a.hp < b.hp ? a : b))
        s.floats.push({
          x: target.x,
          y: target.y,
          text: '致远',
          life: 0.9,
          color: '#c45c26',
        })
        target.hp = 0
      }
      s.message = '思源致远·斩杀'
      break
    }
    case 'zju': {
      enemies
        .slice()
        .sort((a, b) => a.pathIndex - b.pathIndex)
        .slice(0, 3)
        .forEach((en) => {
          en.stunT = 2.5
        })
      s.message = '求是创新·眩晕'
      break
    }
    case 'nankai': {
      for (const en of enemies) {
        en.hp -= 120 * s.shadowPressure
      }
      s.message = '允公允能·全场打击'
      break
    }
  }
  return true
}

export function updateBattle(s: BattleState, dt: number, layout: Layout) {
  if (s.phase !== 'playing') return

  s.silenceT = Math.max(0, s.silenceT - dt)
  s.silenceT2 = Math.max(0, s.silenceT2 - dt)

  // waves
  if (s.spawnLeft <= 0) {
    s.waveTimer -= dt
    if (s.waveTimer <= 0) {
      if (s.wave >= WAVES.length) {
        // survived all — win if hp ok
        finishCheck(s)
        return
      }
      const wdef = WAVES[s.wave]
      s.wave++
      s.spawnLeft = wdef.count
      s.spawnCd = 0.2
      s.waveTimer = 999
      s.message = wdef.boss
        ? `第${wdef.wave}波 Boss：${wdef.bossSkill}`
        : `第${wdef.wave}波来袭`
      const researchGrant = wdef.boss ? 12 : 8
      s.coffee += researchGrant
      if (s.mode === 'hotseat') s.coffee2 += researchGrant
      if (wdef.boss && wdef.wave === 6) {
        s.silenceT = 3
        if (s.mode === 'hotseat') s.silenceT2 = 3
      }
    }
  } else {
    s.spawnCd -= dt
    if (s.spawnCd <= 0) {
      spawnEnemy(s, layout)
      s.spawnLeft--
      const wdef = WAVES[Math.min(s.wave - 1, WAVES.length - 1)]
      s.spawnCd = wdef.interval
      if (s.spawnLeft <= 0) {
        s.waveTimer = 4.5
      }
    }
  }

  // move enemies
  for (const en of s.enemies) {
    if (en.stunT > 0) {
      en.stunT -= dt
      continue
    }
    const path = en.side === 0 ? layout.path0 : layout.path1!
    const spd = en.speed * (en.slowT > 0 ? 0.55 : 1) * (en.side === 0 ? 1 : 1)
    if (en.slowT > 0) en.slowT -= dt
    const target = path[Math.min(en.pathIndex, path.length - 1)]
    const d = dist(en.x, en.y, target.x, target.y)
    if (d < 4) {
      en.pathIndex++
      if (en.pathIndex >= path.length) {
        // hit manuscript
        if (en.side === 0) s.hp--
        else s.hp2--
        en.hp = 0
        s.message = en.side === 0 ? '稿被扣命！' : 'P2 稿被扣命！'
      }
    } else {
      en.x += ((target.x - en.x) / d) * spd * dt
      en.y += ((target.y - en.y) / d) * spd * dt
    }
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0)

  // combat
  const silenced0 = s.silenceT > 0
  const silenced1 = s.silenceT2 > 0
  for (const e of s.entities) {
    if (e.kind === 'frag') continue
    if (e.buffT > 0) {
      e.buffT -= dt
      if (e.buffT <= 0) {
        e.atkMul = 1
        e.spdMul = 1
      }
    }
    if (e.kind === 'general') {
      e.skillCd = Math.max(0, e.skillCd - dt)
    }
    const sideSilent = e.side === 0 ? silenced0 : silenced1
    if (sideSilent) continue

    e.cd -= dt
    if (e.cd > 0) continue

    const pos = cellCenter(s, e.gx, e.gy, e.side, layout)
    const enemies = s.enemies.filter((en) => en.side === e.side)
    if (!enemies.length) continue

    if (e.kind === 'unit') {
      const st = UNIT_STATS[e.unitKind][e.level - 1]
      const range = st.range
      const targets = enemies
        .map((en) => ({ en, d: dist(pos.x, pos.y, en.x, en.y) }))
        .filter((t) => t.d <= range)
        .sort((a, b) => a.d - b.d)
      if (!targets.length) continue

      e.cd = st.cooldown / e.spdMul
      const dmg = st.atk * e.atkMul * (e.side === 0 ? 1 : 1)

      if (st.pierce) {
        targets.slice(0, st.pierce).forEach((t) => hitEnemy(s, t.en, dmg, e.unitKind))
      } else if (st.splash) {
        const main = targets[0].en
        hitEnemy(s, main, dmg, e.unitKind)
        for (const en of enemies) {
          if (en.id !== main.id && dist(en.x, en.y, main.x, main.y) <= st.splash) {
            hitEnemy(s, en, dmg * 0.5, e.unitKind)
          }
        }
      } else {
        hitEnemy(s, targets[0].en, dmg, e.unitKind)
      }
    } else if (e.kind === 'general') {
      const range = 140
      const targets = enemies
        .map((en) => ({ en, d: dist(pos.x, pos.y, en.x, en.y) }))
        .filter((t) => t.d <= range)
        .sort((a, b) => a.d - b.d)
      if (!targets.length) continue
      e.cd = 0.55 / e.spdMul
      hitEnemy(s, targets[0].en, 28 * e.atkMul, null, e.def.name.slice(0, 1))
    }
  }

  // floats
  for (const f of s.floats) f.life -= dt
  s.floats = s.floats.filter((f) => f.life > 0)

  if (s.mode === 'hotseat') {
    if (s.hp <= 0 && s.hp2 <= 0) {
      s.phase = 'draw'
      s.message = '同时阵亡·平局'
    } else if (s.hp <= 0) {
      s.phase = 'lost'
      s.message = 'P2 胜'
    } else if (s.hp2 <= 0) {
      s.phase = 'won'
      s.message = 'P1 胜'
    }
  } else if (s.hp <= 0) {
    s.phase = 'lost'
    s.message = '答辩未通过'
  }

  if (s.phase === 'playing' && s.wave >= WAVES.length && s.enemies.length === 0 && s.spawnLeft <= 0) {
    if (s.mode === 'hotseat') {
      if (s.hp > s.hp2) {
        s.phase = 'won'
        s.message = 'P1 胜（残命更多）'
      } else if (s.hp2 > s.hp) {
        s.phase = 'lost'
        s.message = 'P2 胜（残命更多）'
      } else {
        s.phase = 'draw'
        s.message = '平局'
      }
    } else {
      s.phase = 'won'
      s.message = '答辩全票通过'
    }
  }
}

function finishCheck(s: BattleState) {
  if (s.enemies.length === 0 && s.spawnLeft <= 0) {
    s.phase = 'won'
    s.message = '答辩全票通过'
  }
}

function spawnEnemy(s: BattleState, layout: Layout) {
  const wdef = WAVES[Math.min(s.wave - 1, WAVES.length - 1)]
  const hpMul = s.mode === 'ranked' ? s.shadowPressure : 1
  const sides: (0 | 1)[] = s.mode === 'hotseat' ? [0, 1] : [0]
  for (const side of sides) {
    const path = side === 0 ? layout.path0 : layout.path1!
    const start = path[0]
    s.enemies.push({
      id: nid(s),
      x: start.x,
      y: start.y,
      hp: wdef.hp * hpMul * (wdef.boss ? 2.2 : 1),
      maxHp: wdef.hp * hpMul * (wdef.boss ? 2.2 : 1),
      speed: wdef.speed * (wdef.boss && wdef.wave === 10 ? 1.35 : 1),
      side,
      slowT: 0,
      stunT: 0,
      boss: !!wdef.boss,
      pathIndex: 1,
    })
  }
}

function hitEnemy(
  s: BattleState,
  en: Enemy,
  dmg: number,
  kind: UnitKind | null,
  word?: string,
) {
  if (en.hp <= 0) return
  en.hp -= dmg
  if (en.hp <= 0) {
    const reward = en.boss ? 8 : 2
    if (en.side === 0) {
      s.coffee += reward
      s.defeated += 1
    } else {
      s.coffee2 += reward
      s.defeated2 += 1
    }
    if (s.floats.length < 40) {
      s.floats.push({
        x: en.x,
        y: en.y - 8,
        text: `+${reward}☕`,
        life: 0.7,
        color: '#c27c0e',
      })
    }
  }
  const text =
    word ||
    (kind ? HIT_WORDS[kind][Math.floor(s.rand() * HIT_WORDS[kind].length)] : '击')
  if (s.floats.length < 40) {
    s.floats.push({
      x: en.x + (s.rand() - 0.5) * 16,
      y: en.y - 10,
      text,
      life: 0.55,
      color: kind === '弓' ? '#2a6f97' : kind === '刀' ? '#9b2226' : '#333',
    })
  }
}
