'use strict'

// The whole film is a pure function of time: renderFrame(ctx, t) draws frame t from scratch,
// so playback, scrubbing and export all share one code path.

const COPY = {
  hook: 'Your context window fills up fast.',
  hookSub: 'Usually, you find out too late.',
  name: ['usage', '-inspector'],
  tagline: 'See where every token goes.',
  heads: [
    { a: 4.75, b: 6.4, kicker: '01   CONTEXT', title: ['Context, at a glance.'], sub: 'Live usage, tokens and cost, right above your prompt.', mode: 'top' },
    { a: 6.75, b: 8.5, kicker: '02   TURNS', title: ['Spot the expensive prompt.'], sub: 'Tokens added by each of your last eight prompts.', mode: 'top' },
    { a: 8.85, b: 10.6, kicker: '03   LIMITS', title: ['Pace your limits.'], sub: '5-hour and 7-day usage, measured against time elapsed.', mode: 'top' },
    { a: 10.9, b: 12.95, kicker: '04   BREAKDOWN', title: ["Find what's eating", 'your context.'], sub: 'Categories and MCP servers, ranked by tokens.', mode: 'left' },
  ],
  install: '/plugin install usage-inspector@usage-inspector',
  platforms: ['Claude Code', 'Claude Code Desktop'],
}

// World layout: a 1400×760 Claude Code window; the band sits just above the prompt box.
const WIN = { x: 260, y: 170, w: 1400, h: 760 }
const BAR_Y = 772
const BAR_H = 20
const TEXT_Y = 824
const CTX_X = 300
const CTX_W = 300
const TURNS_X = 652
const SLOT = 22
const TURN_W = 14
const TURN_MAX_H = 34
const LIMITS = [
  { label: '5h', x: 872, w: 260, left: '2h41m · 18:30', used: [31, 52], elapsed: [42, 46] },
  { label: '7d', x: 1182, w: 260, left: '4d6h · Mon 09:00', used: [18, 21], elapsed: [38.6, 39] },
]
const INFO = { x: 1606, y: 790, r: 16 }
const PANE = { x: 1172, y: 206, w: 468, h: 530 }
const OLD_TURNS = [6, 11, 4, 9, 14, 5]
const BREAKDOWN = [
  ['System prompt', 3], ['System tools', 14], ['MCP tools', 22], ['Memory files', 6],
  ['Skills', 4], ['Messages', 91], ['Free space', 60, true],
]
const SERVERS = [['github', 11], ['postgres', 7], ['browser', 4]]

// Camera keys: [t, worldX, worldY, ln(zoom), anchorX, anchorY]. The world point lands on the anchor.
const CAM = [
  [0, 960, 550, 0, 960, 640],
  [4.45, 960, 550, 0, 960, 640],
  [5.15, 450, 790, Math.log(1.9), 960, 700],
  [6.3, 450, 790, Math.log(1.9), 960, 700],
  [6.9, 734, 790, Math.log(2.3), 960, 700],
  [8.4, 734, 790, Math.log(2.3), 960, 700],
  [9.0, 1155, 790, Math.log(1.55), 960, 700],
  [10.5, 1155, 790, Math.log(1.55), 960, 700],
  [11.15, 1330, 520, Math.log(1.2), 1290, 545],
  [15, 1330, 520, Math.log(1.2), 1290, 545],
]

// Spotlight keys: [t, x, y, w, h, strength] in world space.
const SPOT = [
  [0, 284, 748, 1352, 86, 0],
  [4.45, 284, 748, 1352, 86, 0],
  [5.15, 282, 750, 336, 84, 1],
  [6.3, 282, 750, 336, 84, 1],
  [6.9, 634, 750, 200, 84, 1],
  [8.4, 634, 750, 200, 84, 1],
  [9.0, 852, 750, 606, 84, 1],
  [10.5, 852, 750, 606, 84, 1],
  [11.15, 1160, 196, 492, 560, 0],
]

const camera = t => {
  const [cx, cy, lz, ax, ay] = keyed(CAM, t)
  return { cx, cy, z: Math.exp(lz), ax, ay }
}
const toScreen = (cam, x, y) => [(x - cam.cx) * cam.z + cam.ax, (y - cam.cy) * cam.z + cam.ay]

