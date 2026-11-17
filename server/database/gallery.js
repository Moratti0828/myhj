import fs from "fs";
import path from "path";
import { CONTENT_TYPES, deletePublicImageIfExists, getPool, readJson, saveImageFile, withTransaction } from "./db.js";

function normalizeArtwork(row) {
    return {
        id: row.id,
        image: row.image_url || row.image || null,
        video_url: row.video_url || /(?:^|\n)视频链接：(\/uploads\/videos\/[^\s]+\.mp4)/.exec(row.prompt || "")?.[1] || null,
        video_prompt: row.video_prompt || "",
        content: row.content_type || row.content || "unknown",
        style: row.style || "unknown",
        prompt: row.prompt || "",
        date: row.created_at || row.date
    };
}

function emptyStats() {
    return CONTENT_TYPES.reduce(
        (acc, type) => {
            acc[type] = 0;
            return acc;
        },
        { total: 0 }
    );
}

async function findUserByUsername(conn, username) {
    const [rows] = await conn.execute(
        "SELECT id, username FROM users WHERE username = ? LIMIT 1",
        [username]
    );
    return rows[0] || null;
}

export async function listArtworks(dataDir, username) {
    if (global.dbMode === "json") {
        const filePath = path.join(dataDir, "users", `${username}.gallery.json`);
        const list = readJson(filePath, []);
        return Array.isArray(list) ? list.map(normalizeArtwork) : [];
    }

    const [rows] = await getPool().execute(
        `SELECT a.id, a.image_url, a.content_type, a.style, a.prompt, a.video_url, a.video_prompt, a.created_at
         FROM artworks a
         INNER JOIN users u ON u.id = a.user_id
         WHERE u.username = ?
         ORDER BY a.created_at DESC`,
        [username]
    );
    return rows.map(normalizeArtwork);
}

export async function addArtwork(dataDir, username, { image, content, style, prompt, video_url = null, video_prompt = "" }) {
    if (global.dbMode === "json") {
        const filePath = path.join(dataDir, "users", `${username}.gallery.json`);
        const list = readJson(filePath, []);
        const maxId = list.reduce((m, a) => (a.id > m ? a.id : m), 0);
        const newId = maxId + 1;

        let imageUrl = image;
        try {
            if (image && image.startsWith("data:image/")) {
                imageUrl = saveImageFile(dataDir, username, newId, image);
            }
        } catch (err) {
            console.warn("[gallery/json] saveImageFile failed, using inline image:", err.message);
        }

        const artwork = {
            video_url, video_prompt,
            id: newId,
            image_url: imageUrl || "",
            image: imageUrl || "",
            content_type: content || "unknown",
            content: content || "unknown",
            style: style || "unknown",
            prompt: prompt || "",
            created_at: new Date().toISOString(),
            date: new Date().toISOString()
        };

        list.unshift(artwork);
        fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
        return normalizeArtwork(artwork);
    }

    return withTransaction(async conn => {
        const user = await findUserByUsername(conn, username);
        if (!user) {
            const err = new Error("用户不存在");
            err.status = 404;
            throw err;
        }

        const contentType = content || "unknown";
        const [insertResult] = await conn.execute(
            `INSERT INTO artworks (user_id, image_url, content_type, style, prompt)
             VALUES (?, '', ?, ?, ?)`,
            [user.id, contentType, style || "unknown", prompt || ""]
        );

        const artworkId = insertResult.insertId;
        let imageUrl = image;

        try {
            if (image && image.startsWith("data:image/")) {
                imageUrl = saveImageFile(dataDir, username, artworkId, image);
            }
        } catch (err) {
            console.warn("[gallery] saveImageFile failed, falling back to inline image:", err.message);
        }

        await conn.execute(
            "UPDATE artworks SET image_url = ?, video_url = ?, video_prompt = ? WHERE id = ?",
            [imageUrl || "", video_url, video_prompt, artworkId]
        );

        await conn.execute(
            `INSERT INTO artwork_type_counts (user_id, content_type, count)
             VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE
                count = count + 1,
                updated_at = CURRENT_TIMESTAMP(3)`,
            [user.id, contentType]
        );

        const [rows] = await conn.execute(
            `SELECT id, image_url, content_type, style, prompt, video_url, video_prompt, created_at
             FROM artworks
             WHERE id = ?`,
            [artworkId]
        );

        return normalizeArtwork(rows[0]);
    });
}

