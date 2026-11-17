import { isDrawRequest } from '../agent_knowledge.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import sharp from 'sharp';
import { ensureDataDir, deletePublicImageIfExists } from '../database/db.js';
import { addArtwork, listArtworks, deleteArtwork } from '../database/gallery.js';
import { createUser, hashPassword, matchesPassword, verifyUser } from '../database/users.js';
import { compareStructure, bufferToDataUrl } from '../vision/structure.js';
import { buildContract } from '../agent/compositionContract.js';
import { runStructurePipeline } from '../agent/orchestrator.js';
import { validateImageUrl } from '../providers/safeImageDownload.js';
import { FileSessionStore, createUsageGuard, originGuard } from '../middleware/security.js';

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moyun-regression-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const data = path.join(root, 'server', 'data'); ensureDataDir(data); global.dbMode = 'json';
    return { root, data };
}
function response() {
    const res = new EventEmitter(); res.statusCode = 200;
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.body = body; return res; }; return res;
}
const source = await sharp(Buffer.from('<svg width="480" height="600"><rect width="480" height="600" fill="white"/><g stroke="#111" stroke-width="4" fill="none"><path d="M300 400 L300 120 M300 250 L200 150 M300 300 L400 220 M80 450 Q150 400 220 450 Q150 500 80 450Z"/></g></svg>')).png().toBuffer();
const image = bufferToDataUrl(source);

test('deleting a record cannot remove another owner, another ID, or a symlink target', async t => {
    const { root, data } = fixture(t);
    const dir = path.join(root, 'public/user_images/other'); fs.mkdirSync(dir, { recursive: true });
    const victim = path.join(dir, '1.png'); fs.writeFileSync(victim, source);
    const item = await addArtwork(data, 'owner', { image: '/user_images/other/1.png' });
    await deleteArtwork(data, 'owner', item.id); assert.ok(fs.existsSync(victim));
    const own = path.join(root, 'public/user_images/owner'); fs.mkdirSync(own, { recursive: true });
    fs.writeFileSync(path.join(own, '2.png'), source);
    deletePublicImageIfExists(data, '/user_images/owner/2.png', 'owner', 1);
    assert.ok(fs.existsSync(path.join(own, '2.png')));
    fs.symlinkSync(victim, path.join(own, '1.png'));
    deletePublicImageIfExists(data, '/user_images/owner/1.png', 'owner', 1); assert.ok(fs.existsSync(victim));
    deletePublicImageIfExists(data, '/user_images/owner/2.png', 'owner', 2);
    assert.equal(fs.existsSync(path.join(own, '2.png')), false);
});

test('video fields and historical prompt links survive gallery reads', async t => {
    const { data } = fixture(t);
    await addArtwork(data, 'owner', { image, video_url: '/uploads/videos/a.mp4', video_prompt: '风吹竹影' });
    await addArtwork(data, 'owner', { image, prompt: '画意\n视频链接：/uploads/videos/b.mp4' });
    const rows = await listArtworks(data, 'owner');
    assert.equal(rows[0].video_url, '/uploads/videos/b.mp4');
    assert.equal(rows[1].video_url, '/uploads/videos/a.mp4'); assert.equal(rows[1].video_prompt, '风吹竹影');
});

test('original candidate aspect ratio is measured before alignment', async () => {
    const stretched = await sharp(source).resize(720, 600, { fit: 'fill' }).png().toBuffer();
    assert.ok(Math.abs((await compareStructure(image, stretched)).aspectDelta - 0.5) < 0.001);
    assert.equal((await compareStructure(image, image)).aspectDelta, 0);
});

test('blank corners retain the correct spatial labels', () => {
    for (const [cell, expected] of [[0, '左上'], [3, '右上'], [12, '左下'], [15, '右下']]) {
        const grid = Array(16).fill(1); grid[cell] = 0;
        assert.equal(buildContract({ analysis: { width: 100, height: 100, components: [], grid } }).negative_space[0].region, expected);
    }
});

test('high scoring hard defects still trigger a repair', async () => {
    let calls = 0;
    const result = await runStructurePipeline({ sketch: image, style: 'bluewhite', options: { candidates: 1 }, generate: async () => ({ image }), repair: async () => { calls++; return { image }; } });
    assert.ok(result.report.score >= 0.62); assert.equal(result.report.verdict, 'repair'); assert.equal(calls, 1);
});

