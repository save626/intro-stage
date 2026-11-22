/**
 * 开场动画主控（独立演示项目，无 Vue / 无落地页）
 *
 * 时间线：
 *   0.9–6.2s  字符画眼睛：睁眼 → 眨眼 → 灰蓝三色虹膜/巩膜/瞳孔
 *   5.2s      粒子舞台预热（建 WebGL 上下文、编译着色器，隐藏）
 *   6.2s      瞳孔推进开始：星空 + 流星淡入；粒子从瞳孔中心径向揭开（3s）
 *   9.2s      融合界面壳淡入：花瓣 / 圣诞树 · 开启手势 · 全屏
 *   9.4s      推进结束；无手势时进入 16s 呼吸循环（同圣诞树节奏）
 *   之后      点任意空白处 → 重播整段；全屏态隐藏界面且不响应点击
 *
 * 手势：不点「开启手势」就不 import MediaPipe、不申请摄像头、不请求资源。
 */
import { createParticleStage } from './stage.js'
import { EyePlayer } from './eye.js'
import { MeteorField } from './meteor.js'

const EYE_T_Z0 = 6.2 // 眼睛段：睁眼到瞳孔推进开始
const EYE_T_ZD = 3.2 // 瞳孔推进时长
const ENTER_MS = 3000 // 粒子从瞳孔长出来的时长
const T = {
  warm: EYE_T_Z0 - 1.0,
  meteor: EYE_T_Z0,
  particle: EYE_T_Z0,
  ui: EYE_T_Z0 + EYE_T_ZD - 0.2,
  wait: EYE_T_Z0 + EYE_T_ZD,
}

/** 无手势呼吸循环：16s 一圈，三角波过双重 smoothstep（两端停留、中间速过） */
const AUTO_PERIOD = 16

function autoDisperse(seconds) {
  const p = (((seconds % AUTO_PERIOD) + AUTO_PERIOD) % AUTO_PERIOD) / AUTO_PERIOD
  const half = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5
  const s1 = half * half * (3 - 2 * half)
  return s1 * s1 * (3 - 2 * s1)
}

function smoothstep(k) {
  const x = Math.max(0, Math.min(1, k))
  return x * x * (3 - 2 * x)
}

/** 逐帧低通（与圣诞树同一个 0.05 系数） */
function approach(cur, target, perFrame, dt) {
  const k = 1 - Math.pow(1 - perFrame, dt * 60)
  return cur + (target - cur) * k
}

const $ = (sel) => document.querySelector(sel)
const overlay = $('#intro')
const eyeCanvas = $('#eyeCanvas')
const meteorCanvas = $('#meteorCanvas')
const particleCanvas = $('#particleCanvas')
const camEl = $('#cam')
const tipEl = $('#introTip')
const barEl = $('#introActions')
const handsBtn = $('#introHands')

const IDLE = { active: false, hands: 0, palm: 0, fist: 0, pinch: 0, spread: 0, fingers: 0, pos: { x: 0, y: 0 } }
const SCENES = [
  { id: 'flower', label: '花瓣' },
  { id: 'lights', label: '圣诞树' },
]

let eye = null
let meteor = null
let stage = null
let tracker = null
let gestures = null
let raf = 0
let frames = 0
let lastAt = 0
let revealAt = 0
let disperseMix = 0
let startedAt = 0
let stageError = ''
let started = false
let waiting = false
let meteorOn = false
let particleOn = false
let uiVisible = false
let uiHintShown = false
let handEnabled = false
let sceneId = 'flower'
let tipTimer = 0
let timers = []
/** 验收用：注入的手势快照 */
let forced = null

const at = (sec, fn) => timers.push(setTimeout(fn, sec * 1000))
const clearTimers = () => {
  timers.forEach(clearTimeout)
  timers = []
}

function tip(text, ms = 3200) {
  tipEl.textContent = text || ''
  tipEl.classList.toggle('is-on', Boolean(text))
  clearTimeout(tipTimer)
  if (text) tipTimer = setTimeout(() => tipEl.classList.remove('is-on'), ms)
}

function detectMobile() {
  const ua = navigator.userAgent || ''
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches
  return window.innerWidth < 820 || coarse || /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua)
}

function particleEligible() {
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return false
  return window.innerWidth >= 900
}

function gestureEligible() {
  return location.protocol !== 'file:'
}

/* ────────────────────────── 粒子舞台 ────────────────────────── */

async function mountParticle() {
  if (!particleEligible()) {
    if (!window.matchMedia('(pointer: coarse)').matches) {
      tip('窗口宽度不足 900px，已跳过 3D 粒子段（流星与重播仍然可用）', 5200)
    }
    return
  }
  if (stage) return
  try {
    stage = createParticleStage({ canvas: particleCanvas, sceneId })
    stage.setAuto(false)
    stage.setDisperse(0)
    stage.setScale(0.4)
    stage.setTint('#ffffff')
    window.__introParticle = stage
    particleOn = true
    overlay.classList.add('is-particle')
    if (startedAt && (performance.now() - startedAt) / 1000 >= T.ui) showUiOnce()
    loop()
  } catch (err) {
    stageError = String((err && err.message) || err)
    console.warn('[intro] 粒子舞台初始化失败：', err)
    stage = null
    particleOn = false
    tip('当前窗口或显卡无法运行 3D 粒子（WebGL 不可用 / 窗口过窄），已跳过粒子段', 5200)
  }
}