// Live values shown in the band, all derived from t.
// The current prompt adds 18k (49% → 58%); the next one adds 24k (→ 70%), matching the pane.
const curTurn = t => 18 * Ease.inOutCubic(prog(t, 4.8, 6.1))
const newTurn = t => 24 * Ease.outCubic(prog(t, 7.2, 8.0))
const ctxPct = t => 49 + 9 * Ease.inOutCubic(prog(t, 4.8, 6.1)) + 12 * Ease.outCubic(prog(t, 7.2, 8.0))
const cost = t => 1.23 + 0.64 * Ease.inOutCubic(prog(t, 4.8, 6.1)) + 0.54 * Ease.outCubic(prog(t, 7.2, 8.0))
const working = t => prog(t, 4.6, 5.0) * (1 - prog(t, 8.0, 8.4))

let dotPattern = null

function background(ctx, t, cam) {
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)

  if (!dotPattern) {
    const tile = document.createElement('canvas')
    tile.width = tile.height = 36
    const g = tile.getContext('2d')
    g.fillStyle = 'rgba(255,255,255,0.065)'
    g.beginPath()
    g.arc(18, 18, 1.3, 0, Math.PI * 2)
    g.fill()
    dotPattern = ctx.createPattern(tile, 'repeat')
  }
  ctx.save()
  ctx.translate((-(cam.cx - 960) * 0.08) % 36, (-(cam.cy - 550) * 0.08) % 36)
  ctx.fillStyle = dotPattern
  ctx.fillRect(-72, -72, W + 144, H + 144)
  ctx.restore()

  const glow = (x, y, r, col, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, css(col, a))
    g.addColorStop(1, css(col, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  glow(960 + Math.sin(t * 0.35) * 260, 160 + Math.cos(t * 0.27) * 60, 860, C.accent, 0.17)
  glow(1560 - Math.sin(t * 0.22) * 160, 1000, 760, C.violet, 0.1)

  const v = ctx.createRadialGradient(960, 540, 480, 960, 540, 1250)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.6)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, W, H)
}

function dot(ctx, x, y, col) {
  ctx.beginPath()
  ctx.arc(x, y, 5, 0, Math.PI * 2)
  ctx.fillStyle = col
  ctx.fill()
}

function chat(ctx, t) {
  fillRound(ctx, 284, 222, 1352, 44, 8, 'rgba(255,255,255,0.045)')
  txt(ctx, '›', 304, 251, { mono: true, size: 18, color: C.dim })
  txt(ctx, 'refactor the auth middleware and add tests', 328, 251, { mono: true, size: 18 })

  dot(ctx, 306, 300, C.text)
  txt(ctx, "I'll start by reading the current middleware.", 324, 306, { size: 19 })

  const tool = (y, name, arg, note) => {
    dot(ctx, 306, y - 6, css(C.green))
    const w = txt(ctx, name, 324, y, { size: 19, weight: 700 })
    txt(ctx, arg, 324 + w, y, { size: 19, color: C.dim })
    txt(ctx, `└  ${note}`, 330, y + 30, { mono: true, size: 16, color: C.faint })
  }
  tool(352, 'Read', '(src/auth/middleware.ts)', 'Read 214 lines')
  tool(432, 'Update', '(src/auth/middleware.ts)', 'Updated with 18 additions and 6 removals')

  const diff = [
    [' 41   if (!token) return unauthorized()', null],
    ['-42   const user = decode(token)', C.red],
    ['+42   const user = await verify(token, keys)', C.green],
    ['+43   if (user.expired) return refresh(user)', C.green],
  ]
  diff.forEach(([line, col], i) => {
    const y = 480 + i * 30
    if (col) {
      ctx.fillStyle = css(col, 0.1)
      ctx.fillRect(330, y, 1180, 28)
    }
    txt(ctx, line, 342, y + 20, { mono: true, size: 16, color: col ? css(col, 0.9) : C.dim })
  })

  if (t < 8.1) {
    const glyphs = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
    txt(ctx, glyphs[Math.floor(t * 9) % glyphs.length], 300, 664, { size: 22, color: C.coral })
    const w = txt(ctx, 'Writing tests…', 326, 664, { size: 19, color: C.coral })
    const secs = Math.max(4, Math.floor(t * 2.2))
    txt(ctx, `  (${secs}s · ↓ ${(1.4 + t * 0.21).toFixed(1)}k tokens · esc to interrupt)`, 326 + w, 664, { size: 17, color: C.faint })
  } else {
    dot(ctx, 306, 658, css(C.green))
    txt(ctx, 'Tests added. 12 passing.', 324, 664, { size: 19 })
  }
}