test('calligraphy does not call a paid model', async () => {
    const result = await runStructurePipeline({ sketch: image, style: 'calligraphy', generate: () => { throw new Error('must not call'); } });
    assert.equal(result.mode, 'layered'); assert.ok(result.chosen.image);
});

test('passwords are salted and legacy logins upgrade without breaking authentication', async t => {
    const { data } = fixture(t);
    const a = await hashPassword('test-only-password'), b = await hashPassword('test-only-password');
    assert.notEqual(a, b); assert.ok(await matchesPassword('test-only-password', a));
    assert.equal(await matchesPassword('wrong', a), false);
    const file = path.join(data, 'users/legacy.json');
    fs.writeFileSync(file, JSON.stringify({ username: 'legacy', password_hash: crypto.createHash('sha256').update('old-password').digest('hex') }));
    assert.ok(await verifyUser(data, { username: 'legacy', password: 'old-password' }));
    assert.match(JSON.parse(fs.readFileSync(file)).password_hash, /^scrypt\$/);
    assert.equal(await verifyUser(data, { username: '../legacy', password: 'old-password' }), null);
    assert.deepEqual((await Promise.all([createUser(data, { username: 'sameuser', password: 'password' }), createUser(data, { username: 'sameuser', password: 'password' })])).sort(), [false, true]);
});

test('image downloads reject private addresses, credentials and DNS rebinding targets', async () => {
    for (const url of ['https://127.0.0.1/a', 'https://[::1]/a', 'https://10.0.0.1/a', 'http://example.com/a', 'https://user:pass@example.com/a', 'https://example.com:444/a']) await assert.rejects(validateImageUrl(url));
    await assert.rejects(validateImageUrl('https://example.com/a', async () => [{ address: '192.168.1.2', family: 4 }]));
    assert.ok((await validateImageUrl('https://example.com/a', async () => [{ address: '93.184.216.34', family: 4 }])).url);
});

test('sessions persist across store instances and expire', async t => {
    const { root } = fixture(t), dir = path.join(root, 'sessions');
    const a = new FileSessionStore(dir), b = new FileSessionStore(dir);
    await new Promise((resolve, reject) => a.set('id', { cookie: { expires: new Date(Date.now() + 60000) }, user: { username: 'owner' } }, e => e ? reject(e) : resolve()));
    const read = () => new Promise((resolve, reject) => b.get('id', (e, v) => e ? reject(e) : resolve(v)));
    assert.equal((await read()).user.username, 'owner');
    a.set('id', { cookie: { expires: new Date(0) } }); assert.equal(await read(), null);
});

test('AI guard requires login, rejects overlap and persists quota', t => {
    const { data } = fixture(t); const guard = createUsageGuard(data), res = response();
    assert.equal(guard({ session: {}, path: '/generate' }, res), false); assert.equal(res.statusCode, 401);
    const req = { session: { user: { username: 'owner' } }, path: '/generate' };
    const first = response(); assert.equal(guard(req, first), true);
    const second = response(); assert.equal(guard(req, second), false); assert.equal(second.statusCode, 429);
    first.emit('finish'); assert.equal(createUsageGuard(data)(req, response()), false);
});

test('cross-origin writes are rejected while same-origin requests work', () => {
    let passed = false;
    originGuard({ get: key => key === 'origin' ? 'https://evil.example' : 'app.example' }, response(), () => { passed = true; });
    assert.equal(passed, false);
    originGuard({ get: key => key === 'origin' ? 'https://app.example' : 'app.example' }, response(), () => { passed = true; }); assert.equal(passed, true);
});


test('explicit no-image requests do not trigger paid drawing', () => {
    for (const text of ['不需要生成图片，只给建议', '不要帮我画一幅画', '先不生成一张图片', '无需绘制，只讨论构图']) assert.equal(isDrawRequest(text), false);
    for (const text of ['帮我画一幅月下小舟', '请画一张山水画']) assert.equal(isDrawRequest(text), true);
});


