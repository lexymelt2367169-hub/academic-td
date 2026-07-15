import {
  castSkill,
  createBattle,
  doRecruit,
  makeLayout,
  mergeDrag,
  placeFromRecruit,
  refreshRecruit,
  setSearch,
  updateBattle,
  type BattleMode,
  type BattleState,
  type Layout,
} from './game/battle'
import { UNIT_KINDS, type UnitKind } from './config/units'
import { RECRUIT_COST } from './config/units'
import {
  applyRankedResult,
  currentTier,
  loadSave,
  recordFriendWin,
} from './meta/save'

type Screen = 'hall' | 'battle' | 'settle'

const app = document.querySelector<HTMLDivElement>('#app')!

let screen: Screen = 'hall'
let battle: BattleState | null = null
let layout: Layout | null = null
let mode: BattleMode = 'ranked'
let settleText = ''
let activeSide: 0 | 1 = 0
let drag:
  | { type: 'recruit'; side: 0 | 1; index: number }
  | { type: 'board'; side: 0 | 1; id: number }
  | null = null
let pointer = { x: 0, y: 0 }
let searchOpen = false

function renderHall() {
  const save = loadSave()
  const tier = currentTier(save)
  app.innerHTML = `
    <div class="shell hall">
      <header class="hero">
        <p class="eyebrow">网页原型</p>
        <h1>学术塔防</h1>
        <p class="sub">组会招募 · 文字合成 · 守护答辩稿</p>
      </header>
      <section class="card status">
        <div><span>段位</span><strong>${tier.name}</strong></div>
        <div><span>星级</span><strong>${'★'.repeat(save.stars)}${'☆'.repeat(Math.max(0, tier.starsPerTier - save.stars))}</strong></div>
        <div><span>战绩</span><strong>${save.wins}胜 ${save.losses}负</strong></div>
        <div><span>友谊赛胜</span><strong>${save.friendWins}</strong></div>
      </section>
      <div class="actions">
        <button class="btn primary" id="btn-ranked">排位答辩（异步影子）</button>
        <button class="btn" id="btn-hotseat">好友热座（不计星）</button>
      </div>
      <p class="hint">拖拽招募单位到棋盘；拖到同级同种上可合成。金色单字相邻按序拼成武将。</p>
    </div>
  `
  document.getElementById('btn-ranked')!.onclick = () => startBattle('ranked')
  document.getElementById('btn-hotseat')!.onclick = () => startBattle('hotseat')
}

function startBattle(m: BattleMode) {
  mode = m
  battle = createBattle(m)
  screen = 'battle'
  searchOpen = false
  activeSide = 0
  renderBattleShell()
  requestAnimationFrame(loop)
}

function renderBattleShell() {
  app.innerHTML = `
    <div class="shell battle-shell">
      <canvas id="game"></canvas>
      <div class="hud" id="hud"></div>
      <div class="dock" id="dock"></div>
    </div>
  `
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  resize(canvas)
  bindInput(canvas)
  window.onresize = () => resize(canvas)
  paintHud()
  paintDock()
}

function resize(canvas: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.min(window.innerWidth, 480)
  const h = Math.min(window.innerHeight, 860)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  layout = makeLayout(w, h, mode === 'hotseat')
}

function paintHud() {
  if (!battle) return
  const s = battle
  const hud = document.getElementById('hud')!
  hud.innerHTML = `
    <div class="hud-row">
      <span>☕ ${s.coffee}${mode === 'hotseat' ? ` | P2 ${s.coffee2}` : ''}</span>
      <span>稿❤ ${s.hp}${mode === 'hotseat' ? ` | P2 ${s.hp2}` : ''}</span>
      <span>波次 ${s.wave}/10</span>
    </div>
    <div class="hud-msg">${s.message}</div>
  `
}