function revealParticle() {
  if (!stage) return
  revealAt = performance.now() - 16
}

function showUiOnce() {
  if (uiHintShown || !stage) return
  uiHintShown = true
  uiVisible = true
  overlay.classList.add('is-ui')
  tip(
    gestureEligible()
      ? '可用手势：点「开启手势」后，张手散开 / 捏合聚合（不会自动开摄像头）'
      : '可用手势需要 http://localhost 或 https 打开；当前为自动演示',
    5200,
  )
}

function loop(now) {
  if (!stage) return
  raf = requestAnimationFrame(loop)
  const t = now || performance.now()
  const dt = Math.min(0.05, Math.max(0, (t - (lastAt || t)) / 1000))
  lastAt = t

  const gestureMode = handEnabled || forced !== null
  let g = IDLE
  if (handEnabled && tracker && gestures) {
    const res = tracker.detect(t)
    gestures.update(res.hands || [], dt, t)
    g = gestures
  } else if (forced) {
    g = forced
  }

  if (sceneId === 'flower' && !gestureMode && revealAt) {
    const sinceReveal = t - revealAt
    if (sinceReveal < ENTER_MS) {
      stage.setDisperse(0)
      stage.setScale(0.4 + 0.6 * smoothstep(sinceReveal / ENTER_MS))
    } else {
      const target = autoDisperse((sinceReveal - ENTER_MS) / 1000)
      disperseMix = approach(disperseMix, target, 0.05, dt)
      stage.setDisperse(disperseMix)
      stage.setScale(1)
    }
  }

  stage.update(dt, g)
  stage.render()
  frames++
}

/* ────────────────────────── 手势 ────────────────────────── */

async function toggleHands() {
  if (handEnabled) {
    tracker && tracker.stop()
    handEnabled = false
    setGestureMode(false)
    handsBtn.classList.remove('is-on')
    handsBtn.setAttribute('aria-pressed', 'false')
    handsBtn.textContent = '开启手势'
    tip('手势已关闭 · 自动呼吸')
    return
  }
  if (!gestureEligible()) {
    tip('手势需要 http://localhost 或 https 打开（file:// 下浏览器不允许摄像头）')
    return
  }
  tip('正在申请摄像头…')
  try {
    if (!tracker) {
      const [{ GestureState }, { HandTracker }] = await Promise.all([
        import('./core/gestures.js'),
        import('./core/hand-tracker.js'),
      ])
      gestures = new GestureState()
      tracker = new HandTracker({ numHands: 2, base: './vendor/mediapipe' })
    }
    await tracker.start(camEl)
    handEnabled = true
    setGestureMode(true)
    handsBtn.classList.add('is-on')
    handsBtn.setAttribute('aria-pressed', 'true')
    handsBtn.textContent = '手势已开'
    tip('手势已开启 · 张手散开 / 握拳聚合')
  } catch (err) {
    handEnabled = false
    tip(err && err.message ? err.message : '手势启动失败')
  }
}

function setGestureMode(on) {
  if (!stage) return
  if (sceneId === 'flower') {
    stage.setAuto(false)
    stage.setDisperse(on ? null : 0)
    stage.setScale(1)
    disperseMix = 0
  }
}

/* ────────────────────────── 场景 / 全屏 ────────────────────────── */

function switchScene(id) {
  const label = (SCENES.find((s) => s.id === id) || {}).label || id
  if (id === sceneId) {
    tip(`已经是「${label}」场景`)
    return
  }
  if (!stage) {
    tip('粒子舞台没有起来，无法切换（' + (stageError || 'WebGL 不可用或窗口过窄') + '）')
    return
  }
  try {
    sceneId = id
    stage.loadScene(id)
    setGestureMode(handEnabled || forced !== null)
    document.querySelectorAll('[data-scene]').forEach((b) => {
      const on = b.dataset.scene === id
      b.classList.toggle('is-active', on)
      b.setAttribute('aria-pressed', String(on))
    })
    tip(id === 'lights' ? '圣诞树 · 张手炸散 / 握拳收树' : '花瓣 · 张手散开 / 捏合聚合')
  } catch (err) {
    console.error('[intro] 切换场景失败：', err)
    tip('切换场景失败：' + ((err && err.message) || err))
  }
}

function toggleFullscreen() {
  const el = document.documentElement
  const req = document.fullscreenElement ? document.exitFullscreen?.() : el.requestFullscreen?.()
  Promise.resolve(req).catch((err) => {
    tip('全屏被浏览器拒绝：' + ((err && err.message) || '需要用户手势或页面已限制'))
  })
}

function onFullscreenChange() {
  const on = Boolean(document.fullscreenElement)
  overlay.classList.toggle('is-fullscreen', on)
  if (on) tipEl.classList.remove('is-on')
}

/* ────────────────────────── 播放 / 重播 ────────────────────────── */

