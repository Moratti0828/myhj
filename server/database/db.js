import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

let pool;

export const CONTENT_TYPES = [
    "landscape",
    "birds",
    "figure",
    "flowers",
    "animals",
    "architecture",
    "cloud",
    "flying",
    "dragon"
];

export function ensureDataDir(dataDir) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const usersDir = path.join(dataDir, "users");
    if (!fs.existsSync(usersDir)) fs.mkdirSync(usersDir, { recursive: true });
}

function getMysqlConfig(includeDatabase = true) {
    const config = {
        host: process.env.MYSQL_HOST || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || "root",
        password: process.env.MYSQL_PASSWORD || "",
        charset: "utf8mb4",
        waitForConnections: true,
        connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
        dateStrings: true,
        connectTimeout: 5000
    };

    if (includeDatabase) {
        config.database = process.env.MYSQL_DATABASE || "moyun_huajing";
    }

    return config;
}

export async function initializeDatabase() {
    const database = process.env.MYSQL_DATABASE || "moyun_huajing";
    const quotedDatabase = database.replace(/`/g, "``");

    try {
        const bootstrap = mysql.createPool(getMysqlConfig(false));

        try {
            await bootstrap.query(
                `CREATE DATABASE IF NOT EXISTS \`${quotedDatabase}\`
                 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
            );
        } finally {
            await bootstrap.end();
        }

        pool = mysql.createPool(getMysqlConfig(true));

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                username VARCHAR(64) NOT NULL,
                email VARCHAR(255) NOT NULL DEFAULT '',
                password_hash CHAR(64) NOT NULL,
                role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                PRIMARY KEY (id),
                UNIQUE KEY uk_users_username (username)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS artworks (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                user_id BIGINT UNSIGNED NOT NULL,
                image_url MEDIUMTEXT NOT NULL,
                content_type VARCHAR(32) NOT NULL DEFAULT 'unknown',
                style VARCHAR(32) NOT NULL DEFAULT 'unknown',
                prompt TEXT NULL,
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                PRIMARY KEY (id),
                KEY idx_artworks_user_created (user_id, created_at),
                KEY idx_artworks_content (content_type),
                CONSTRAINT fk_artworks_user
                    FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS artwork_type_counts (
                user_id BIGINT UNSIGNED NOT NULL,
                content_type VARCHAR(32) NOT NULL,
                count INT UNSIGNED NOT NULL DEFAULT 0,
                updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                    ON UPDATE CURRENT_TIMESTAMP(3),
                PRIMARY KEY (user_id, content_type),
                CONSTRAINT fk_counts_user
                    FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        const [columns] = await pool.query("SHOW COLUMNS FROM artworks");
        const names = new Set(columns.map(column => column.Field));
        if (!names.has("video_url")) await pool.query("ALTER TABLE artworks ADD COLUMN video_url TEXT NULL");
        if (!names.has("video_prompt")) await pool.query("ALTER TABLE artworks ADD COLUMN video_prompt TEXT NULL");
        const [userColumns] = await pool.query("SHOW COLUMNS FROM users LIKE 'password_hash'");
        if (userColumns[0]?.Type !== "varchar(255)") await pool.query("ALTER TABLE users MODIFY password_hash VARCHAR(255) NOT NULL");
        global.dbMode = "mysql";
        console.log("[db] MySQL connected and tables ready.");
    } catch (err) {
        console.warn(`[db] MySQL unavailable (${err?.code || err?.message}), falling back to JSON mode.`);
        global.dbMode = "json";
        // 不抛出错误，函数正常返回，使用本地 JSON 存储
    }
}

export function isJsonMode() {
    return global.dbMode === "json";
}

export function getPool() {
    if (!pool) {
        throw new Error("MySQL has not been initialized");
    }
    return pool;
}

export async function withTransaction(fn) {
    const conn = await getPool().getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

export function readJson(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
        return fallback;
    }
}

export function saveImageFile(dataDir, username, id, dataUrl) {
    const publicDir = path.resolve(dataDir, "..", "..", "public");
    const userImagesDir = path.join(publicDir, "user_images", username);

    if (!fs.existsSync(userImagesDir)) {
        fs.mkdirSync(userImagesDir, { recursive: true });
    }

    const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) throw new Error("Invalid dataUrl format");

    const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
    const base64Data = matches[2];
    const filename = `${id}.${ext}`;
    const filePath = path.join(userImagesDir, filename);

    fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
    return `/user_images/${username}/${filename}`;
}

export function deletePublicImageIfExists(dataDir, imageUrl, username, artworkId) {
    if (!imageUrl || !imageUrl.startsWith("/user_images/")) return;

    const publicDir = path.resolve(dataDir, "..", "..", "public");
    const targetPath = path.resolve(publicDir, `.${imageUrl}`);
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,32}$/.test(username || "")) return;
    const ownerRoot = path.resolve(publicDir, "user_images", username);
    if (path.dirname(targetPath) !== ownerRoot || path.parse(targetPath).name !== String(artworkId)) return;
    // A stored URL is not proof of ownership. Also reject symlink escapes.
    if (!fs.existsSync(targetPath) || fs.lstatSync(targetPath).isSymbolicLink()) return;
    if (fs.realpathSync(path.dirname(targetPath)) !== path.join(fs.realpathSync(publicDir), "user_images", username)) return;
    fs.unlinkSync(targetPath);
}
