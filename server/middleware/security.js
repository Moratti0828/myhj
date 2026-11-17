import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import session from 'express-session';

// Single-instance durable sessions. Multi-instance deployments need a shared store.
export class FileSessionStore extends session.Store {
    constructor(dir) { super(); this.dir = dir; fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); }
    file(id) { return path.join(this.dir, crypto.createHash('sha256').update(id).digest('hex') + '.json'); }
    get(id, cb) {
        try {
            const file = this.file(id);
            if (!fs.existsSync(file)) return cb(null, null);
            const value = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!value.cookie?.expires || Date.parse(value.cookie.expires) <= Date.now()) {
                fs.unlinkSync(file); return cb(null, null);
            }
            cb(null, value);
        } catch (error) { cb(error); }
    }
    set(id, value, cb = () => {}) {
        try {
            const file = this.file(id), tmp = file + '.' + crypto.randomUUID();
            fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
            fs.renameSync(tmp, file); cb(null);
        } catch (error) { cb(error); }
    }
    destroy(id, cb = () => {}) { try { fs.rmSync(this.file(id), { force: true }); cb(null); } catch (error) { cb(error); } }
    touch(id, value, cb) { this.set(id, value, cb); }
}

export function sessionSecret(dir) {
    const configured = process.env.SESSION_SECRET || '';
    if (configured.length >= 32 && !/change_me|dev_secret/i.test(configured)) return configured;
    if (process.env.NODE_ENV === 'production') throw new Error('生产环境 SESSION_SECRET 须至少 32 位随机字符');
    const file = path.join(dir, '.session-secret');
    if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 });
    return fs.readFileSync(file, 'utf8').trim();
}

export function originGuard(req, res, next) {
    const origin = req.get('origin');
    if (!origin) return next();
    try {
        const url = new URL(origin);
        const allowed = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim());
        if (url.host === req.get('host') || allowed.includes(origin)) return next();
    } catch { /* Invalid origins are denied. */ }
    return res.status(403).json({ success: false, error: '不允许此来源的请求' });
}

// Persist reservations before a paid request; failed calls still count towards the
// abuse budget. Units are worst-case provider calls, not a monetary charge.
export function createUsageGuard(dir) {
    const file = path.join(dir, 'ai-usage.json');
    let usage = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const active = new Map();
    return (req, res, next) => {
        const user = req.session?.user?.username;
        if (!user) { res.status(401).json({ success: false, error: '请先登录后使用在线 AI 生成' }); return false; }
        const day = new Date().toISOString().slice(0, 10);
        const key = `${day}:${user}`;
        const item = usage[key] || { count: 0, last: 0 };
        const cost = req.path.includes('structure') ? 4 : 1;
        const limit = Math.max(1, Number(process.env.AI_DAILY_LIMIT) || 30);
        if (active.has(user) || Date.now() - item.last < 2000 || item.count + cost > limit) {
            res.status(429).json({ success: false, error: '请求过于频繁、已有任务处理中或今日 AI 额度已用完，请稍后再试' }); return false;
        }
        usage = Object.fromEntries(Object.entries(usage).filter(([k]) => k.startsWith(day + ':')));
        usage[key] = { count: item.count + cost, last: Date.now() };
        try {
            const tmp = file + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(usage), { mode: 0o600 }); fs.renameSync(tmp, file);
        } catch { res.status(503).json({ success: false, error: '暂时无法记录 AI 额度，请稍后再试' }); return false; }
        active.set(user, true);
        const release = () => active.delete(user);
        res.once('finish', release); res.once('close', release);
        if (next) next();
        return true;
    };
}
