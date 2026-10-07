'use strict'

// Stage, palette, easing and drawing primitives shared by scenes.js and player.js.

const W = 1920
const H = 1080
const DURATION = 15

const C = {
  bg: '#07090d',
  text: '#eef1f6',
  dim: '#8b94a7',
  faint: '#5b6375',
  coral: '#d97757',
  green: [52, 199, 89],
  yellow: [255, 176, 32],
  red: [255, 69, 58],
  accent: [79, 140, 255],
  violet: [124, 92, 255],
}

const FONT = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
const MONO = '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace'

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a, b, p) => a + (b - a) * p
const prog = (t, a, b) => clamp((t - a) / (b - a))
const bump = (t, a, b) => Math.sin(Math.PI * prog(t, a, b))

const Ease = {
  inCubic: p => p * p * p,
  outCubic: p => 1 - (1 - p) ** 3,
  outQuint: p => 1 - (1 - p) ** 5,
  outExpo: p => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
  inOutCubic: p => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2),
  outBack: p => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2,
}

const css = (rgb, a = 1) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`
const mixRgb = (a, b, p) => a.map((v, i) => Math.round(lerp(v, b[i], p)))

// Mirrors ctxColor in hooks/register.tsx (60 / 85 thresholds), blended so colour never snaps.
const ctxColor = pct => {
  if (pct < 58) return C.green
  if (pct < 62) return mixRgb(C.green, C.yellow, (pct - 58) / 4)
  if (pct < 83) return C.yellow
  if (pct < 87) return mixRgb(C.yellow, C.red, (pct - 83) / 4)
  return C.red
}

// Mirrors paceColor: green while usage trails elapsed time, yellow within 15 points, red beyond.
const paceColor = (used, elapsed) => {
  const d = used - elapsed
  if (used >= 90) return C.red
  if (d <= 0) return C.green
  if (d < 3) return mixRgb(C.green, C.yellow, d / 3)
  if (d <= 15) return C.yellow
  if (d < 18) return mixRgb(C.yellow, C.red, (d - 15) / 3)
  return C.red
}

const fmtK = n => `${Math.round(n / 1000)}k`

// Keyframes are [time, ...values]; values are eased between neighbouring keys.
function keyed(keys, t) {
  if (t <= keys[0][0]) return keys[0].slice(1)
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t < b[0]) {
      const p = Ease.inOutCubic(prog(t, a[0], b[0]))
      return a.slice(1).map((v, j) => lerp(v, b[j + 1], p))
    }
  }
  return keys[keys.length - 1].slice(1)
}

function roundPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fillRound(ctx, x, y, w, h, r, fill) {
  ctx.beginPath()
  roundPath(ctx, x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
}

const HAS_SPACING = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype

// Draws one run of text and returns its width so callers can chain runs on a line.
function txt(ctx, s, x, y, o = {}) {
  ctx.font = `${o.italic ? 'italic ' : ''}${o.weight || 400} ${o.size || 20}px ${o.mono ? MONO : FONT}`
  ctx.fillStyle = o.color || C.text
  ctx.textAlign = o.align || 'left'
  ctx.textBaseline = 'alphabetic'
  if (HAS_SPACING) ctx.letterSpacing = `${o.ls || 0}px`
  const w = ctx.measureText(s).width
  ctx.fillText(s, x, y)
  if (HAS_SPACING) ctx.letterSpacing = '0px'
  return w
}

function textWidth(ctx, s, o = {}) {
  ctx.font = `${o.weight || 400} ${o.size || 20}px ${o.mono ? MONO : FONT}`
  if (HAS_SPACING) ctx.letterSpacing = `${o.ls || 0}px`
  const w = ctx.measureText(s).width
  if (HAS_SPACING) ctx.letterSpacing = '0px'
  return w
}

// Canvas port of limitSvg(): filled share, hatched pace gap, elapsed marker, optional shimmer.
function meter(ctx, x, y, w, h, used, elapsed, col, flow, flowAlpha = 1) {
  const u = clamp(used / 100) * w
  const e = elapsed === undefined ? u : clamp(elapsed / 100) * w
  const fillW = Math.min(u, e)
  const gapW = Math.abs(u - e)
  const isFast = u > e

  if (fillW > 1) {
    ctx.save()
    ctx.shadowColor = css(col, 0.55)
    ctx.shadowBlur = h * 1.1
    fillRound(ctx, x, y, Math.max(fillW, h), h, h / 2, css(col, 0.9))
    ctx.restore()
  }

  ctx.save()
  ctx.beginPath()
  roundPath(ctx, x, y, w, h, h / 2)
  ctx.fillStyle = '#1b2029'
  ctx.fill()
  ctx.clip()

  if (gapW > 0.5) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x + fillW, y, gapW, h)
    ctx.clip()
    ctx.strokeStyle = isFast ? css(col, 0.95) : 'rgba(160,166,180,0.7)'
    ctx.lineWidth = h * 0.17
    ctx.beginPath()
    for (let i = -h; i < gapW + h; i += h * 0.45) {
      ctx.moveTo(x + fillW + i, y + h)
      ctx.lineTo(x + fillW + i + h, y)
    }
    ctx.stroke()
    ctx.restore()
  }

  if (fillW > 0.5) {
    const g = ctx.createLinearGradient(x, 0, x + fillW, 0)
    g.addColorStop(0, css(col, 0.7))
    g.addColorStop(1, css(col, 1))
    ctx.fillStyle = g
    ctx.fillRect(x, y, fillW, h)

    if (flow !== undefined && flowAlpha > 0 && fillW > 8) {
      const band = w * 0.35
      const sx = x + ((flow * w * 0.9) % (fillW + band * 2)) - band
      const sg = ctx.createLinearGradient(sx, 0, sx + band, 0)
      sg.addColorStop(0, 'rgba(255,255,255,0)')
      sg.addColorStop(0.5, `rgba(255,255,255,${0.5 * flowAlpha})`)
      sg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.beginPath()
      ctx.rect(x, y, fillW, h)
      ctx.clip()
      ctx.fillStyle = sg
      ctx.fillRect(sx, y, band, h)
    }
  }
  ctx.restore()

  if (elapsed !== undefined) {
    fillRound(ctx, x + e - 1.5, y - h * 0.35, 3, h * 1.7, 1.5, 'rgba(228,232,242,0.95)')
  }
}

// Brand mark: blue tile with four rising bars, echoing the turns sparkline.
function logo(ctx, cx, cy, s, grow) {
  const x = cx - s / 2
  const y = cy - s / 2
  ctx.save()
  ctx.shadowColor = css(C.accent, 0.55)
  ctx.shadowBlur = s * 0.45
  const g = ctx.createLinearGradient(x, y, x + s, y + s)
  g.addColorStop(0, '#74a8ff')
  g.addColorStop(1, '#3762ea')
  fillRound(ctx, x, y, s, s, s * 0.27, g)
  ctx.restore()

  ctx.beginPath()
  roundPath(ctx, x + 1, y + 1, s - 2, s - 2, s * 0.26)
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  const bw = s * 0.11
  const gap = s * 0.07
  const startX = cx - (bw * 4 + gap * 3) / 2
  const bottom = cy + s * 0.24
  const heights = [0.2, 0.33, 0.47, 0.62]
  heights.forEach((hh, i) => {
    const gi = Ease.outBack(clamp(grow * 1.6 - i * 0.2))
    const bh = Math.max(0, hh * s * gi)
    if (bh < 1) return
    fillRound(ctx, startX + i * (bw + gap), bottom - bh, bw, bh, bw * 0.4, i === 3 ? '#ffffff' : 'rgba(255,255,255,0.6)')
  })
}
