import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const envPath = path.resolve(__dirname, ".env");
export const envLocalPath = path.resolve(__dirname, ".env.local");

function loadEnvFile(filePath, { override = false } = {}) {
    let parsed;
    try {
        parsed = dotenv.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        if (error?.code === "ENOENT") return;
        throw error;
    }
    for (const [key, value] of Object.entries(parsed)) {
        if (value === "") continue;
        if (override || process.env[key] === undefined || process.env[key] === "") {
            process.env[key] = value;
        }
    }
}

loadEnvFile(envPath);
loadEnvFile(envLocalPath, { override: true });
