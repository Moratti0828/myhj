import "../env.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { ensureDataDir, getPool, initializeDatabase, isJsonMode, readJson } from "./db.js";
import { rebuildArtworkTypeCounts } from "./gallery.js";
import { upsertUserWithHash } from "./users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, "..");

const dataDir = process.env.DATA_DIR || path.join(serverDir, "data");
const usersDir = path.join(dataDir, "users");

function mysqlDate(value) {
    if (!value) return new Date();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function importArtwork(userId, item) {
    const imageUrl = item.image_url || item.imageFile || item.image || "";
    const content = item.content || "unknown";
    const style = item.style || "unknown";
    const prompt = item.prompt || "";
    const createdAt = mysqlDate(item.date || item.created_at);

    const [existing] = await getPool().execute(
        `SELECT id
         FROM artworks
         WHERE user_id = ?
           AND content_type = ?
           AND style = ?
           AND created_at = ?
         LIMIT 1`,
        [userId, content, style, createdAt]
    );

    if (existing.length) return false;

    await getPool().execute(
        `INSERT INTO artworks (user_id, image_url, content_type, style, prompt, created_at, video_url, video_prompt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, imageUrl, content, style, prompt, createdAt, item.video_url || null, item.video_prompt || ""]
    );
    return true;
}

async function main() {
    ensureDataDir(dataDir);
    await initializeDatabase();
    if (isJsonMode()) throw new Error("MySQL connection is required for migration; JSON fallback is not allowed.");

    if (!fs.existsSync(usersDir)) {
        console.log(`[migrate] no users directory found: ${usersDir}`);
        return;
    }

    const files = fs.readdirSync(usersDir).filter(file => file.endsWith(".json"));
    const userFiles = files.filter(file => !file.endsWith(".gallery.json"));

    let usersImported = 0;
    let artworksImported = 0;

    for (const file of userFiles) {
        const userPath = path.join(usersDir, file);
        const user = readJson(userPath, null);
        if (!user?.username || !user?.password_hash) continue;

        const userId = await upsertUserWithHash({
            username: user.username,
            email: user.email || "",
            passwordHash: user.password_hash,
            role: user.role || "user",
            createdAt: mysqlDate(user.created_at)
        });
        usersImported++;

        const galleryPath = path.join(usersDir, `${user.username}.gallery.json`);
        const gallery = readJson(galleryPath, []);
        if (!Array.isArray(gallery)) continue;

        for (const item of gallery) {
            if (await importArtwork(userId, item)) artworksImported++;
        }
    }

    await rebuildArtworkTypeCounts();
    console.log(`[migrate] users processed: ${usersImported}`);
    console.log(`[migrate] artworks imported: ${artworksImported}`);
}

main()
    .catch(err => {
        console.error("[migrate] failed:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await getPool().end();
        } catch (_) {}
    });