function paintDock() {
  if (!battle) return
  const s = battle
  const dock = document.getElementById('dock')!
  const side = activeSide
  const slots = side === 0 ? s.recruit : s.recruit2
  const freeR = side === 0 ? s.freeRefresh : s.freeRefresh2
  const paidR = side === 0 ? s.paidRefresh : s.paidRefresh2
  const searchL = side === 0 ? s.searchLeft : s.searchLeft2

  dock.innerHTML = `
    <div class="dock-top">
      ${mode === 'hotseat' ? `<button class="chip ${side === 0 ? 'on' : ''}" data-side="0">操作P1</button>
      <button class="chip ${side === 1 ? 'on' : ''}" data-side="1">操作P2</button>` : ''}
      <button class="chip" id="btn-recruit">招募(-${RECRUIT_COST})</button>
      <button class="chip" id="btn-refresh">刷新(免${freeR}/购${2 - paidR})</button>
      <button class="chip" id="btn-search">检索×${searchL}</button>
    </div>
    <div class="slots" id="slots">
      ${slots
        .map((sl, i) => {
          let label = ''
          if (sl.type === 'unit') label = sl.unitKind!
          else if (sl.type === 'frag') label = sl.char!
          else if (sl.type === 'shovel') label = '工位'
          else label = '·'
          const cls =
            sl.type === 'frag' ? 'slot gold' : sl.type === 'shovel' ? 'slot shovel' : 'slot'
          return `<button class="${cls}" data-slot="${i}">${label}</button>`
        })
        .join('')}
    </div>
    <div class="skills" id="skills"></div>
    ${
      searchOpen
        ? `<div class="search-panel">${UNIT_KINDS.map(
            (k) => `<button class="chip" data-search="${k}">${k}</button>`,
          ).join('')}<button class="chip" id="search-cancel">取消</button></div>`
        : ''
    }
  `

  dock.querySelectorAll('[data-side]').forEach((el) => {
    ;(el as HTMLButtonElement).onclick = () => {
      activeSide = Number((el as HTMLElement).dataset.side) as 0 | 1
      paintDock()
    }
  })
  document.getElementById('btn-recruit')!.onclick = () => {
    doRecruit(s, activeSide)
    paintDock()
    paintHud()
  }
  document.getElementById('btn-refresh')!.onclick = () => {
    refreshRecruit(s, activeSide)
    paintDock()
    paintHud()
  }
  document.getElementById('btn-search')!.onclick = () => {
    searchOpen = !searchOpen
    paintDock()
  }
  document.getElementById('search-cancel')?.addEventListener('click', () => {
    searchOpen = false
    paintDock()
  })
  dock.querySelectorAll('[data-search]').forEach((el) => {
    ;(el as HTMLButtonElement).onclick = () => {
      setSearch(s, activeSide, (el as HTMLElement).dataset.search as UnitKind)
      searchOpen = false
      paintDock()
      paintHud()
    }
  })

  // skills
  const skills = document.getElementById('skills')!
  const gens = s.entities.filter((e) => e.kind === 'general' && e.side === activeSide)
  skills.innerHTML = gens
    .map((g) => {
      if (g.kind !== 'general') return ''
      const ready = g.skillCd <= 0
      return `<button class="skill ${ready ? '' : 'off'}" data-gid="${g.id}">${g.def.name}${ready ? '' : `(${Math.ceil(g.skillCd)}s)`}</button>`
    })
    .join('')
  skills.querySelectorAll('[data-gid]').forEach((el) => {
    ;(el as HTMLButtonElement).onclick = () => {
      castSkill(s, Number((el as HTMLElement).dataset.gid))
      paintHud()
      paintDock()
    }
  })
}

