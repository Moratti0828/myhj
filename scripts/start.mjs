import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entry = path.join(root, 'server', 'server.js')
const distEntry = path.join(root, 'frontend', 'dist', 'index.html')

if (!existsSync(distEntry)) {
  console.error('未找到前端构建产物，请先运行：npm run build')
  process.exit(1)
}

const child = spawn(process.execPath, [entry], {
  cwd: root,
  env: { ...process.env, SPA_DIR: process.env.SPA_DIR || 'frontend/dist' },
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('error', (error) => {
  console.error(`[启动失败] ${error.message}`)
  process.exit(1)
})
child.on('exit', (code) => process.exit(code || 0))

console.log('墨韵画境单端口模式：http://localhost:3000')