export async function deleteArtwork(dataDir, username, id) {
    if (global.dbMode === "json") {
        const filePath = path.join(dataDir, "users", `${username}.gallery.json`);
        const list = readJson(filePath, []);
        const idx = list.findIndex(a => a.id === id);
        if (idx === -1) return false;

        const [removed] = list.splice(idx, 1);
        fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");

        try {
            deletePublicImageIfExists(dataDir, removed.image_url || removed.image, username, id);
        } catch (err) {
            console.warn("[gallery/json] Failed to delete image file:", err.message);
        }

        return true;
    }

    let imageToDelete = null;

    const deleted = await withTransaction(async conn => {
        const user = await findUserByUsername(conn, username);
        if (!user) return false;

        const [rows] = await conn.execute(
            `SELECT id, image_url, content_type
             FROM artworks
             WHERE id = ? AND user_id = ?
             LIMIT 1`,
            [id, user.id]
        );
        const artwork = rows[0];
        if (!artwork) return false;

        await conn.execute("DELETE FROM artworks WHERE id = ?", [id]);
        await conn.execute(
            `UPDATE artwork_type_counts
             SET count = IF(count > 0, count - 1, 0),
                 updated_at = CURRENT_TIMESTAMP(3)
             WHERE user_id = ? AND content_type = ?`,
            [user.id, artwork.content_type]
        );
        await conn.execute(
            "DELETE FROM artwork_type_counts WHERE user_id = ? AND content_type = ? AND count = 0",
            [user.id, artwork.content_type]
        );

        imageToDelete = artwork.image_url;
        return true;
    });

    if (deleted) {
        try {
            deletePublicImageIfExists(dataDir, imageToDelete, username, id);
        } catch (err) {
            console.warn("[gallery] Failed to delete image file:", err.message);
        }
    }

    return deleted;
}

export function getStats(list) {
    const stats = emptyStats();
    stats.total = list.length;
    for (const item of list) {
        if (Object.prototype.hasOwnProperty.call(stats, item.content)) {
            stats[item.content]++;
        }
    }
    return stats;
}

export async function listTypeCountsForAdmin(dataDir) {
    if (global.dbMode === "json") {
        const usersDir = path.join(dataDir, "users");
        if (!fs.existsSync(usersDir)) return [];

        const galleryFiles = fs.readdirSync(usersDir).filter(f => f.endsWith(".gallery.json"));
        const result = [];

        for (const file of galleryFiles) {
            const username = file.replace(".gallery.json", "");
            const userFilePath = path.join(usersDir, `${username}.json`);
            const user = readJson(userFilePath, null);
            const user_id = user?.id || username;

            const gallery = readJson(path.join(usersDir, file), []);
            if (!Array.isArray(gallery)) continue;

            const counts = {};
            for (const artwork of gallery) {
                const ct = artwork.content_type || artwork.content || "unknown";
                counts[ct] = (counts[ct] || 0) + 1;
            }

            for (const [content_type, count] of Object.entries(counts)) {
                result.push({ user_id, username, content_type, count, updated_at: null });
            }
        }

        return result.sort((a, b) =>
            a.username.localeCompare(b.username) || b.count - a.count
        );
    }

    const [rows] = await getPool().execute(`
        SELECT
            u.id AS user_id,
            u.username,
            c.content_type,
            c.count,
            c.updated_at
        FROM artwork_type_counts c
        INNER JOIN users u ON u.id = c.user_id
        ORDER BY u.username ASC, c.count DESC, c.content_type ASC
    `);

    return rows.map(row => ({
        user_id: row.user_id,
        username: row.username,
        content_type: row.content_type,
        count: Number(row.count || 0),
        updated_at: row.updated_at
    }));
}

export async function rebuildArtworkTypeCounts() {
    await withTransaction(async conn => {
        await conn.execute("DELETE FROM artwork_type_counts");
        await conn.execute(`
            INSERT INTO artwork_type_counts (user_id, content_type, count)
            SELECT user_id, content_type, COUNT(*)
            FROM artworks
            GROUP BY user_id, content_type
        `);
    });
}
