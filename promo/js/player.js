'use strict'

// Playback shell: rAF clock, scrubber, keyboard, and real-time WebM export via MediaRecorder.

const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d', { alpha: false })
const ui = {
  play: document.getElementById('play'),
  time: document.getElementById('time'),
  scrub: document.getElementById('scrub'),
  restart: document.getElementById('restart'),
  loop: document.getElementById('loop'),
  exp: document.getElementById('export'),
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
let t = reduceMotion ? 12.4 : 0
let playing = false
let last = null
let raf = 0
let scrubbing = false
let wasPlaying = false
let recorder = null

function draw() {
  const k = canvas.width / W
  ctx.setTransform(k, 0, 0, k, 0, 0)
  renderFrame(ctx, t)
  ui.time.textContent = `${t.toFixed(1).padStart(4, '0')} / ${DURATION.toFixed(1)}`
  if (!scrubbing) ui.scrub.value = String(Math.round(t * 1000))
}

function tick(now) {
  raf = 0
  if (!playing) return
  if (last !== null) t += Math.min(0.1, (now - last) / 1000)
  last = now
  if (t >= DURATION) {
    if (recorder) {
      t = DURATION
      draw()
      setPlaying(false)
      recorder.stop()
      return
    }
    if (ui.loop.checked) {
      t -= DURATION
    } else {
      t = DURATION
      draw()
      setPlaying(false)
      return
    }
  }
  draw()
  raf = requestAnimationFrame(tick)
}

function setPlaying(next) {
  playing = next
  last = null
  ui.play.classList.toggle('is-playing', next)
  ui.play.setAttribute('aria-label', next ? 'Pause' : 'Play')
  if (next && !raf) {
    if (t >= DURATION) t = 0
    raf = requestAnimationFrame(tick)
  }
}

function seek(s) {
  t = clamp(s, 0, DURATION)
  last = null
  draw()
}

function resize() {
  if (recorder) return
  const r = canvas.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(320, Math.round(r.width * dpr))
  canvas.width = w
  canvas.height = Math.round((w * H) / W)
  draw()
}

function exportVideo() {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  const mimeType = window.MediaRecorder && types.find(m => MediaRecorder.isTypeSupported(m))
  if (!canvas.captureStream || !mimeType) {
    ui.exp.textContent = 'Export unsupported'
    ui.exp.disabled = true
    return
  }
  canvas.width = W
  canvas.height = H
  const chunks = []
  recorder = new MediaRecorder(canvas.captureStream(60), { mimeType, videoBitsPerSecond: 16_000_000 })
  recorder.ondataavailable = e => {
    if (e.data.size) chunks.push(e.data)
  }
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `usage-inspector-promo.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    recorder = null
    for (const el of [ui.play, ui.restart, ui.scrub, ui.loop]) el.disabled = false
    document.body.classList.remove('is-recording')
    ui.exp.textContent = 'Export video'
    resize()
  }
  for (const el of [ui.play, ui.restart, ui.scrub, ui.loop]) el.disabled = true
  document.body.classList.add('is-recording')
  ui.exp.textContent = 'Recording…'
  seek(0)
  recorder.start()
  setPlaying(true)
}

ui.play.addEventListener('click', () => {
  if (!recorder) setPlaying(!playing)
})
ui.restart.addEventListener('click', () => {
  if (recorder) return
  seek(0)
  setPlaying(true)
})
ui.exp.addEventListener('click', () => {
  if (!recorder) exportVideo()
})
ui.scrub.addEventListener('pointerdown', () => {
  if (recorder) return
  scrubbing = true
  wasPlaying = playing
  setPlaying(false)
})
ui.scrub.addEventListener('input', () => {
  if (!recorder) seek(Number(ui.scrub.value) / 1000)
})
// `change` does not fire when the thumb ends where it started, so end the drag on pointer release.
const endScrub = () => {
  if (!scrubbing) return
  scrubbing = false
  if (wasPlaying) setPlaying(true)
  wasPlaying = false
}
window.addEventListener('pointerup', endScrub)
window.addEventListener('pointercancel', endScrub)

window.addEventListener('keydown', e => {
  if (recorder || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.target.closest?.('input[type="range"]')) return
  if (e.code === 'Space') {
    if (e.target.closest?.('button, input')) return
    e.preventDefault()
    setPlaying(!playing)
  } else if (e.code === 'ArrowLeft') {
    seek(t - 1)
  } else if (e.code === 'ArrowRight') {
    seek(t + 1)
  } else if (e.code === 'KeyR') {
    seek(0)
    setPlaying(true)
  }
})

new ResizeObserver(resize).observe(canvas)
document.fonts.ready.then(draw)
resize()
setPlaying(!reduceMotion)

// Deterministic hook for screenshots and automated frame capture.
window.promo = { seek, play: () => setPlaying(true), pause: () => setPlaying(false), duration: DURATION }