function play() {
  if (started) return
  started = true
  startedAt = performance.now()
  overlay.classList.add('is-on')

  eye = new EyePlayer(eyeCanvas, { tZ0: EYE_T_Z0, tZd: EYE_T_ZD })
  eye.start()

  at(T.warm, () => mountParticle())

  at(T.meteor, () => {
    meteorOn = true
    overlay.classList.add('is-meteor')
    try {
      meteor = new MeteorField(meteorCanvas, { mobile: detectMobile() })
      meteor.start()
    } catch (e) {
      console.warn('[intro] 流星雨画布初始化失败，降级为纯色底：', e)
    }
  })

  at(T.particle, () => revealParticle())

  at(EYE_T_Z0 + 2.4, () => {
    if (eye) {
      eye.dispose()
      eye = null
    }
  })

  at(T.ui, () => {
    if (!stage) return
    showUiOnce()
  })

  at(T.wait, () => {
    waiting = true
    overlay.classList.add('is-waiting')
    if (eye) {
      eye.dispose()
      eye = null
    }
  })
}

/** 停掉一切并回到初始态（再 play() 即重播） */
function teardown() {
  clearTimers()
  if (eye) { eye.dispose(); eye = null }
  if (meteor) { meteor.dispose(); meteor = null }
  if (tracker) { tracker.stop(); tracker = null }
  handEnabled = false
  gestures = null
  if (raf) { cancelAnimationFrame(raf); raf = 0 }
  if (stage) { stage.dispose(); stage = null }
  overlay.classList.remove('is-meteor', 'is-particle', 'is-ui', 'is-waiting', 'is-fullscreen')
  meteorOn = false
  particleOn = false
  uiVisible = false
  uiHintShown = false
  waiting = false
  started = false
  startedAt = 0
  revealAt = 0
  disperseMix = 0
  lastAt = 0
  frames = 0
  stageError = ''
  sceneId = 'flower'
  document.querySelectorAll('[data-scene]').forEach((b) => {
    const on = b.dataset.scene === 'flower'
    b.classList.toggle('is-active', on)
    b.setAttribute('aria-pressed', String(on))
  })
  handsBtn.classList.remove('is-on')
  handsBtn.setAttribute('aria-pressed', 'false')
  handsBtn.textContent = '开启手势'
  tipEl.classList.remove('is-on')
}

function restart() {
  teardown()
  play()
}

/* ────────────────────────── 事件 ────────────────────────── */

overlay.addEventListener('click', (e) => {
  if (e.target.closest('button')) return // 按钮自己处理
  if (document.fullscreenElement) return // 全屏只看画面
  if (waiting) restart()
})

document.addEventListener('keydown', (e) => {
  if (document.fullscreenElement) return
  if (waiting && (e.key === 'Enter' || e.key === ' ')) restart()
})

document.addEventListener('fullscreenchange', onFullscreenChange)
document.querySelectorAll('[data-scene]').forEach((b) => {
  b.addEventListener('click', (e) => {
    e.stopPropagation()
    switchScene(b.dataset.scene)
  })
})
handsBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleHands() })
document.querySelector('#introFullscreen').addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen() })
document.querySelector('#introSkip').addEventListener('click', (e) => { e.stopPropagation(); restart() })

window.addEventListener('resize', () => {
  stage && stage.resize()
})

/* ────────────────────────── 验收钩子 ────────────────────────── */

function state() {
  let measure = null
  try {
    if (stage) {
      const m = stage.measure()
      measure = { litRatio: Number(m.litRatio.toFixed(4)), width: m.width, height: m.height }
    }
  } catch (e) {
    measure = { error: String(e && e.message) }
  }
  return {
    playing: started && waiting === false,
    elapsed: startedAt ? (performance.now() - startedAt) / 1000 : 0,
    waiting,
    sceneId,
    uiVisible,
    handEnabled,
    stageReady: Boolean(stage),
    stageError,
    particleOn,
    particleFrames: frames,
    particleMeasure: measure,
    meteorOn,
    meteorFrames: meteor ? meteor.frames : 0,
    gestureEligible: gestureEligible(),
    ...(eye ? eye.state() : { cols: 78, rows: 30, cellW: 8, cellH: 15, frames: 0 }),
    meteorAt: T.meteor,
    waitAt: T.wait,
  }
}

window.__introState = state
window.__introDiag = () => {
  const r = barEl.getBoundingClientRect()
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return {
    url: location.href,
    viewport: [window.innerWidth, window.innerHeight],
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    particleEligible: particleEligible(),
    stageReady: Boolean(stage),
    stageError,
    uiVisible,
    sceneId,
    handEnabled,
    barOpacity: Number(getComputedStyle(barEl).opacity),
    barRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    hitAtBarCenter: hit ? (hit.id || hit.className || hit.tagName) : null,
    elapsed: startedAt ? (performance.now() - startedAt) / 1000 : 0,
  }
}
window.__introSetGestures = (g) => {
  forced = g || null
  if (sceneId === 'flower') setGestureMode(Boolean(forced))
}

handsBtn.style.display = gestureEligible() ? '' : 'none'
play()
