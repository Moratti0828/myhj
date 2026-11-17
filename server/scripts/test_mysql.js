import '../env.js';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { initializeDatabase, isJsonMode, getPool, withTransaction } from '../database/db.js';
import { createUser, verifyUser, listUsersForAdmin } from '../database/users.js';
import { addArtwork, listArtworks, deleteArtwork, listTypeCountsForAdmin } from '../database/gallery.js';

// This fixed, dedicated schema is created exclusively; existing data is never reused or dropped.
const database = 'moyun_huajing_test';
const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
});
let owned = false;
try {
  await connection.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  owned = true;
  process.env.MYSQL_DATABASE = database;
  await initializeDatabase();
  assert.equal(isJsonMode(), false);
  assert.equal(await createUser(null, { username: 'db_user', password: 'test-password' }), true);
  assert.equal(await createUser(null, { username: 'db_user', password: 'test-password' }), false);
  assert.equal((await verifyUser(null, { username: 'db_user', password: 'test-password' })).username, 'db_user');
  assert.equal(await verifyUser(null, { username: 'db_user', password: 'wrong-password' }), null);
  await getPool().execute('UPDATE users SET password_hash = ? WHERE username = ?', [crypto.createHash('sha256').update('old-password').digest('hex'), 'db_user']);
  assert.ok(await verifyUser(null, { username: 'db_user', password: 'old-password' }));
  const [hashes] = await getPool().query('SELECT password_hash FROM users');
  assert.match(hashes[0].password_hash, /^scrypt\$/);
  const item = await addArtwork(null, 'db_user', { image: '/fixture.png', content: 'birds', style: 'ink', prompt: '中文与表情 🐦', video_url: '/uploads/videos/test.mp4', video_prompt: '竹影摇曳' });
  assert.equal(item.video_prompt, '竹影摇曳');
  assert.equal(item.prompt, '中文与表情 🐦');
  assert.equal((await listTypeCountsForAdmin(null))[0].count, 1);
  assert.equal((await listUsersForAdmin(null))[0].artwork_count, 1);
  await assert.rejects(withTransaction(async conn => {
    await conn.query("UPDATE artworks SET prompt = 'rollback' WHERE id = ?", [item.id]);
    throw new Error('rollback fixture');
  }), /rollback fixture/);
  assert.equal((await listArtworks(null, 'db_user'))[0].prompt, '中文与表情 🐦');
  await getPool().end();
  await initializeDatabase();
  assert.equal(isJsonMode(), false);
  assert.equal((await listArtworks(null, 'db_user'))[0].video_url, '/uploads/videos/test.mp4');
  assert.equal(await deleteArtwork(null, 'missing_user', item.id), false);
  assert.equal(await deleteArtwork(null, 'db_user', item.id), true);
  assert.equal((await listTypeCountsForAdmin(null)).length, 0);
  console.log('PASS MySQL: authentication, legacy passwords, Unicode, videos, counts, rollback, reconnect persistence, ownership and deletion');
  const child = spawn(process.execPath, [fileURLToPath(new URL('./test_http_regressions.js', import.meta.url))], {
    env: { ...process.env, MYSQL_HTTP_TEST: 'true' }, stdio: 'inherit',
  });
  const [exitCode] = await once(child, 'exit');
  assert.equal(exitCode, 0, 'MySQL HTTP suite');
} finally {
  if (owned) {
    try { await getPool().end(); } catch {}
    await connection.query(`DROP DATABASE ${database}`);
  }
  await connection.end();
}