function band(ctx, t) {
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(284, 742, 1352, 1)

  const flow = working(t)
  const pct = ctxPct(t)
  const ctxCol = ctxColor(pct)
  meter(ctx, CTX_X, BAR_Y, CTX_W, BAR_H, pct, undefined, ctxCol, t, flow)
  let x = CTX_X
  x += txt(ctx, `${Math.round(pct)}%`, x, TEXT_Y, { size: 20, weight: 700 }) + 14
  x += txt(ctx, `${fmtK(pct * 2000)} / 200k`, x, TEXT_Y, { size: 18, color: C.dim }) + 14
  txt(ctx, `$${cost(t).toFixed(2)}`, x, TEXT_Y, { size: 18, weight: 700 })

  turnsBars(ctx, t, flow)

  for (const l of LIMITS) {
    const p = Ease.inOutCubic(prog(t, 9.0, 10.2))
    const used = lerp(l.used[0], l.used[1], p)
    const elapsed = lerp(l.elapsed[0], l.elapsed[1], p)
    const col = paceColor(used, elapsed)
    meter(ctx, l.x, BAR_Y, l.w, BAR_H, used, elapsed, col, t, flow)
    let lx = l.x
    lx += txt(ctx, l.label, lx, TEXT_Y, { size: 20, weight: 700 }) + 12
    lx += txt(ctx, `${Math.round(used)}%`, lx, TEXT_Y, { size: 20, weight: 700, color: css(col) }) + 12
    txt(ctx, l.left, lx, TEXT_Y, { size: 17, color: C.dim })
  }

  const press = bump(t, 11.5, 11.75)
  ctx.save()
  ctx.translate(INFO.x, INFO.y)
  ctx.scale(1 - 0.1 * press, 1 - 0.1 * press)
  ctx.beginPath()
  ctx.arc(0, 0, INFO.r, 0, Math.PI * 2)
  ctx.fillStyle = css(C.accent, 0.4 * press + 0.04)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  txt(ctx, 'i', 0, 6.5, { size: 18, weight: 700, align: 'center', color: '#d6dbe6' })
  ctx.restore()
}

// Eight slots; when the new prompt lands every bar slides one slot left, as in turnsSvg().
function turnsBars(ctx, t, flow) {
  const shift = Ease.inOutCubic(prog(t, 6.95, 7.25))
  const nv = newTurn(t)
  const cur = curTurn(t)
  const max = Math.max(14, cur, nv)
  const bottom = BAR_Y + BAR_H
  const oldCurrent = 1 - prog(t, 7.0, 7.3)
  const cells = [null, ...OLD_TURNS, cur, t >= 6.95 ? nv : undefined]

  ctx.save()
  ctx.beginPath()
  ctx.rect(TURNS_X - 4, bottom - TURN_MAX_H - 12, SLOT * 8 + 4, TURN_MAX_H + 16)
  ctx.clip()
  cells.forEach((v, i) => {
    if (v === undefined) return
    const x = TURNS_X + (i - shift) * SLOT
    if (v === null) {
      const swing = flow * (Math.sin(t * 3.5 - i * 0.75) + 1) * 2.5
      const h = 5 + swing
      fillRound(ctx, x, bottom - h, TURN_W, h, 3, `rgba(128,128,128,${0.22 * (1 - shift)})`)
      return
    }
    const h = v <= 0 ? 4 : Math.max(5, (v / max) * TURN_MAX_H)
    const isNew = i === cells.length - 1
    const accent = isNew ? 1 : i === cells.length - 2 ? oldCurrent : 0
    fillRound(ctx, x, bottom - h, TURN_W, h, 3, 'rgba(140,146,160,0.5)')
    if (accent > 0) {
      ctx.save()
      ctx.shadowColor = css(C.accent, 0.7 * accent)
      ctx.shadowBlur = 14
      fillRound(ctx, x, bottom - h, TURN_W, h, 3, css(C.accent, accent))
      ctx.restore()
    }
  })
  ctx.restore()

  const w = txt(ctx, 'Turns', TURNS_X, TEXT_Y, { size: 18, color: C.dim })
  const shown = Math.round(t < 7.2 ? cur : nv)
  txt(ctx, `+${shown}k`, TURNS_X + w + 12, TEXT_Y, { size: 20, weight: 700, color: css(C.accent) })
}

