import crypto from "crypto";
import fs from "fs";
import path from "path";
import { promisify } from "node:util";
const scrypt = promisify(crypto.scrypt);
import { getPool, readJson } from "./db.js";

export async function hashPassword(pw) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scrypt(String(pw), salt, 64);
    return `scrypt$${salt}$${hash.toString("hex")}`;
}

export async function matchesPassword(pw, stored) {
    if (typeof stored !== "string") return false;
    if (/^[a-f0-9]{64}$/i.test(stored)) {
        const hash = crypto.createHash("sha256").update(String(pw)).digest();
        return crypto.timingSafeEqual(hash, Buffer.from(stored, "hex"));
    }
    const parts = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored);
    if (!parts) return false;
    return crypto.timingSafeEqual(await scrypt(String(pw), parts[1], 64), Buffer.from(parts[2], "hex"));
}

function normalizeRole(role) {
    return role === "admin" ? "admin" : "user";
}

function mapUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        email: row.email || "",
        role: normalizeRole(row.role),
        created_at: row.created_at
    };
}

export async function createUser(dataDir, { username, password, email, role = "user" }) {
    if (global.dbMode === "json") {
        const filePath = path.join(dataDir, "users", `${username}.json`);
        if (fs.existsSync(filePath)) return false;
        const data = {
            id: Date.now(),
            username,
            email: email || "",
            password_hash: await hashPassword(password),
            role: normalizeRole(role),
            created_at: new Date().toISOString()
        };
        try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 }); }
        catch (error) { if (error.code === "EEXIST") return false; throw error; }
        return true;
    }

    try {
        await getPool().execute(
            `INSERT INTO users (username, email, password_hash, role)
             VALUES (?, ?, ?, ?)`,
            [username, email || "", await hashPassword(password), normalizeRole(role)]
        );
        return true;
    } catch (err) {
        if (err?.code === "ER_DUP_ENTRY") return false;
        throw err;
    }
}

export async function upsertUserWithHash({ username, email = "", passwordHash, role = "user", createdAt }) {
    const [existingRows] = await getPool().execute(
        "SELECT id FROM users WHERE username = ? LIMIT 1",
        [username]
    );

    if (existingRows.length) {
        await getPool().execute(
            `UPDATE users
             SET email = ?, role = IF(role = 'admin', 'admin', ?)
             WHERE username = ?`,
            [email || "", normalizeRole(role), username]
        );
        return existingRows[0].id;
    }

    const [result] = await getPool().execute(
        `INSERT INTO users (username, email, password_hash, role, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [username, email || "", passwordHash, normalizeRole(role), createdAt || new Date()]
    );
    return result.insertId;
}

export async function verifyUser(dataDir, { username, password }) {
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,32}$/.test(username || "") || typeof password !== "string" || password.length > 1024) return null;
    if (global.dbMode === "json") {
        const filePath = path.join(dataDir, "users", `${username}.json`);
        const user = readJson(filePath, null);
        if (!user) return null;
        if (!await matchesPassword(password, user.password_hash)) return null;
        if (!user.password_hash.startsWith("scrypt$")) {
            user.password_hash = await hashPassword(password);
            fs.writeFileSync(filePath, JSON.stringify(user, null, 2), { mode: 0o600 });
        }
        return mapUser(user);
    }

    const [rows] = await getPool().execute(
        `SELECT id, username, email, password_hash, role, created_at
         FROM users
         WHERE username = ?
         LIMIT 1`,
        [username]
    );
    const user = rows[0];
    if (!user) return null;
    if (!await matchesPassword(password, user.password_hash)) return null;
    if (!user.password_hash.startsWith("scrypt$")) {
        await getPool().execute("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(password), user.id]);
    }
    return mapUser(user);
}

export async function ensureAdminUser(dataDir) {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    if (!username || !password) return;

    const email = process.env.ADMIN_EMAIL || "";

    if (global.dbMode === "json") {
        const filePath = path.join(dataDir, "users", `${username}.json`);
        if (!fs.existsSync(filePath)) {
            const data = {
                id: Date.now(),
                username,
                email,
                password_hash: await hashPassword(password),
                role: "admin",
                created_at: new Date().toISOString()
            };
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
            console.log(`[db/json] Admin user '${username}' created.`);
        } else {
            const data = readJson(filePath, {});
            if (data.role !== "admin") {
                data.role = "admin";
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
                console.log(`[db/json] Admin user '${username}' promoted to admin.`);
            }
        }
        return;
    }

    const [rows] = await getPool().execute(
        "SELECT id FROM users WHERE username = ? LIMIT 1",
        [username]
    );

    if (rows.length) {
        await getPool().execute(
            `UPDATE users
             SET role = 'admin', email = IF(email = '', ?, email)
             WHERE username = ?`,
            [email, username]
        );
        return;
    }

    await createUser(null, { username, password, email, role: "admin" });
}

export async function listUsersForAdmin(dataDir) {
    if (global.dbMode === "json") {
        const usersDir = path.join(dataDir, "users");
        if (!fs.existsSync(usersDir)) return [];

        const files = fs.readdirSync(usersDir).filter(
            f => f.endsWith(".json") && !f.endsWith(".gallery.json")
        );

        return files.map(file => {
            const userPath = path.join(usersDir, file);
            const user = readJson(userPath, null);
            if (!user) return null;

            const galleryPath = path.join(usersDir, `${user.username}.gallery.json`);
            const gallery = readJson(galleryPath, []);
            const artwork_count = Array.isArray(gallery) ? gallery.length : 0;
            const last_artwork_at = artwork_count > 0
                ? gallery.reduce((latest, a) => (!latest || a.date > latest ? a.date : latest), null)
                : null;

            return {
                ...mapUser(user),
                artwork_count,
                last_artwork_at
            };
        }).filter(Boolean).sort((a, b) => b.created_at > a.created_at ? 1 : -1);
    }

    const [rows] = await getPool().execute(`
        SELECT
            u.id,
            u.username,
            u.email,
            u.role,
            u.created_at,
            COUNT(a.id) AS artwork_count,
            MAX(a.created_at) AS last_artwork_at
        FROM users u
        LEFT JOIN artworks a ON a.user_id = u.id
        GROUP BY u.id, u.username, u.email, u.role, u.created_at
        ORDER BY u.created_at DESC
    `);

    return rows.map(row => ({
        ...mapUser(row),
        artwork_count: Number(row.artwork_count || 0),
        last_artwork_at: row.last_artwork_at || null
    }));
}
