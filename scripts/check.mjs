#!/usr/bin/env node
/**
 * intro-stage 自检（2026-11-24）。
 *
 * 这个仓库是主仓库开场段的独立切片，之前没有自动化验收 —— 全靠人在浏览器里看。
 * 这里补上「一条命令验证四件事」：开场能跑到定格、两指捏合能收拢、点击能重播、
 * 且没有任何控制台报错。
 *
 * 用法：
 *   node serve.mjs 4201          # 先起服务（或由主仓库 scripts/accept.mjs 代起）
 *   node scripts/check.mjs       # 另开一个终端
 *
 *   BASE_URL=http://127.0.0.1:4300/ node scripts/check.mjs   # 换地址/端口
 *
 * 依赖：主仓库的 `app/node_modules/playwright-core` 与已安装的 Chromium
 * （本仓库不带 node_modules）。
 */
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '../../app/node_modules/playwright-core/index.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT = join(ROOT, 'preview')
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4201/'

const problems = []
const notes = []
const fail = (where, msg) => problems.push(`${where}：${msg}`)

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

try {
  await page.goto(BASE, { waitUntil: 'load', timeout: 60_000 })
} catch (err) {
  console.error(`打不开 ${BASE} —— 先 ` + '`node serve.mjs 4201`' + `。\n${err.message}`)
  process.exit(2)
}

const state = () => page.evaluate(() => (window.__introState ? window.__introState() : null))
const setGestures = (g) => page.evaluate((gg) => window.__introSetGestures(gg), g)
const waitElapsed = (sec) => page.waitForFunction(
  (s) => window.__introState && window.__introState().elapsed >= s,
  sec,
  { timeout: 90_000, polling: 100 },
)

/* ---------- 1. 起播与定格 ---------- */
await waitElapsed(1)
const early = await state()
if (!early) fail('intro', '没有 window.__introState()')
// intro-stage 的 state() 没有 hasCanvas 字段，它把 eye.state() 展开进来（cols/rows/frames）
if (early.cols !== 78 || early.rows !== 30) fail('intro', `眼睛网格应为 78×30，实为 ${early.cols}×${early.rows}`)
if (!(early.frames > 0)) fail('intro', `眼睛没在画（frames=${early.frames}）`)

await page.waitForFunction(() => window.__introState().stageReady, null, { timeout: 60_000, polling: 100 })
// 9.4s 定格 + 800ms 让「点击任意位置重播」的过渡走完
await waitElapsed(10.2)
await page.waitForTimeout(800)
const st = await state()
if (!st.stageReady) fail('intro', `粒子舞台没起来：${st.stageError || '未知'}`)
if (!st.waiting) fail('intro', `9.4s 后应进入等待点击，实为 waiting=${st.waiting}`)
const skyGone = await page.evaluate(() => !document.getElementById('introSky'))
if (!skyGone) fail('intro', '#introSky 仍然存在（星空照片底图应早已删除）')
const canvasFull = await page.evaluate(() => {
  const cv = document.getElementById('particleCanvas')
  return cv ? cv.clientWidth >= innerWidth - 1 && cv.clientHeight >= innerHeight - 1 : false
})
if (!canvasFull) fail('intro', '粒子画布没有铺满视口')
await page.screenshot({ path: join(OUT, 'check-1-flower.png') })

/* ---------- 2. 手势：张开 vs 两指捏合 vs 握拳 ---------- */
const lit = async () => {
  const s = await page.evaluate(() => window.__introState().particleMeasure)
  return s && typeof s.litRatio === 'number' ? s.litRatio : null
}
await setGestures({ active: true, hands: 2, palm: 1, fist: 0, pinch: 0, spread: 1, fingers: 5 })
await page.waitForTimeout(1400)
const open = await lit()
await setGestures({ active: true, hands: 1, palm: 0.72, fist: 0.28, pinch: 0.92, spread: 0, fingers: 3 })
await page.waitForTimeout(1400)
const pinch = await lit()
await page.screenshot({ path: join(OUT, 'check-2-pinch.png') })
await setGestures({ active: true, hands: 1, palm: 0, fist: 1, pinch: 0.1, spread: 0, fingers: 0 })
await page.waitForTimeout(1400)
const fist = await lit()

if (open === null || pinch === null || fist === null) fail('gesture', '拿不到 particleMeasure.litRatio')
else {
  if (!(open > pinch * 1.5)) fail('gesture', `张开应明显比捏合散：张开 ${open} vs 捏合 ${pinch}`)
  if (!(open > fist * 1.5)) fail('gesture', `张开应明显比握拳散：张开 ${open} vs 握拳 ${fist}`)
  // 2026-11-24 真机反馈的正是这一条：只看 palm 时两指捏合等于没收
  if (!(pinch < open * 0.75)) {
    fail('gesture', `两指捏合没有收拢（${pinch} vs 张开 ${open}）—— 场景应用 closingOf(g) = max(fist, pinch)`)
  }
  notes.push(`手势：张开 ${(open * 100).toFixed(1)}% / 两指捏合 ${(pinch * 100).toFixed(1)}% / 握拳 ${(fist * 100).toFixed(1)}%`)
}
await setGestures(null)

/* ---------- 3. 点击重播 ---------- */
const before = (await state()).elapsed
await page.mouse.click(30, 860)
await page.waitForTimeout(1200)
const after = await state()
if (!(after.elapsed < before)) fail('replay', `点击后应重播（elapsed 应归零）：${before} → ${after.elapsed}`)
if (!(after.elapsed < 6)) fail('replay', `重播后 elapsed 仍为 ${after.elapsed}`)
await page.waitForTimeout(600)
await page.screenshot({ path: join(OUT, 'check-3-replay.png') })
notes.push(`重播：点击前 ${before.toFixed(1)}s → 点击后 ${after.elapsed.toFixed(1)}s`)

/* ---------- 4. 报错 ---------- */
if (errors.length) fail('console', errors.slice(0, 3).join(' | '))

await browser.close()

console.log('')
for (const n of notes) console.log('  ' + n)
if (problems.length) {
  console.error('\nintro-stage 自检未通过：')
  for (const p of problems) console.error('  ✗ ' + p)
  process.exit(1)
}console.log('\nintro-stage 自检通过：起播/定格、三态手势、点击重播、零报错')