function promptBox(ctx) {
  ctx.beginPath()
  roundPath(ctx, 284, 846, 1352, 60, 12)
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  txt(ctx, '›', 306, 883, { mono: true, size: 20, color: C.dim })
  txt(ctx, 'Try "/context-detail"', 332, 883, { mono: true, size: 18, color: C.faint })
}

function drawWindow(ctx, t) {
  const { x, y, w, h } = WIN
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 70
  ctx.shadowOffsetY = 30
  fillRound(ctx, x, y, w, h, 18, '#10141c')
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  roundPath(ctx, x, y, w, h, 18)
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#141924')
  g.addColorStop(1, '#0d1118')
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()

  ctx.fillStyle = 'rgba(255,255,255,0.025)'
  ctx.fillRect(x, y, w, 44)
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.fillRect(x, y + 44, w, 1)
  ;['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
    ctx.beginPath()
    ctx.arc(x + 26 + i * 22, y + 22, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = col
    ctx.fill()
  })
  txt(ctx, 'claude — ~/projects/api', x + w / 2, y + 28, { mono: true, size: 15, color: C.faint, align: 'center' })

  chat(ctx, t)
  band(ctx, t)
  promptBox(ctx)
  pane(ctx, t)
  ctx.restore()

  ctx.beginPath()
  roundPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 18)
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function pane(ctx, t) {
  const p = Ease.outQuint(prog(t, 11.62, 12.2))
  if (p <= 0) return
  const { y, w, h } = PANE
  const x = PANE.x + (1 - p) * 50

  ctx.save()
  ctx.globalAlpha *= p
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetX = -10
  fillRound(ctx, x, y, w, h, 14, '#161b26')
  ctx.restore()
  ctx.beginPath()
  roundPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 14)
  ctx.strokeStyle = 'rgba(255,255,255,0.11)'
  ctx.lineWidth = 1
  ctx.stroke()

  txt(ctx, 'Context', x + 24, y + 36, { size: 18, weight: 700 })
  txt(ctx, '×', x + w - 24, y + 37, { size: 22, color: C.faint, align: 'right' })
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.fillRect(x, y + 54, w, 1)

  const w1 = txt(ctx, '70%', x + 24, y + 100, { size: 34, weight: 700 })
  txt(ctx, '140k / 200k  ·  claude-opus-5-5', x + 24 + w1 + 14, y + 98, { mono: true, size: 15, color: C.dim })
  txt(ctx, 'Auto-compact at 167k · 27k left  ·  cache hit 92%', x + 24, y + 130, { size: 15, color: C.dim })

  const heading = (yy, s) => txt(ctx, s, x + 24, yy, { size: 13, weight: 700, color: C.faint, ls: 2 })
  const row = (yy, i, name, k, isFree, col) => {
    const fp = Ease.outCubic(prog(t, 11.85 + i * 0.045, 12.4 + i * 0.045))
    txt(ctx, name, x + 24, yy, { size: 16, color: isFree ? C.faint : C.text })
    txt(ctx, `${k}k`, x + 250, yy, { mono: true, size: 15, color: isFree ? C.faint : C.dim, align: 'right' })
    fillRound(ctx, x + 268, yy - 10, 172, 9, 4.5, 'rgba(128,128,128,0.15)')
    const bw = (k / 200) * 172 * fp
    if (bw > 1) fillRound(ctx, x + 268, yy - 10, Math.max(bw, 9), 9, 4.5, isFree ? 'rgba(128,128,128,0.45)' : css(col))
  }

  heading(y + 172, 'BREAKDOWN')
  BREAKDOWN.forEach(([n, k, isFree], i) => row(y + 202 + i * 28, i, n, k, isFree, C.accent))
  heading(y + 418, 'MCP SERVERS')
  SERVERS.forEach(([n, k], i) => row(y + 448 + i * 28, i + BREAKDOWN.length, n, k, false, C.yellow))
  ctx.restore()
}