function bindInput(canvas: HTMLCanvasElement) {
  const toLocal = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  canvas.onpointerdown = (e) => {
    if (!battle || !layout) return
    const p = toLocal(e)
    pointer = p
    canvas.setPointerCapture(e.pointerId)

    // recruit slot hit via dock buttons only for click; drag from slots:
    // also allow starting drag from dock slots approximated — handled by slot buttons with pointer
  }

  // Slot drag: attach after paint
  app.onpointerdown = (e) => {
    const t = e.target as HTMLElement
    if (t.dataset.slot != null && battle) {
      drag = { type: 'recruit', side: activeSide, index: Number(t.dataset.slot) }
      const rect = (document.getElementById('game') as HTMLCanvasElement).getBoundingClientRect()
      pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
  }

  canvas.onpointerdown = (e) => {
    if (!battle || !layout) return
    const p = toLocal(e)
    pointer = p
    const hit = hitBoardEntity(p.x, p.y)
    if (hit) {
      drag = { type: 'board', side: hit.side, id: hit.id }
      activeSide = hit.side
      paintDock()
    }
  }

  canvas.onpointermove = (e) => {
    pointer = toLocal(e)
  }

  const end = (e: PointerEvent) => {
    if (!battle || !layout || !drag) return
    const p = toLocal(e)
    const cell = hitCell(p.x, p.y, drag.side)
    if (cell) {
      if (drag.type === 'recruit') {
        placeFromRecruit(battle, drag.side, drag.index, cell.gx, cell.gy)
        paintDock()
      } else {
        mergeDrag(battle, drag.side, drag.id, cell.gx, cell.gy)
        paintDock()
      }
      paintHud()
    }
    drag = null
  }
  canvas.onpointerup = end
  canvas.onpointercancel = () => {
    drag = null
  }
}

function hitCell(x: number, y: number, side: 0 | 1) {
  if (!layout || !battle) return null
  const board = side === 0 ? layout.board0 : layout.board1
  if (!board) return null
  if (x < board.x || y < board.y || x > board.x + board.w || y > board.y + board.h) return null
  const gx = Math.floor(((x - board.x) / board.w) * battle.cols)
  const gy = Math.floor(((y - board.y) / board.h) * battle.rows)
  if (gx < 0 || gy < 0 || gx >= battle.cols || gy >= battle.rows) return null
  return { gx, gy }
}

function hitBoardEntity(x: number, y: number) {
  if (!battle || !layout) return null
  for (const e of battle.entities) {
    const board = e.side === 0 ? layout.board0 : layout.board1
    if (!board) continue
    const cw = board.w / battle.cols
    const ch = board.h / battle.rows
    const cx = board.x + e.gx * cw + cw / 2
    const cy = board.y + e.gy * ch + ch / 2
    if (Math.hypot(x - cx, y - cy) < Math.min(cw, ch) * 0.45) return e
  }
  return null
}

let last = performance.now()
let hudAcc = 0

function loop(now: number) {
  if (screen !== 'battle' || !battle || !layout) return
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  updateBattle(battle, dt, layout)
  draw()
  hudAcc += dt
  if (hudAcc > 0.25) {
    hudAcc = 0
    paintHud()
    // refresh skill cds
    const skills = document.getElementById('skills')
    if (skills) paintDock()
  }
  if (battle.phase !== 'playing') {
    showSettle()
    return
  }
  requestAnimationFrame(loop)
}

function draw() {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')
  if (!canvas || !battle || !layout) return
  const ctx = canvas.getContext('2d')!
  const w = layout.w
  const h = layout.h
  ctx.clearRect(0, 0, w, h)

  // background
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#f3efe6')
  g.addColorStop(1, '#e4ddd0')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  drawBoard(ctx, battle, layout, 0)
  if (mode === 'hotseat' && layout.board1) drawBoard(ctx, battle, layout, 1)

  // paths
  drawPath(ctx, layout.path0)
  if (layout.path1) drawPath(ctx, layout.path1)

  // manuscript
  drawManuscript(ctx, layout.board0, battle.hp, '稿')
  if (layout.board1) drawManuscript(ctx, layout.board1, battle.hp2, '稿')

  // entities
  for (const e of battle.entities) {
    const board = e.side === 0 ? layout.board0 : layout.board1!
    const cw = board.w / battle.cols
    const ch = board.h / battle.rows
    let x = board.x + e.gx * cw + cw / 2
    let y = board.y + e.gy * ch + ch / 2
    if (drag && drag.type === 'board' && drag.id === e.id) {
      x = pointer.x
      y = pointer.y
    }
    const label =
      e.kind === 'unit'
        ? `${e.unitKind}${e.level}`
        : e.kind === 'frag'
          ? e.char
          : e.def.name
    ctx.fillStyle = e.kind === 'frag' ? '#c9a227' : e.kind === 'general' ? '#1d3557' : '#2b2b2b'
    ctx.beginPath()
    ctx.arc(x, y, Math.min(cw, ch) * 0.36, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${Math.floor(Math.min(cw, ch) * 0.32)}px "Songti SC", "SimSun", serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y)
  }

  // enemies
  for (const en of battle.enemies) {
    ctx.fillStyle = en.boss ? '#7b2d26' : '#4a4a4a'
    const r = en.boss ? 14 : 10
    ctx.beginPath()
    ctx.arc(en.x, en.y, r, 0, Math.PI * 2)
    ctx.fill()
    // hp bar
    ctx.fillStyle = '#222'
    ctx.fillRect(en.x - 12, en.y - r - 8, 24, 4)
    ctx.fillStyle = '#2a9d8f'
    ctx.fillRect(en.x - 12, en.y - r - 8, 24 * (en.hp / en.maxHp), 4)
  }

  // floats
  for (const f of battle.floats) {
    ctx.globalAlpha = Math.max(0, f.life * 1.5)
    ctx.fillStyle = f.color
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(f.text, f.x, f.y - (0.55 - f.life) * 20)
    ctx.globalAlpha = 1
  }

  // drag ghost from recruit
  if (drag?.type === 'recruit') {
    const slots = drag.side === 0 ? battle.recruit : battle.recruit2
    const sl = slots[drag.index]
    if (sl && sl.type !== 'empty') {
      const label = sl.type === 'unit' ? sl.unitKind! : sl.type === 'frag' ? sl.char! : '工'
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.beginPath()
      ctx.arc(pointer.x, pointer.y, 22, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 18px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, pointer.x, pointer.y)
    }
  }
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  s: BattleState,
  lay: Layout,
  side: 0 | 1,
) {
  const board = side === 0 ? lay.board0 : lay.board1!
  const unlocked = side === 0 ? s.unlockedCells : s.unlockedCells2
  const cw = board.w / s.cols
  const ch = board.h / s.rows
  for (let gy = 0; gy < s.rows; gy++) {
    for (let gx = 0; gx < s.cols; gx++) {
      const x = board.x + gx * cw
      const y = board.y + gy * ch
      const open = unlocked.has(`${gx},${gy}`)
      ctx.fillStyle = open ? 'rgba(255,255,255,0.55)' : 'rgba(120,120,120,0.15)'
      ctx.strokeStyle = 'rgba(80,70,60,0.25)'
      ctx.lineWidth = 1
      ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4)
      ctx.strokeRect(x + 2, y + 2, cw - 4, ch - 4)
    }
  }
  ctx.fillStyle = '#5c4a32'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(side === 0 ? 'P1 防线' : 'P2 防线', board.x, board.y - 6)
}

