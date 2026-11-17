import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const serverDir = fileURLToPath(new URL('..', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moyun-http-'));
const data = path.join(root, 'server/data'); fs.mkdirSync(data, { recursive: true });
const pub = path.join(root, 'public'); fs.mkdirSync(pub, { recursive: true });
fs.writeFileSync(path.join(data, 'wan-video-tasks.json'), JSON.stringify([{ id: 'fixture-video', owner: 'owner', status: 'succeeded', localVideoUrl: '/uploads/videos/fixture.mp4' }]));
let modelCalls = 0;
const modelStub = createServer((req, res) => {
  modelCalls++;
  req.resume();
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message: { content: '先让小舟入画，再用水波引导视线，最后停在月影。' } }] }));
});
await new Promise(resolve => modelStub.listen(0, '127.0.0.1', resolve));
const overrides = { PORT: '0', HOST: '127.0.0.1', DATA_DIR: data, PUBLIC_DIR: pub, NODE_ENV: 'test', MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '1', ADMIN_USERNAME: '', ADMIN_PASSWORD: '', SILICONFLOW_API_KEY: 'mock-only-key', SILICONFLOW_ENDPOINT: `http://127.0.0.1:${modelStub.address().port}/v1`, DASHSCOPE_API_KEY: '', SESSION_SECRET: '', CORS_ORIGINS: '' };
const mysqlTest = process.env.MYSQL_HTTP_TEST === 'true';
if (mysqlTest) {
  delete overrides.MYSQL_HOST;
  delete overrides.MYSQL_PORT;
  overrides.MYSQL_DATABASE = 'moyun_huajing_test';
}
const code = `await import(${JSON.stringify(new URL('../env.js', import.meta.url).href)});Object.assign(process.env,${JSON.stringify(overrides)});const net=await import('node:net');const listen=net.Server.prototype.listen;net.Server.prototype.listen=function(...args){this.once('listening',()=>console.log('TEST_PORT='+this.address().port));return listen.apply(this,args)};await import(${JSON.stringify(new URL('../server.js', import.meta.url).href)});`;
let child;
let checks = 0;
let connectedToMysql = false;
const check = (a, b) => { assert.equal(a, b); checks++; };
try {
  child = spawn(process.execPath, ['--input-type=module', '-e', code], { cwd: serverDir, stdio: ['ignore','pipe','pipe'] });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server startup timeout')), 15000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('[db] MySQL connected')) connectedToMysql = true; const m = /TEST_PORT=(\d+)/.exec(String(chunk)); if (m) { clearTimeout(timer); resolve(m[1]); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('server exited '+code)); });
    child.stderr.on('data', chunk => { if (process.env.VERBOSE_TEST) process.stderr.write(chunk); });
  });
  const base = `http://127.0.0.1:${port}`;
  if (mysqlTest) assert.equal(connectedToMysql, true, 'MySQL test must not fall back to JSON');
  async function req(route, body, cookie = '', method = body ? 'POST' : 'GET', origin = '') {
    const r = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...(cookie ? {cookie} : {}), ...(origin ? {origin} : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let payload; try { payload = JSON.parse(text); } catch { payload = text; }
    return { status: r.status, payload, cookie: r.headers.get('set-cookie')?.split(';')[0] || '' };
  }
  check((await req('/api/status')).status, 200);
  for (const route of ['/api/generate','/api/enhance','/api/caption','/api/generate/stream','/api/videos/image-to-video','/api/videos/storyboards']) check((await req(route, {})).status, 401);
  check((await req('/api/register', {username:'owner',password:'test-password'})).status, 200);
  check((await req('/api/register', {username:'other',password:'test-password'})).status, 200);
  const owner = await req('/api/login', {username:'owner',password:'test-password'}); check(owner.status, 200); assert.ok(owner.cookie);
  const other = await req('/api/login', {username:'other',password:'test-password'});
  check((await req('/api/check_login', null, owner.cookie)).payload.username, 'owner');
  check((await req('/api/login', {username:'../owner',password:'test-password'})).status, 401);
  check((await req('/api/gallery', {}, owner.cookie, 'POST', 'https://evil.example')).status, 403);
  const image = 'data:image/png;base64,' + (await sharp({create:{width:80,height:80,channels:3,background:'white'}}).png().toBuffer()).toString('base64');
  const saved = await req('/api/gallery', {image,video_url:'/uploads/videos/fixture.mp4',video_prompt:'竹影'}, owner.cookie);
  check(saved.status, 200); check(saved.payload.artwork.video_url, '/uploads/videos/fixture.mp4');
  check((await req('/api/gallery', null, owner.cookie)).payload.artworks[0].video_prompt, '竹影');
  check((await req('/api/gallery', {image,video_url:'/uploads/videos/fixture.mp4'}, other.cookie)).status, 403);
  check((await req('/api/videos/tasks/fixture-video', null, other.cookie)).status, 403);
  check((await req(saved.payload.artwork.image, null, other.cookie)).status, 403);
  check((await req(saved.payload.artwork.image, null, owner.cookie)).status, 200);
  const ownFile = path.join(pub, saved.payload.artwork.image);
  const attack = await req('/api/gallery', {image:saved.payload.artwork.image}, other.cookie);
  check((await req('/api/gallery/'+attack.payload.artwork.id, null, other.cookie, 'DELETE')).status, 200);
  check(fs.existsSync(ownFile), true);
  check((await req('/api/gallery/'+saved.payload.artwork.id, null, owner.cookie, 'DELETE')).status, 200);
  check(fs.existsSync(ownFile), false);
  check((await req('/api/image-proxy?url='+encodeURIComponent('https://127.0.0.1/test'))).status, 502);
  const chat = await req('/api/agent/chat', {messages:[{role:'user',content:'介绍一下中国剪纸的历史和美学特征。'}]});
  check(chat.payload.model_used, 'local-heritage-knowledge');
  const online = await req('/api/agent/chat', {messages:[{role:'user',content:'怎样让八秒短片有起承转合？不需要生成图片，只给建议。'}]}, owner.cookie);
  check(online.status, 200); check(online.payload.is_fallback, false);
  check(online.payload.draw_task_id, null); check(modelCalls, 1);
  const usage = JSON.parse(fs.readFileSync(path.join(data, 'ai-usage.json'), 'utf8'));
  check(Object.values(usage)[0].count, 1);
  const local = await req('/api/generate/structure/stream', {sketch:image,style:'calligraphy'});
  check(local.status, 200); assert.match(local.payload, /"mode":"layered"/); checks++;
  check((await req('/api/logout', {}, owner.cookie)).status, 200);
  check((await req('/api/check_login', null, owner.cookie)).payload.logged_in, false);
  console.log(`PASS HTTP regressions: ${checks} assertions; no paid requests`);
} finally {
  if (child && child.exitCode === null) { const ended = once(child, 'exit'); child.kill('SIGTERM'); await ended; }
  await new Promise(resolve => modelStub.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
}