test('optional DoH resolution still rejects private addresses', async t => {
    const oldFlag = process.env.IMAGE_DNS_OVER_HTTPS;
    const oldFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = oldFetch; if (oldFlag === undefined) delete process.env.IMAGE_DNS_OVER_HTTPS; else process.env.IMAGE_DNS_OVER_HTTPS = oldFlag; });
    process.env.IMAGE_DNS_OVER_HTTPS = 'true';
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ Status: 0, Answer: [{ type: 1, data: '127.0.0.1' }] }) });
    await assert.rejects(validateImageUrl('https://example.com/image.png'), /内网或保留/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ Status: 0, Answer: [{ type: 1, data: '8.8.8.8' }] }) });
    assert.equal((await validateImageUrl('https://example.com/image.png')).addresses[0].address, '8.8.8.8');
});

test('semantic evidence overrides a perfect geometric score and malformed replies cannot pass', async () => {
    const { parseSemanticReview, applySemanticReview } = await import('../providers/semanticReview.js');
    const base = { score: 1, verdict: 'accept', defects: [], breakdown: {} };
    const checked = parseSemanticReview(JSON.stringify({ verdict: 'pass', summary: '有变化', issues: [{ code: 'MISSING_SUBJECT', evidence: '原图中央有舟，候选中消失' }] }));
    assert.equal(checked.verdict, 'reject');
    assert.equal(applySemanticReview(base, checked).verdict, 'repair');
    assert.equal(applySemanticReview(base, { verdict: 'uncertain', issues: [], summary: '复核未完成' }).verdict, 'repair');
    assert.throws(() => parseSemanticReview('{"verdict":"pass"}'));
    assert.throws(() => parseSemanticReview('{"verdict":"reject","summary":"差","issues":[]}'));
});

test('structured selection prefers semantically intact candidates and uncertainty never triggers paid repair', async () => {
    let reviewCalls = 0;
    const result = await runStructurePipeline({ sketch: image, style: 'ink', options: { candidates: 2, repair: false, seed: 42 },
        generate: async () => ({ image }),
        review: async () => ++reviewCalls === 1
            ? { verdict: 'reject', issues: [{ code: 'ADDED_SEAL', evidence: '左上角新增红印' }], summary: '新增印章' }
            : { verdict: 'pass', issues: [], summary: '主体保持' } });
    assert.equal(result.chosen.seed, 42 + 7919);
    assert.equal(result.report.semantic.verdict, 'pass');
    let repairs = 0;
    const uncertain = await runStructurePipeline({ sketch: image, options: { candidates: 1 }, generate: async () => ({ image }),
        review: async () => ({ verdict: 'uncertain', issues: [], summary: '超时' }),
        repair: async () => { repairs++; return { image }; } });
    assert.equal(repairs, 0); assert.equal(uncertain.report.verdict, 'repair');
});


test('fidelity video preset selects the quality model and does not send flash-only audio flags', async t => {
    const { createWanPayload } = await import('../providers/dashscope_wan_video.js');
    const oldKey = process.env.DASHSCOPE_API_KEY, oldModel = process.env.DASHSCOPE_VIDEO_MODEL, oldQuality = process.env.DASHSCOPE_VIDEO_QUALITY_MODEL;
    t.after(() => { for (const [k,v] of Object.entries({DASHSCOPE_API_KEY:oldKey,DASHSCOPE_VIDEO_MODEL:oldModel,DASHSCOPE_VIDEO_QUALITY_MODEL:oldQuality})) {if (v === undefined) delete process.env[k]; else process.env[k]=v;} });
    process.env.DASHSCOPE_API_KEY = 'mock-key'; process.env.DASHSCOPE_VIDEO_MODEL = 'wan2.6-i2v-flash'; process.env.DASHSCOPE_VIDEO_QUALITY_MODEL = 'wan2.6-i2v';
    const quality = createWanPayload({ image, options: { profile: 'premium', duration: 5, resolution: '1080P', audio: false } });
    assert.equal(quality.model, 'wan2.6-i2v'); assert.equal(quality.parameters.resolution, '1080P'); assert.equal('audio' in quality.parameters, false);
    const fast = createWanPayload({ image, options: { profile: 'balanced', audio: false } });
    assert.equal(fast.model, 'wan2.6-i2v-flash'); assert.equal(fast.parameters.audio, false);
});