function drawPath(ctx: CanvasRenderingContext2D, path: { x: number; y: number }[]) {
  ctx.strokeStyle = 'rgba(180,60,50,0.35)'
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.beginPath()
  path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.stroke()
}

function drawManuscript(
  ctx: CanvasRenderingContext2D,
  board: { x: number; y: number; w: number; h: number },
  hp: number,
  label: string,
) {
  const x = board.x + 24
  const y = board.y + board.h - 28
  ctx.fillStyle = '#fff8e7'
  ctx.strokeStyle = '#8b6914'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.rect(x - 18, y - 18, 36, 36)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#5c4a32'
  ctx.font = 'bold 16px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y)
  ctx.font = '10px sans-serif'
  ctx.fillText(`❤${hp}`, x, y + 22)
}

function showSettle() {
  if (!battle) return
  let title = battle.message
  if (mode === 'ranked') {
    const r = applyRankedResult(battle.phase === 'won')
    settleText = r.message
    title = battle.phase === 'won' ? '答辩全票通过' : '答辩未通过'
  } else {
    if (battle.phase === 'won') recordFriendWin()
    settleText = `${battle.message}（友谊赛不计星）`
    title = '热座结束'
  }
  screen = 'settle'
  app.innerHTML = `
    <div class="shell settle">
      <h1>${title}</h1>
      <p>${settleText}</p>
      <button class="btn primary" id="again">再来一局</button>
      <button class="btn" id="home">返回大厅</button>
    </div>
  `
  document.getElementById('again')!.onclick = () => startBattle(mode)
  document.getElementById('home')!.onclick = () => {
    screen = 'hall'
    renderHall()
  }
}

renderHall()
