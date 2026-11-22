/**
 * 本地静态服务（零依赖）
 *
 * 开场里有两类东西必须走 HTTP 才正常：
 *   · 摄像头 → 只在 https / http://localhost 这类安全上下文可用
 *   · MediaPipe 的 wasm / 模型 → 用 fetch 取，file:// 会被 CORS 拦
 * 所以别直接双击 index.html 测手势；用这个服务。
 *
 *   node serve.mjs          → http://localhost:4200
 *   node serve.mjs 4300
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)))
const PORT = Number(process.env.PORT || process.argv[2] || 4200)
const HOST = process.env.HOST || '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  let path
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch {
    res.writeHead(400).end('bad request')
    return
  }
  if (path === '/') path = '/index.html'

  const target = resolve(join(ROOT, path))
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    res.writeHead(403).end('forbidden')
    return
  }

  try {
    const info = await stat(target)
    if (info.isDirectory()) throw Object.assign(new Error('dir'), { code: 'ENOENT' })
    const body = await readFile(target)
    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store, must-revalidate',
      // 摄像头只给同源；麦克风不需要
      'Permissions-Policy': 'camera=(self), microphone=()',
    })
    res.end(body)
    console.log(200, path)
  } catch (err) {
    const code = err.code === 'ENOENT' || err.code === 'ENOTDIR' ? 404 : 500
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`${code} ${path}`)
    console.log(code, path)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`\n  开场动画  http://${HOST}:${PORT}/`)
  console.log(`  root      ${ROOT}`)
  console.log('  提示：手势只在 localhost / https 下可用；不点「开启手势」不会请求 22 MB 模型\n')
})
