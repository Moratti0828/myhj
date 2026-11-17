import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(root, 'server', 'server.js')
const viteEntry = path.join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js')
const frontendRoot = path.join(root, 'frontend')
const args = process.argv.slice(2)
const hasPort = args.some((arg) => arg === '--port' || arg.startsWith('--port='))
const viteArgs = [viteEntry, '--host', '0.0.0.0', ...(hasPort ? [] : ['--port', '7100']), ...args]
const children = []
let stopping = false

function launch(commandArgs, cwd = root) {
  const child = spawn(process.execPath, commandArgs, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  })
  children.push(child)
  return child
}

function stopAll(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(code), 300).unref()
}

console.log('\n墨韵画境开发模式：前端默认 http://localhost:7100，后端 http://localhost:3000')
console.log('可通过 npm run dev -- --port 5173 修改前端端口；按 Ctrl+C 同时停止前后端。\n')

const server = launch([serverEntry])
const frontend = launch(viteArgs, frontendRoot)

for (const child of [server, frontend]) {
  child.on('error', (error) => {
    console.error(`[启动失败] ${error.message}`)
    stopAll(1)
  })
  child.on('exit', (code) => {
    if (!stopping) stopAll(code || 0)
  })
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
