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