function cursor(ctx, t) {
  const a = prog(t, 10.95, 11.15) * (1 - prog(t, 12.2, 12.5))
  if (a <= 0) return
  const p = Ease.inOutCubic(prog(t, 11.0, 11.5))
  const x = lerp(1420, INFO.x + 3, p)
  const y = lerp(560, INFO.y + 4, p)

  const rp = prog(t, 11.55, 12.1)
  if (rp > 0 && rp < 1) {
    ctx.beginPath()
    ctx.arc(INFO.x, INFO.y, INFO.r + Ease.outCubic(rp) * 34, 0, Math.PI * 2)
    ctx.strokeStyle = css(C.accent, (1 - rp) * 0.85)
    ctx.lineWidth = 2
    ctx.stroke()
  }

  const s = 1.15 * (1 - 0.15 * bump(t, 11.5, 11.7))
  ctx.save()
  ctx.globalAlpha *= a
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.beginPath()
  const pts = [[0, 0], [0, 26], [7, 20], [12, 31], [16, 29], [11, 19], [20, 19]]
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
  ctx.closePath()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 3
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = '#0b0d12'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

function spotlight(ctx, t, cam) {
  const [x, y, w, h, s] = keyed(SPOT, t)
  if (s < 0.01) return
  const [sx, sy] = toScreen(cam, x, y)
  const sw = w * cam.z
  const sh = h * cam.z
  const r = 14 * cam.z

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  roundPath(ctx, sx, sy, sw, sh, r)
  ctx.fillStyle = `rgba(4,6,10,${0.62 * s})`
  ctx.fill('evenodd')
  ctx.beginPath()
  roundPath(ctx, sx, sy, sw, sh, r)
  ctx.strokeStyle = css(C.accent, 0.55 * s)
  ctx.lineWidth = 1.5
  ctx.stroke()

  const g = ctx.createLinearGradient(0, 0, 0, 600)
  g.addColorStop(0, `rgba(7,9,13,${0.92 * s})`)
  g.addColorStop(0.65, `rgba(7,9,13,${0.8 * s})`)
  g.addColorStop(1, 'rgba(7,9,13,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, 600)
  ctx.restore()
}

function leftScrim(ctx, t) {
  const a = prog(t, 10.6, 11.1) * (1 - prog(t, 12.85, 13.2))
  if (a <= 0) return
  const g = ctx.createLinearGradient(0, 0, 1150, 0)
  g.addColorStop(0, `rgba(7,9,13,${0.94 * a})`)
  g.addColorStop(0.7, `rgba(7,9,13,${0.75 * a})`)
  g.addColorStop(1, 'rgba(7,9,13,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1150, H)
}

function headline(ctx, t, hd) {
  if (t < hd.a || t > hd.b) return
  const out = Ease.inCubic(prog(t, hd.b - 0.35, hd.b))
  const isTop = hd.mode === 'top'
  const x = isTop ? 960 : 130
  const align = isTop ? 'center' : 'left'
  let y = isTop ? 205 : 380

  const parts = [{ kind: 'kicker', s: hd.kicker, gap: 84 }]
  hd.title.forEach((s, i) => parts.push({ kind: 'title', s, gap: i === hd.title.length - 1 ? 64 : 84 }))
  parts.push({ kind: 'sub', s: hd.sub, gap: 0 })

  parts.forEach((part, i) => {
    const p = Ease.outExpo(prog(t, hd.a + i * 0.07, hd.a + i * 0.07 + 0.8))
    const a = p * (1 - out)
    if (a > 0) {
      ctx.save()
      ctx.globalAlpha = a
      ctx.translate(0, (1 - p) * 30 - out * 14)
      if (part.kind === 'kicker') {
        txt(ctx, part.s, x, y, { mono: true, size: 20, weight: 600, color: css(C.accent), ls: 3, align })
      } else if (part.kind === 'title') {
        const g = ctx.createLinearGradient(0, y - 64, 0, y + 10)
        g.addColorStop(0, '#ffffff')
        g.addColorStop(1, '#aeb9cf')
        txt(ctx, part.s, x, y, { size: 74, weight: 700, color: g, ls: -1.5, align })
      } else {
        txt(ctx, part.s, x, y, { size: 30, color: C.dim, align })
      }
      ctx.restore()
    }
    y += part.gap
  })
}

function hook(ctx, t) {
  if (t > 2.2) return
  const out = Ease.inCubic(prog(t, 1.8, 2.15))
  const p = prog(t, 0.35, 1.75)
  const pct = 12 + 82 * p ** 1.8
  const col = ctxColor(pct)
  const shake = bump(t, 1.35, 1.85) * 6
  const dx = Math.sin(t * 71) * shake
  const dy = Math.cos(t * 83) * shake * 0.6

  ctx.save()
  ctx.globalAlpha = (1 - out) * Ease.outCubic(prog(t, 0, 0.3))
  ctx.translate(960 + dx, 540 + dy)
  ctx.scale(1 - 0.05 * out, 1 - 0.05 * out)

  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 560)
  g.addColorStop(0, css(col, 0.28 * (pct / 100)))
  g.addColorStop(1, css(col, 0))
  ctx.fillStyle = g
  ctx.fillRect(-960, -540, W, H)

  const tp = Ease.outExpo(prog(t, 0.05, 0.8))
  ctx.save()
  ctx.globalAlpha *= tp
  txt(ctx, COPY.hook, 0, -200 + (1 - tp) * 24, { size: 54, weight: 600, align: 'center', ls: -1 })
  ctx.restore()

  txt(ctx, `${Math.round(pct)}%`, 0, 60, { mono: true, size: 200, weight: 700, color: css(col), align: 'center', ls: -6 })
  meter(ctx, -500, 120, 1000, 22, pct, undefined, col, t, 1)
  txt(ctx, 'ctx', -500, 186, { mono: true, size: 20, color: C.dim })
  txt(ctx, `${fmtK(pct * 2000)} / 200k`, 500, 186, { mono: true, size: 20, color: C.dim, align: 'right' })

  const sp = Ease.outExpo(prog(t, 1.0, 1.5))
  ctx.globalAlpha *= sp
  txt(ctx, COPY.hookSub, 0, 270 + (1 - sp) * 16, { size: 32, color: C.dim, align: 'center' })
  ctx.restore()
}

function wordmark(ctx, cx, y, size) {
  const o = { size, weight: 700, ls: -size * 0.025 }
  const w0 = textWidth(ctx, COPY.name[0], o)
  const w1 = textWidth(ctx, COPY.name[1], o)
  const x = cx - (w0 + w1) / 2
  txt(ctx, COPY.name[0], x, y, o)
  txt(ctx, COPY.name[1], x + w0, y, { ...o, color: '#8fb4ff' })
  return w0 + w1
}

function brand(ctx, t) {
  if (t < 1.9 || t > 3.9) return
  const out = Ease.inOutCubic(prog(t, 3.3, 3.85))
  ctx.save()
  ctx.globalAlpha = 1 - out
  ctx.translate(0, -out * 70)

  const ls = Ease.outBack(prog(t, 1.95, 2.5))
  const g = ctx.createRadialGradient(960, 420, 0, 960, 420, 420)
  g.addColorStop(0, css(C.accent, 0.3 * clamp(ls)))
  g.addColorStop(1, css(C.accent, 0))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  ctx.save()
  ctx.translate(960, 420)
  ctx.scale(ls, ls)
  logo(ctx, 0, 0, 132, prog(t, 2.1, 2.7))
  ctx.restore()

  const rp = Ease.outExpo(prog(t, 2.15, 2.95))
  const ww = textWidth(ctx, COPY.name.join(''), { size: 96, weight: 700, ls: -2.4 })
  ctx.save()
  ctx.beginPath()
  ctx.rect(960 - ww / 2 - 12, 480, (ww + 24) * rp, 160)
  ctx.clip()
  ctx.translate(0, (1 - rp) * 12)
  wordmark(ctx, 960, 600, 96)
  ctx.restore()

  const tp = Ease.outExpo(prog(t, 2.6, 3.3))
  ctx.globalAlpha *= tp
  txt(ctx, COPY.tagline, 960, 676 + (1 - tp) * 16, { size: 34, color: C.dim, align: 'center' })
  ctx.restore()
}

function outro(ctx, t) {
  if (t < 13.15) return
  const p = Ease.outExpo(prog(t, 13.2, 13.9))

  const g = ctx.createRadialGradient(960, 420, 0, 960, 420, 640)
  g.addColorStop(0, css(C.accent, 0.22 * p))
  g.addColorStop(1, css(C.accent, 0))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  ctx.save()
  ctx.globalAlpha = p
  ctx.save()
  ctx.translate(960, 380)
  const s = lerp(0.85, 1, p)
  ctx.scale(s, s)
  logo(ctx, 0, 0, 110, prog(t, 13.25, 13.85))
  ctx.restore()
  ctx.translate(0, (1 - p) * 20)
  wordmark(ctx, 960, 536, 84)
  ctx.restore()

  const tp = Ease.outExpo(prog(t, 13.4, 14.0))
  ctx.save()
  ctx.globalAlpha = tp
  txt(ctx, COPY.tagline, 960, 596 + (1 - tp) * 12, { size: 30, color: C.dim, align: 'center' })
  ctx.restore()

  const pp = Ease.outExpo(prog(t, 13.55, 14.05))
  if (pp > 0) {
    const mono = { mono: true, size: 26 }
    const full = textWidth(ctx, COPY.install, mono)
    const pw = full + 44 + 64
    const px = 960 - pw / 2
    const py = 650
    ctx.save()
    ctx.globalAlpha = pp
    ctx.translate(960, py + 34)
    ctx.scale(0.96 + 0.04 * pp, 0.96 + 0.04 * pp)
    ctx.translate(-960, -(py + 34))
    fillRound(ctx, px, py, pw, 68, 34, 'rgba(255,255,255,0.06)')
    ctx.beginPath()
    roundPath(ctx, px + 0.5, py + 0.5, pw - 1, 67, 34)
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = 1
    ctx.stroke()
    txt(ctx, '›', px + 32, py + 43, { ...mono, color: css(C.accent), weight: 700 })
    const typed = COPY.install.slice(0, Math.floor(COPY.install.length * prog(t, 13.7, 14.4)))
    const tw = txt(ctx, typed, px + 64, py + 43, mono)
    const isTyping = t < 14.4
    if (isTyping || (t * 2) % 1 < 0.6) {
      ctx.fillStyle = css(C.accent, 0.9)
      ctx.fillRect(px + 66 + tw, py + 20, 13, 30)
    }
    ctx.restore()
  }

  const fp = Ease.outExpo(prog(t, 14.25, 14.8))
  if (fp > 0) {
    ctx.save()
    ctx.globalAlpha = fp
    const line = COPY.platforms.join('   ·   ')
    txt(ctx, line, 960, 800 + (1 - fp) * 10, { size: 22, color: C.dim, align: 'center', ls: 1 })
    ctx.restore()
  }
}

function renderFrame(ctx, t) {
  const cam = camera(t)
  background(ctx, t, cam)

  const appear = Ease.outQuint(prog(t, 3.7, 4.5))
  const leave = Ease.inOutCubic(prog(t, 12.85, 13.3))
  const alpha = appear * (1 - leave)
  if (alpha > 0) {
    ctx.save()
    ctx.globalAlpha = alpha
    const s = 1 - 0.05 * leave
    ctx.translate(960, 540)
    ctx.scale(s, s)
    ctx.translate(-960, -540 + (1 - appear) * 120)
    ctx.translate(cam.ax, cam.ay)
    ctx.scale(cam.z, cam.z)
    ctx.translate(-cam.cx, -cam.cy)
    drawWindow(ctx, t)
    cursor(ctx, t)
    ctx.restore()
  }

  spotlight(ctx, t, cam)
  leftScrim(ctx, t)
  for (const hd of COPY.heads) headline(ctx, t, hd)
  hook(ctx, t)
  brand(ctx, t)
  outro(ctx, t)
}
