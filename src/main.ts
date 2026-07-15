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
import { RECRUIT_COST, UNIT_KINDS, type UnitKind } from './config/units'
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
let drag: { type: 'board'; side: 0 | 1; id: number } | null = null
let pointer = { x: 0, y: 0 }
let searchOpen = false
let selectedRecruit: { side: 0 | 1; index: number } | null = null
let battleStarted = false
let battlePaused = false
let battleSpeed = 1

const UNIT_TIPS: Record<UnitKind, string> = {
  刀: '近战单点，高频批改',
  枪: '穿透质询，可同时打击多个目标',
  弓: '超远射程，优先压制后排审稿人',
  骑: '范围冲击，适合清理密集敌群',
}

const UNIT_COLORS: Record<UnitKind, string> = {
  刀: '#b95042',
  枪: '#7559a6',
  弓: '#277d8d',
  骑: '#c27c0e',
}

function renderHall() {
  const save = loadSave()
  const tier = currentTier(save)
  const stars =
    tier.id === 'acad'
      ? '荣誉段位'
      : `${'★'.repeat(save.stars)}${'☆'.repeat(Math.max(0, Math.min(tier.starsPerTier, 5) - save.stars))}`
  app.innerHTML = `
    <div class="shell hall">
      <header class="hero hero-panel">
        <div class="hero-topline"><span>ACADEMIC TD</span><span class="version-tag">原型 0.2</span></div>
        <p class="eyebrow">一篇论文，十轮答辩</p>
        <h1><span>学术</span>塔防</h1>
        <p class="sub">招募研究组成员，合成学术武将，守住你的答辩稿。</p>
        <div class="mission-strip"><span>本局目标</span><strong>顶住 10 波审稿人</strong><i>稿件生命 ×3</i></div>
      </header>
      <section class="status-card">
        <div><span>当前段位</span><strong>${tier.name}</strong></div>
        <div><span>星级</span><strong class="stars">${stars}</strong></div>
        <div><span>排位战绩</span><strong>${save.wins} 胜 · ${save.losses} 负</strong></div>
        <div><span>热座胜场</span><strong>${save.friendWins}</strong></div>
      </section>
      <section class="newbie-card">
        <p class="section-kicker">新手三步</p>
        <div class="steps"><div><b>01</b><span>点选卡牌<br/>布置研究员</span></div><div><b>02</b><span>同种单位<br/>合成升星</span></div><div><b>03</b><span>拼出校名<br/>激活武将</span></div></div>
      </section>
      <div class="actions">
        <button class="btn primary play-btn" id="btn-ranked"><span>开始排位答辩</span><small>单人 · 计入段位</small></button>
        <button class="btn secondary" id="btn-hotseat"><span>好友热座</span><small>双人同屏 · 不计星</small></button>
      </div>
      <p class="hint">刀、枪、弓、骑各有定位；金色校名碎片按顺序相邻即可召唤武将。每波都有研究经费，击败审稿人还会掉落咖啡。</p>
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
  selectedRecruit = null
  drag = null
  battleStarted = false
  battlePaused = false
  battleSpeed = 1
  last = performance.now()
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
  const w = Math.min(window.innerWidth, 720)
  const h = Math.min(window.innerHeight, 900)
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
  const state = !battleStarted ? '准备布阵' : battlePaused ? '暂停中' : `进行中 ×${battleSpeed}`
  const runLabel = !battleStarted ? '开始答辩' : battlePaused ? '继续' : '暂停'
  hud.innerHTML = `
    <div class="hud-row">
      <div class="hud-stats"><span>☕ ${s.coffee}${mode === 'hotseat' ? ` / P2 ${s.coffee2}` : ''}</span><span>稿件 ♥ ${s.hp}${mode === 'hotseat' ? ` / P2 ${s.hp2}` : ''}</span><span>击退 ${s.defeated}${mode === 'hotseat' ? ` / ${s.defeated2}` : ''}</span></div>
      <div class="hud-actions"><button class="control" id="btn-speed" title="切换 1 倍或 2 倍速度">×${battleSpeed}</button><button class="control primary-control" id="btn-run">${runLabel}</button><button class="control" id="btn-exit" title="返回大厅">⌂</button></div>
    </div>
    <div class="wave-line"><span>第 ${s.wave || 1} / 10 波</span><div><i style="width:${Math.max(4, (Math.min(s.wave, 10) / 10) * 100)}%"></i></div><em>${state}</em></div>
    <div class="hud-msg">${s.message}</div>
  `
  document.getElementById('btn-run')!.onclick = () => {
    if (!battle) return
    if (!battleStarted) {
      battleStarted = true
      battlePaused = false
      battle.message = '答辩开始：击败审稿人，守住论文！'
    } else {
      battlePaused = !battlePaused
      battle.message = battlePaused ? '答辩暂缓：可调整阵型' : '答辩继续'
    }
    paintHud()
  }
  document.getElementById('btn-speed')!.onclick = () => {
    battleSpeed = battleSpeed === 1 ? 2 : 1
    paintHud()
  }
  document.getElementById('btn-exit')!.onclick = () => {
    screen = 'hall'
    battle = null
    layout = null
    renderHall()
  }
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
  const selected = selectedRecruit?.side === side ? selectedRecruit.index : -1

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
          const tone =
            sl.type === 'frag' ? 'gold' : sl.type === 'shovel' ? 'shovel' : sl.type === 'empty' ? 'empty' : `unit-${sl.unitKind}`
          const cls = `slot ${tone} ${selected === i ? 'selected' : ''}`
          const hint =
            sl.type === 'unit'
              ? UNIT_TIPS[sl.unitKind!]
              : sl.type === 'frag'
                ? '校名碎片：按顺序相邻拼出武将'
                : sl.type === 'shovel'
                  ? '扩建一个相邻的空工位'
                  : '空卡槽'
          return `<button class="${cls}" data-slot="${i}" title="${hint}" ${sl.type === 'empty' ? 'disabled' : ''}><b>${label}</b><small>${sl.type === 'unit' ? '研究员' : sl.type === 'frag' ? '校名' : sl.type === 'shovel' ? '扩建' : ''}</small></button>`
        })
        .join('')}
    </div>
    <p class="dock-instruction">${selectedRecruit ? '已选中卡牌：点击棋盘中的浅色工位落位。' : '点选卡牌后点击落位；拖动棋盘单位可合成或换位。'}</p>
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
      selectedRecruit = null
      paintDock()
    }
  })
  dock.querySelectorAll('[data-slot]').forEach((el) => {
    ;(el as HTMLButtonElement).onpointerdown = (event) => {
      event.preventDefault()
      event.stopPropagation()
      const index = Number((el as HTMLElement).dataset.slot)
      const slot = slots[index]
      if (!slot || slot.type === 'empty') return
      selectedRecruit = { side, index }
      drag = null
      const label = slot.type === 'unit' ? slot.unitKind : slot.type === 'frag' ? slot.char : '工位'
      s.message = `已选择 ${label}：点击棋盘落位`
      paintDock()
      paintHud()
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
      return `<button class="skill ${ready ? '' : 'off'}" title="${g.def.desc}" data-gid="${g.id}">${g.def.name}${ready ? '' : `(${Math.ceil(g.skillCd)}s)`}</button>`
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
    if (selectedRecruit) {
      const cell = hitCell(p.x, p.y, selectedRecruit.side)
      if (!cell) {
        battle.message = '请在当前玩家的棋盘内选择一个工位'
      } else {
        placeFromRecruit(battle, selectedRecruit.side, selectedRecruit.index, cell.gx, cell.gy)
        selectedRecruit = null
      }
      paintDock()
      paintHud()
      return
    }
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
      mergeDrag(battle, drag.side, drag.id, cell.gx, cell.gy)
      paintDock()
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
  const rawDt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (battleStarted && !battlePaused) {
    updateBattle(battle, rawDt * battleSpeed, layout)
    hudAcc += rawDt
  }
  draw()
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

  // paper-and-ink background
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#f7f3e9')
  g.addColorStop(0.52, '#e8dfcc')
  g.addColorStop(1, '#d5c4ad')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = 0.16
  ctx.strokeStyle = '#8e755c'
  ctx.lineWidth = 1
  for (let y = 76; y < h; y += 24) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

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
    const radius = Math.min(cw, ch) * 0.34
    ctx.save()
    ctx.shadowColor = 'rgba(50, 35, 20, 0.23)'
    ctx.shadowBlur = 7
    ctx.shadowOffsetY = 3
    ctx.fillStyle =
      e.kind === 'frag'
        ? '#c9a227'
        : e.kind === 'general'
          ? '#183a5a'
          : UNIT_COLORS[e.unitKind]
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = e.kind === 'frag' ? '#f5dd8a' : 'rgba(255,255,255,0.72)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${Math.floor(Math.min(cw, ch) * (e.kind === 'general' ? 0.23 : 0.3))}px "Songti SC", "SimSun", serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y)
    if (e.kind === 'unit') {
      ctx.fillStyle = 'rgba(255,255,255,0.94)'
      ctx.beginPath()
      ctx.arc(x + radius * 0.66, y - radius * 0.65, Math.max(7, radius * 0.32), 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = UNIT_COLORS[e.unitKind]
      ctx.font = `bold ${Math.max(8, Math.floor(radius * 0.46))}px sans-serif`
      ctx.fillText(String(e.level), x + radius * 0.66, y - radius * 0.65)
    }
    ctx.restore()
  }

  // enemies
  for (const en of battle.enemies) {
    ctx.fillStyle = en.boss ? '#7b2d26' : '#4c5963'
    const r = en.boss ? 14 : 10
    ctx.beginPath()
    ctx.arc(en.x, en.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff8ed'
    ctx.font = `bold ${en.boss ? 11 : 9}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(en.boss ? '审' : '评', en.x, en.y + 0.5)
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
      ctx.fillStyle = open ? 'rgba(255,253,246,0.78)' : 'rgba(104,87,68,0.13)'
      ctx.strokeStyle = open ? 'rgba(111,82,53,0.24)' : 'rgba(104,87,68,0.12)'
      ctx.lineWidth = 1
      ctx.fillRect(x + 3, y + 3, cw - 6, ch - 6)
      ctx.strokeRect(x + 3, y + 3, cw - 6, ch - 6)
      if (!open) {
        ctx.fillStyle = 'rgba(104,87,68,0.23)'
        ctx.font = '11px serif'
        ctx.textAlign = 'center'
        ctx.fillText('待扩建', x + cw / 2, y + ch / 2)
      }
    }
  }
  ctx.fillStyle = '#60462e'
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(side === 0 ? 'P1 防线' : 'P2 防线', board.x, board.y - 6)
}

function drawPath(ctx: CanvasRenderingContext2D, path: { x: number; y: number }[]) {
  ctx.strokeStyle = 'rgba(166,71,48,0.35)'
  ctx.lineWidth = 10
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
  ctx.fillStyle = '#fffdf6'
  ctx.strokeStyle = '#9a6f21'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.rect(x - 18, y - 18, 36, 36)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#5c4a32'
  ctx.font = 'bold 16px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y - 2)
  ctx.font = '10px sans-serif'
  ctx.fillText(`论文 ♥${hp}`, x, y + 22)
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
