import "./env.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

import { requireAdmin, requireLogin } from "./middleware/auth.js";
import { FileSessionStore, sessionSecret, originGuard, createUsageGuard } from "./middleware/security.js";
import { ensureDataDir, initializeDatabase } from "./database/db.js";
import { createUser, ensureAdminUser, listUsersForAdmin, verifyUser } from "./database/users.js";
import { addArtwork, listArtworks, deleteArtwork, getStats, listTypeCountsForAdmin } from "./database/gallery.js";

import { createStoryboards } from "./providers/storyboard.js";
import { siliconFlowCaptionFromSketch } from "./providers/siliconflow_caption.js";
import { generateWithSiliconFlow, imageUrlToDataUrl } from "./providers/siliconflow_image.js";
import {
    createDashScopeWanTask,
    downloadDashScopeVideo,
    getDashScopeConfig,
    getDashScopeWanTask,
    sanitizeWanDurationForMode,
    sanitizeWanVideoMode,
    validateMp4File,
    validateWanVideoRequest
} from "./providers/dashscope_wan_video.js";
import { applyPromptEdits, previewGenerationInput } from "./prompt/generationInput.js";
import { buildImageEditPrompt } from "./prompt/buildImageEditPrompt.js";
import { runStructurePipeline } from "./agent/orchestrator.js";
import { listMotifs, planStory } from "./agent/storyDirector.js";
import { renderStoryboard } from "./compose/storyboardCard.js";
import { chatWithSiliconFlow } from "./providers/siliconflow_chat.js";
import { getSiliconFlowApiKey } from "./providers/siliconflow_config.js";
import {
    buildDrawPromptFromUser,
    buildDrawSummaryFromUser,
    buildFallbackHeritageAnswer,
    cleanAgentReply,
    getLatestUserText,
    getLocalHeritageAnswer,
    isDrawRequest
} from "./agent_knowledge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", "loopback");
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = process.env.PUBLIC_DIR || "public";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

ensureDataDir(DATA_DIR);

await initializeDatabase();
await ensureAdminUser(DATA_DIR);
console.log(`[db] Storage mode: ${global.dbMode}`);

app.use(originGuard);
app.use(cors({ origin: (origin, callback) => callback(null, !origin || (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).includes(origin)), credentials: true }));
app.use(express.json({ limit: process.env.JSON_LIMIT || "30mb" }));
app.use(cookieParser());

app.use(
    session({
        secret: sessionSecret(DATA_DIR),
        store: new FileSessionStore(path.join(DATA_DIR, "sessions")),
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

const paidGuard = createUsageGuard(DATA_DIR);
app.use("/api", (req, res, next) => {
    const remote = ["/caption", "/generate", "/enhance", "/generate/stream", "/enhance/stream", "/videos/storyboards", "/videos/image-to-video"];
    const structured = req.path === "/generate/structure/stream" && !(req.body?.style === "calligraphy" && req.body?.options?.layered !== false);
    if (req.method === "POST" && (remote.includes(req.path) || structured)) return paidGuard(req, res, next);
    next();
});
app.use("/user_images/:username", requireLogin, (req, res, next) => {
    if (req.params.username !== req.session.user.username) return res.status(403).json({ success: false, error: "无权访问此作品" });
    next();
});
app.use(express.static(path.resolve(__dirname, "..", PUBLIC_DIR)));

// 单端口模式：SPA_DIR 指向构建产物时，直接用后端伺服前端，访问 http://localhost:3000 即可。
const SPA_DIR = String(process.env.SPA_DIR || "").trim();
const SPA_ROOT = SPA_DIR ? path.resolve(__dirname, "..", SPA_DIR) : "";
if (SPA_ROOT) {
    app.use(express.static(SPA_ROOT));
}

// ==================== 工具函数 ====================

function ensureSiliconFlowApiKey() {
    try {
        getSiliconFlowApiKey("project startup");
    } catch (err) {
        throw err;
    }
}

/** 全局默认负面词，在书童等非主流水线生图时使用 */
const DEFAULT_NEGATIVE =
    "text, watermark, logo, signature, chinese characters, words, letters, numbers, typography, ink label, low quality, blurry, deformed, noisy";

function envNumber(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function timeoutAfter(ms, message) {
    return new Promise((_, reject) => {
        setTimeout(() => {
            const err = new Error(message);
            err.status = 504;
            reject(err);
        }, ms);
    });
}

function buildErrorPayload(defaultMessage, err) {
    const errorMessage = err?.message || defaultMessage;
    const detail =
        typeof err?.detail === "string"
            ? err.detail
            : err?.detail
            ? JSON.stringify(err.detail)
            : undefined;
    return { success: false, error: errorMessage, detail };
}


// ==================== 生图流水线（支持 SSE 进度回调）====================

/**
 * @param {Function|null} onProgress  - 进度回调 (data) => void，用于 SSE 推送
 */
async function runGenerationPipeline({
    sketch,
    prompt,
    content,
    style,
    negative,
    options,
    mode = "generate",
    onProgress = null
}) {
    const emit = (stage, extra = {}) => {
        try {
            if (!onProgress) return;
            if (stage && typeof stage === "object") {
                onProgress(stage);
                return;
            }
            onProgress({ stage, ...extra });
        } catch (_) {}
    };

    if (!sketch) {
        const missingErr = new Error("缺少 sketch");
        missingErr.status = 400;
        throw missingErr;
    }

    console.log(`[${mode}] start pipeline`);
    ensureSiliconFlowApiKey();

    emit("building", { message: mode === "enhance" ? "正在准备输入图像…" : "正在准备原作与风格…" });
    const { positivePrompt: finalPrompt, negativePrompt: finalNegative } = applyPromptEdits(buildImageEditPrompt({
        prompt: prompt || "", style, negative: negative || "", mode, content: content || ""
    }), options);
    emit("submit", { message: "正在提交原图…" });
    const out = await generateWithSiliconFlow({
        image: sketch,
        prompt: finalPrompt,
        options: {
            seed: options?.seed,
            negative_prompt: finalNegative
        },
        onProgress: emit
    });

    console.log(`[${mode}] done`);
    return {
        caption: null,
        finalPrompt,
        negativePrompt: finalNegative,
        image: out.imageDataUrl,
        imageUrl: out.imageUrl,
        imageMaterialized: out.materialized,
        imageWarning: out.materializeError
    };
}

// ==================== Health ====================

app.get("/api/status", (_req, res) => {
    res.json({ status: "connected", message: "backend ok" });
});

app.get("/api/image-proxy", async (req, res) => {
    try {
        const url = String(req.query.url || "").trim();
        if (!/^https?:\/\//i.test(url)) {
            return res.status(400).json({ success: false, error: "invalid image url" });
        }

        const dataUrl = await imageUrlToDataUrl(url);
        const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUrl);
        if (!match) {
            return res.status(502).json({ success: false, error: "provider image could not be proxied" });
        }

        res.setHeader("Cache-Control", "no-store");
        res.type(match[1]);
        return res.send(Buffer.from(match[2], "base64"));
    } catch (err) {
        const status = Number(err?.status) || 502;
        return res.status(status).json(buildErrorPayload("provider image proxy failed", err));
    }
});

// ==================== Auth ====================

app.get("/api/check_login", (req, res) => {
    if (req.session?.user) {
        return res.json({
            logged_in: true,
            username: req.session.user.username,
            role: req.session.user.role || "user",
            is_admin: req.session.user.role === "admin"
        });
    }
    return res.json({ logged_in: false });
});

/** 合法用户名：字母/数字/下划线/中文，2-32 位 */
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,32}$/;

app.post("/api/register", async (req, res) => {
    try {
        const { username, password, email } = req.body || {};
        if (!username || !password)
            return res.status(400).json({ success: false, error: "缺少用户名或密码" });

        if (typeof password !== "string" || password.length < 8 || password.length > 1024) return res.status(400).json({ success: false, error: "密码长度须为 8–1024 位" });
        if (typeof username !== "string" || !USERNAME_RE.test(username))
            return res.status(400).json({
                success: false,
                error: "用户名只能包含字母、数字、下划线或中文，长度 2-32 位"
            });

        const ok = await createUser(DATA_DIR, { username, password, email });
        if (!ok) return res.status(409).json({ success: false, error: "用户名已存在" });
        return res.json({ success: true, message: "注册成功，请登录" });
    } catch (_e) {
        return res.status(500).json({ success: false, error: "注册失败" });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password)
            return res.status(400).json({ success: false, error: "缺少用户名或密码" });

        const user = await verifyUser(DATA_DIR, { username, password });
        if (!user) return res.status(401).json({ success: false, error: "用户名或密码错误" });

        await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
        req.session.user = { id: user.id, username: user.username, role: user.role || "user" };
        return res.json({
            success: true,
            username: user.username,
            role: user.role || "user",
            is_admin: user.role === "admin"
        });
    } catch (_e) {
        return res.status(500).json({ success: false, error: "登录失败" });
    }
});

app.post("/api/logout", (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

// ==================== Admin ====================

app.get("/api/admin/overview", requireLogin, requireAdmin, async (_req, res) => {
    try {
        const users = await listUsersForAdmin(DATA_DIR);
        const typeCounts = await listTypeCountsForAdmin(DATA_DIR);

        const summary = {
            total_users: users.length,
            total_artworks: users.reduce((sum, user) => sum + user.artwork_count, 0),
            active_users: users.filter(user => user.artwork_count > 0).length,
            total_type_rows: typeCounts.length
        };

        return res.json({ success: true, summary, users, type_counts: typeCounts });
    } catch (err) {
        console.error("admin overview error:", err?.message || err);
        return res.status(500).json({ success: false, error: "管理员数据加载失败" });
    }
});

// ==================== Gallery ====================

app.get("/api/gallery", requireLogin, asyncRoute(async (req, res) => {
    const artworks = await listArtworks(DATA_DIR, req.session.user.username);
    return res.json({ artworks, stats: getStats(artworks) });
}));

app.post("/api/gallery", requireLogin, asyncRoute(async (req, res) => {
    const { image, content, style, prompt, video_url, video_prompt } = req.body || {};
    if (video_url) {
        const task = [...videoTasks.values()].find(t => t.localVideoUrl === video_url && t.owner === req.session.user.username && t.status === "succeeded");
        if (!task) return res.status(403).json({ success: false, error: "只能保存本人已完成的视频" });
    }
    if (!image) return res.status(400).json({ success: false, error: "缺少图片" });
    const artwork = await addArtwork(DATA_DIR, req.session.user.username, {
        image,
        content,
        style,
        prompt, video_url, video_prompt
    });
    return res.json({ success: true, artwork });
}));

app.delete("/api/gallery/:id", requireLogin, asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const ok = await deleteArtwork(DATA_DIR, req.session.user.username, id);
    if (!ok) return res.status(404).json({ success: false, error: "作品不存在" });
    return res.json({ success: true });
}));

// ==================== AI Pipeline ====================

app.post("/api/caption", async (req, res) => {
    try {
        const { sketch } = req.body || {};
        if (!sketch)
            return res
                .status(400)
                .json({ success: false, error: "缺少 sketch", detail: "Request body needs sketch dataURL" });

        console.log("[caption] calling caption provider...");
        ensureSiliconFlowApiKey();
        const caption = await siliconFlowCaptionFromSketch({ sketchDataUrl: sketch });
        console.log("[caption] done");
        return res.json({ success: true, caption });
    } catch (err) {
        console.error("caption error:", err?.message || err);
        const status = Number(err?.status) || 500;
        return res.status(status).json(buildErrorPayload("图生文失败（caption provider）", err));
    }
});

// --- 预览：只组装提示词与输入图，不调用任何模型，用于确认“到底送了什么” ---
app.post("/api/generate/preview", async (req, res) => {
    try {
        const { sketch, prompt, content, style, negative, options, mode = "generate" } = req.body || {};
        if (!sketch) {
            return res.status(400).json({ success: false, error: "缺少草图" });
        }
        const { positivePrompt, negativePrompt } = await previewGenerationInput({ sketch,
            prompt: prompt || "",
            style,
            negative: negative || "",
            mode,
            content: content || "", options
        });
        return res.json({
            success: true,
            input_image: sketch,
            prompt: positivePrompt,
            negative: negativePrompt,
            model: process.env.SILICONFLOW_IMAGE_EDIT_MODEL || "Qwen/Qwen-Image-Edit-2509",
            mode,
            content: content || "",
            style: style || ""
        });
    } catch (err) {
        return res.status(Number(err?.status) || 500).json({ success: false, error: err?.message || "预览失败" });
    }
});

// --- 普通（非流式）生图接口，向后兼容 ---
app.post("/api/generate", async (req, res) => {
    try {
        const { sketch, prompt, content, style, negative, options } = req.body || {};
        const result = await runGenerationPipeline({
            sketch, prompt, content, style, negative, options, mode: "generate"
        });
        return res.json({
            success: true,
            image: result.image,
            image_url: result.imageUrl,
            image_materialized: result.imageMaterialized,
            image_warning: result.imageWarning,
            prompt_used: result.finalPrompt,
            caption: result.caption
        });
    } catch (err) {
        console.error("generate error:", err?.message || err);
        const status = Number(err?.status) || 500;
        return res.status(status).json(buildErrorPayload("生成失败，请检查 API 配置", err));
    }
});

app.post("/api/enhance", async (req, res) => {
    try {
        const { sketch, prompt, content, style, negative, options } = req.body || {};
        const result = await runGenerationPipeline({
            sketch, prompt, content, style, negative, options, mode: "enhance"
        });
        return res.json({
            success: true,
            image: result.image,
            image_url: result.imageUrl,
            image_materialized: result.imageMaterialized,
            image_warning: result.imageWarning,
            prompt_used: result.finalPrompt,
            caption: result.caption
        });
    } catch (err) {
        console.error("enhance error:", err?.message || err);
        const status = Number(err?.status) || 500;
        return res.status(status).json(buildErrorPayload("补全失败，请检查 API 配置", err));
    }
});

// --- SSE 流式生图接口（实时进度推送）---
function sseHandler(mode) {
    return async (req, res) => {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const send = (data) => {
            if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            }
        };

        const { sketch, prompt, content, style, negative, options } = req.body || {};

        try {
            const result = await runGenerationPipeline({
                sketch, prompt, content, style, negative, options,
                mode,
                onProgress: send
            });
            send({
                stage: "done",
                image: result.image,
                image_url: result.imageUrl,
                image_materialized: result.imageMaterialized,
                image_warning: result.imageWarning,
                prompt_used: result.finalPrompt,
                caption: result.caption
            });
        } catch (err) {
            console.error(`[${mode}/stream] error:`, err?.message || err);
            send({
                stage: "error",
                error: err?.message || "生成失败",
                detail: typeof err?.detail === "string"
                    ? err.detail
                    : err?.detail
                    ? JSON.stringify(err.detail)
                    : undefined
            });
        }

        if (!res.writableEnded) res.end();
    };
}

app.post("/api/generate/stream", sseHandler("generate"));
app.post("/api/enhance/stream", sseHandler("enhance"));

// --- 构图守门（结构稳定性）流式接口 ---
async function materializeOutput(out) {
    let image = out?.imageDataUrl || out?.imageUrl || "";
    if (image && !/^data:image\//i.test(image)) {
        try {
            image = await imageUrlToDataUrl(image);
        } catch (_) {
            // 保底：仍然返回可展示地址，结构度量会在下游明确报错。
        }
    }
    return { image, imageUrl: out?.imageUrl || null };
}

app.post("/api/generate/structure/stream", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (data) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const { sketch, prompt, content, style, negative, options } = req.body || {};
    if (!sketch) {
        send({ stage: "error", error: "缺少原作图片" });
        return res.end();
    }

    try {
        const layeredCalligraphy = style === "calligraphy" && options?.layered !== false;
        if (!layeredCalligraphy) ensureSiliconFlowApiKey();
        const result = await runStructurePipeline({
            sketch,
            prompt,
            content,
            style,
            negative,
            options: options || {},
            onProgress: send,
            generate: async ({ prompt: builtPrompt, negative: builtNegative, seed }) => {
                const out = await generateWithSiliconFlow({
                    image: sketch,
                    prompt: builtPrompt,
                    options: { seed, negative_prompt: builtNegative }
                });
                return materializeOutput(out);
            },
            repair: async ({ image, instruction }) => {
                const repairPrompt = [
                    "只修改需要修正的部分，其余像素、构图与主体保持不变，不新增任何对象。",
                    `修正要求：${instruction}`,
                    "输出必须与原作同画幅、同构图。"
                ].join("\n");
                const out = await generateWithSiliconFlow({
                    image,
                    prompt: repairPrompt,
                    options: { negative_prompt: DEFAULT_NEGATIVE }
                });
                return materializeOutput(out);
            }
        });
        if (!result?.chosen) {
            send({ stage: "error", error: "生成结束但没有可用候选" });
        }
    } catch (err) {
        console.error("[structure/stream] error:", err?.message || err);
        send({
            stage: "error",
            error: err?.message || "结构守门生成失败",
            detail: typeof err?.detail === "string"
                ? err.detail
                : err?.detail
                ? JSON.stringify(err.detail)
                : undefined
        });
    }

    if (!res.writableEnded) res.end();
});

// ==================== AI Video Pipeline ====================

const videoTasks = new Map();
const VIDEO_TASKS_PATH = path.join(DATA_DIR, "wan-video-tasks.json");
const VIDEO_POLL_INTERVAL_MS = envNumber("DASHSCOPE_VIDEO_PROVIDER_POLL_INTERVAL_MS", 15000);

async function loadVideoTasks() {
    try {
        const raw = await fs.readFile(VIDEO_TASKS_PATH, "utf8");
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
            for (const item of items) {
                if (item?.id) videoTasks.set(item.id, item);
            }
        }
    } catch (err) {
        if (err?.code !== "ENOENT") {
            console.warn("[wan-video] failed to load task store:", err?.message || err);
        }
    }
}

await loadVideoTasks();

async function saveVideoTasks() {
    await fs.mkdir(path.dirname(VIDEO_TASKS_PATH), { recursive: true });
    await fs.writeFile(
        VIDEO_TASKS_PATH,
        JSON.stringify([...videoTasks.values()], null, 2),
        "utf8"
    );
}

function hashVideoRequest({ image, prompt, negative, options }) {
    return createHash("sha256")
        .update(String(image || ""))
        .update("\n")
        .update(String(prompt || ""))
        .update("\n")
        .update(String(negative || ""))
        .update("\n")
        .update(JSON.stringify(options || {}))
        .digest("hex");
}

function getVideoOwner(req) {
    if (req.session?.user?.username) return req.session.user.username;
    req.session.videoOwner ||= randomUUID();
    return req.session.videoOwner;
}

function isActiveVideoTask(task) {
    return task && ["queued", "running"].includes(task.status);
}

function publicVideoPath(taskId) {
    return path.resolve(__dirname, "..", PUBLIC_DIR, "uploads", "videos", `${taskId}.mp4`);
}

function publicVideoUrl(taskId) {
    return `/uploads/videos/${taskId}.mp4`;
}

function serializeVideoTask(task) {
    return {
        taskId: task.id,
        provider: "dashscope",
        model: task.model,
        status: task.status,
        stage: task.stage,
        progress: task.progress,
        providerTaskId: task.providerTaskId,
        providerStatus: task.providerStatus,
        requestId: task.requestId || null,
        videoUrl: task.localVideoUrl || null,
        remoteVideoUrl: task.remoteVideoUrl || null,
        error: task.error || null,
        errorCode: task.errorCode || null,
        promptUsed: task.promptUsed || "",
        parameters: task.parameters || {},
        story: task.story || null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
    };
}

function updateVideoTask(task, patch) {
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
}

async function refreshVideoTask(task) {
    if (!task || !task.providerTaskId) return task;
    if (["failed", "canceled"].includes(task.status)) return task;
    if (task.status === "succeeded" && task.localVideoUrl) return task;
    if (task.remoteVideoUrl && !task.localVideoUrl) {
        try {
            const targetPath = publicVideoPath(task.id);
            const downloaded = await downloadDashScopeVideo(task.remoteVideoUrl, targetPath);
            const validated = await validateMp4File(downloaded.filePath);
            updateVideoTask(task, {
                status: "succeeded",
                localVideoPath: downloaded.filePath,
                localVideoUrl: publicVideoUrl(task.id),
                fileSize: validated.fileSize,
                stage: "done",
                progress: 100,
                error: null,
                errorCode: null
            });
            await saveVideoTasks();
        } catch (err) {
            updateVideoTask(task, {
                status: "running",
                stage: "download_retry",
                errorCode: err?.errorCode || "WAN_VIDEO_DOWNLOAD_ERROR",
                error: err?.safeErrorMessage || err?.message || "DashScope task succeeded but video download failed"
            });
            await saveVideoTasks();
        }
        return task;
    }

    const now = Date.now();
    if (task.lastProviderPollAt && now - Number(task.lastProviderPollAt) < VIDEO_POLL_INTERVAL_MS) {
        return task;
    }

    updateVideoTask(task, {
        lastProviderPollAt: now,
        stage: task.status === "queued" ? "polling" : task.stage
    });

    try {
        const providerTask = await getDashScopeWanTask(task.providerTaskId);
        const status = providerTask.projectStatus;
        const patch = {
            providerStatus: providerTask.providerStatus,
            status,
            requestId: providerTask.requestId || task.requestId,
            errorCode: providerTask.errorCode || null,
            error: providerTask.safeErrorMessage || null,
            remoteVideoUrl: providerTask.videoUrl || task.remoteVideoUrl,
            progress: status === "running" ? 50 : status === "queued" ? 20 : status === "succeeded" ? 100 : 0,
            stage: status
        };

        if (providerTask.providerStatus === "CANCELED") {
            patch.status = "canceled";
            patch.stage = "canceled";
            patch.error = providerTask.safeErrorMessage || "DashScope task was canceled";
        }

        updateVideoTask(task, patch);

        if (task.status === "succeeded") {
            if (!task.remoteVideoUrl) {
                updateVideoTask(task, {
                    status: "failed",
                    stage: "error",
                    errorCode: "MISSING_VIDEO_URL",
                    error: "DashScope task succeeded but no video URL was returned"
                });
            } else if (!task.localVideoUrl) {
                const targetPath = publicVideoPath(task.id);
                const downloaded = await downloadDashScopeVideo(task.remoteVideoUrl, targetPath);
                const validated = await validateMp4File(downloaded.filePath);
                updateVideoTask(task, {
                    localVideoPath: downloaded.filePath,
                    localVideoUrl: publicVideoUrl(task.id),
                    fileSize: validated.fileSize,
                    stage: "done",
                    progress: 100,
                    error: null,
                    errorCode: null
                });
            }
        }
    } catch (err) {
        updateVideoTask(task, {
            status: task.remoteVideoUrl || Number(err?.status) >= 500 ? (task.remoteVideoUrl ? "running" : task.status) : "failed",
            stage: task.remoteVideoUrl ? "download_retry" : "query_retry",
            requestId: err?.requestId || task.requestId || null,
            errorCode: err?.errorCode || "WAN_TASK_QUERY_ERROR",
            error: err?.safeErrorMessage || err?.message || "DashScope task query failed"
        });
    }

    await saveVideoTasks();
    return task;
}

app.get("/api/videos/motifs", (_req, res) => {
    return res.json({ success: true, motifs: listMotifs() });
});

app.post("/api/videos/story/plan", (req, res) => {
    try {
        const { motif_id, duration, caption, wish } = req.body || {};
        const plan = planStory({ motifId: motif_id, duration, caption, wish });
        return res.json({ success: true, plan });
    } catch (err) {
        console.error("[video-story/plan] error:", err?.message || err);
        return res.status(Math.floor(Number(err?.status) || 500)).json({
            success: false,
            error: err?.message || "叙事脚本生成失败"
        });
    }
});

app.post("/api/videos/story/storyboard", async (req, res) => {
    try {
        const { image, motif_id, duration } = req.body || {};
        if (!image) return res.status(400).json({ success: false, error: "缺少首帧图片" });
        const plan = planStory({ motifId: motif_id, duration });
        const storyboard = await renderStoryboard({ image, plan });
        return res.json({ success: true, plan, image: storyboard });
    } catch (err) {
        console.error("[video-story/storyboard] error:", err?.message || err);
        return res.status(500).json({ success: false, error: err?.message || "分镜卡生成失败" });
    }
});

app.post("/api/videos/storyboards", async (req, res) => {
    try {
        const result = await createStoryboards(req.body || {});
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(Number(error.status) || 502).json({
            success: false,
            error: error.name === "TimeoutError" ? "故事构思等待超时，请稍后重试。" : error.message || "故事构思暂未完成，请重试。"
        });
    }
});

app.post("/api/videos/image-to-video", async (req, res) => {
    const { image, prompt, negative, options, story } = req.body || {};

    let storyPlan = null;
    if (story?.motif_id) {
        try {
            storyPlan = planStory({
                motifId: story.motif_id,
                duration: story.duration ?? options?.duration,
                caption: story.caption,
                wish: story.wish
            });
        } catch (err) {
            return res.status(400).json({ success: false, error: err?.message || "叙事脚本生成失败" });
        }
    }

    const videoMode = sanitizeWanVideoMode(
        storyPlan ? (storyPlan.duration > 5 ? "long" : "short") : (options?.video_mode || options?.duration_mode),
        storyPlan?.duration ?? options?.duration
    );
    const safeOptions = {
        ...options,
        video_mode: videoMode,
        duration: storyPlan
            ? sanitizeWanDurationForMode(storyPlan.duration, videoMode)
            : sanitizeWanDurationForMode(
                options?.duration,
                videoMode,
                videoMode === "long" ? 10 : 5
            ),
        resolution: options?.resolution ?? "720P",
        audio: storyPlan ? true : Boolean(options?.audio),
        watermark: Boolean(options?.watermark),
        shot_type: "single",
        raw_prompt: storyPlan?.prompt || "",
        scene: storyPlan ? "story" : (options?.scene || "still"),
        camera: storyPlan ? "story" : (options?.camera || "fixed"),
        motion_strength: storyPlan ? "gentle" : (options?.motion_strength || "subtle")
    };

    try {
        validateWanVideoRequest({ image, options: safeOptions });
        const owner = getVideoOwner(req);
        const requestHash = hashVideoRequest({
            image,
            prompt: storyPlan?.prompt || prompt,
            negative: storyPlan?.negative || negative,
            options: safeOptions
        });
        const activeTask = [...videoTasks.values()].find(task => task.owner === owner && isActiveVideoTask(task));
        if (activeTask) {
            if (activeTask.requestHash === requestHash) {
                return res.json({ success: true, duplicate: true, task: serializeVideoTask(activeTask) });
            }
            return res.status(409).json({
                success: false,
                error: "已有图生视频任务正在生成，请等待当前任务完成后再创建新任务。",
                task: serializeVideoTask(activeTask)
            });
        }

        const created = await createDashScopeWanTask({
            image,
            prompt: storyPlan ? "" : prompt,
            negative: storyPlan?.negative || negative,
            options: safeOptions
        });
        const now = new Date().toISOString();
        const task = {
            id: randomUUID(),
            owner,
            requestHash,
            provider: "dashscope",
            model: created.model || getDashScopeConfig().model,
            status: created.projectStatus === "succeeded" ? "running" : created.projectStatus,
            stage: "created",
            progress: 10,
            providerTaskId: created.providerTaskId,
            providerStatus: created.providerStatus,
            requestId: created.requestId || null,
            remoteVideoUrl: null,
            localVideoUrl: null,
            localVideoPath: null,
            error: null,
            errorCode: null,
            promptUsed: created.promptUsed,
            negativeUsed: created.negativeUsed,
            parameters: {
                ...created.parameters,
                video_mode: videoMode,
                scene: safeOptions.scene,
                camera: safeOptions.camera,
                motion_strength: safeOptions.motion_strength
            },
            story: storyPlan
                ? {
                    motif_id: storyPlan.motif_id,
                    label: storyPlan.label,
                    meaning: storyPlan.meaning,
                    duration: storyPlan.duration,
                    beats: storyPlan.beats,
                    audio: storyPlan.audio
                }
                : null,
            createdAt: now,
            updatedAt: now,
            lastProviderPollAt: 0
        };
        videoTasks.set(task.id, task);
        await saveVideoTasks();
        return res.json({ success: true, task: serializeVideoTask(task) });
    } catch (err) {
        console.error("[wan-video/create] error:", err?.message || err);
        const status = Number(err?.status) || 500;
        return res.status(status).json({
            success: false,
            error: err?.safeErrorMessage || err?.message || "DashScope Wan task create failed",
            detail: typeof err?.detail === "string" ? err.detail : undefined,
            request_id: err?.requestId || null,
            error_code: err?.errorCode || null
        });
    }
});

app.get("/api/videos/tasks/:taskId", async (req, res) => {
    const taskId = String(req.params.taskId || "").trim();
    const task = videoTasks.get(taskId);
    if (!task) return res.status(404).json({ success: false, error: "视频任务不存在或已过期" });
    if (!req.session.user || task.owner !== req.session.user.username) return res.status(403).json({ success: false, error: "无权访问此视频任务" });

    try {
        const refreshed = await refreshVideoTask(task);
        return res.json({ success: true, task: serializeVideoTask(refreshed) });
    } catch (err) {
        console.error("[wan-video/task] error:", err?.message || err);
        const status = Number(err?.status) || 500;
        return res.status(status).json({
            success: false,
            error: err?.safeErrorMessage || err?.message || "DashScope Wan task query failed",
            request_id: err?.requestId || null,
            error_code: err?.errorCode || null
        });
    }
});

// ==================== Agent Chat ====================

const agentDrawTasks = new Map();

function pruneAgentDrawTasks() {
    const ttlMs = envNumber("AGENT_DRAW_TASK_TTL_MS", 2 * 60 * 60 * 1000);
    const cutoff = Date.now() - ttlMs;
    for (const [taskId, task] of agentDrawTasks.entries()) {
        if (new Date(task.updatedAt || task.createdAt || 0).getTime() < cutoff) {
            agentDrawTasks.delete(taskId);
        }
    }
}

function sanitizeAgentError(err) {
    return String(err?.message || "云端作画暂不可用")
        .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***")
        .replace(/sk-[A-Za-z0-9._-]+/g, "sk-***")
        .slice(0, 260);
}

function normalizeAgentImageOutput(out) {
    const image = String(out?.imageDataUrl || out?.imageUrl || "").trim();
    if (!image) return "";
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(image)) return image;
    if (/^https?:\/\//i.test(image)) {
        return `/api/image-proxy?url=${encodeURIComponent(image)}`;
    }
    return image;
}

function serializeAgentDrawTask(task) {
    return {
        task_id: task.id,
        status: task.status,
        stage: task.stage,
        image: task.image || null,
        image_url: task.imageUrl || null,
        prompt_used: task.promptUsed,
        error: task.error || null,
        created_at: task.createdAt,
        updated_at: task.updatedAt
    };
}

function updateAgentDrawTask(task, patch) {
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
}

function startAgentDrawTask({ promptUsed, sourceText, owner }) {
    pruneAgentDrawTasks();
    const now = new Date().toISOString();
    const task = {
        id: randomUUID(),
        status: "queued",
        stage: "queued",
        image: null,
        imageUrl: null,
        promptUsed,
        sourceText: String(sourceText || "").slice(0, 500),
        owner,
        error: null,
        createdAt: now,
        updatedAt: now
    };
    agentDrawTasks.set(task.id, task);

    Promise.resolve()
        .then(async () => {
            updateAgentDrawTask(task, { status: "running", stage: "generating" });
            ensureSiliconFlowApiKey();
            const agentOptions = {
                negative_prompt: DEFAULT_NEGATIVE,
                model:
                    process.env.SILICONFLOW_AGENT_IMAGE_MODEL ||
                    process.env.SILICONFLOW_IMAGE_MODEL ||
                    "Tongyi-MAI/Z-Image-Turbo",
                num_inference_steps: envNumber("SILICONFLOW_AGENT_IMAGE_STEPS", 8),
                guidance: envNumber("SILICONFLOW_AGENT_GUIDANCE", 3.8)
            };
            const out = await generateWithSiliconFlow({
                prompt: promptUsed,
                size: process.env.SILICONFLOW_AGENT_IMAGE_SIZE || process.env.SILICONFLOW_IMAGE_SIZE || "1024x1024",
                options: agentOptions
            });
            const image = normalizeAgentImageOutput(out);
            updateAgentDrawTask(task, {
                status: "succeeded",
                stage: "done",
                image,
                imageUrl: out.imageUrl || null,
                error: null
            });
        })
        .catch((err) => {
            console.error("[agent] background draw failed:", err?.message || err);
            updateAgentDrawTask(task, {
                status: "failed",
                stage: "error",
                error: sanitizeAgentError(err)
            });
        });

    return task;
}

app.post("/api/agent/chat", async (req, res) => {
    try {
        const { messages } = req.body || {};
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ success: false, error: "缺少会话消息内容" });
        }
        const safeMessages = messages
            .filter(message => message && ["user", "assistant"].includes(message.role))
            .map(message => ({
                role: message.role,
                content: String(message.content || "").slice(0, 4000)
            }))
            .filter(message => message.content.trim());

        if (!safeMessages.length) {
            return res.status(400).json({ success: false, error: "缺少有效会话消息内容" });
        }

        const latestUserText = getLatestUserText(safeMessages);
        const drawRequested = isDrawRequest(latestUserText);
        const localAnswer = drawRequested ? "" : getLocalHeritageAnswer(latestUserText);
        let result;
        let image = null;
        let promptUsed = null;
        let drawTask = null;

        console.log("[agent] Chat request received. Messages count =", safeMessages.length, "draw =", drawRequested);
        if ((drawRequested || !localAnswer) && !paidGuard(req, res)) return;
        if (drawRequested) {
            promptUsed = buildDrawPromptFromUser(latestUserText);
            drawTask = startAgentDrawTask({ promptUsed, sourceText: latestUserText, owner: req.session.user.username });
            result = {
                success: true,
                reply: buildDrawSummaryFromUser(latestUserText),
                model_used: "local-draw-prompt",
                is_fallback: true
            };
        } else if (localAnswer) {
            result = {
                success: true,
                reply: localAnswer,
                model_used: "local-heritage-knowledge",
                is_fallback: true
            };
        } else {
            try {
                result = await chatWithSiliconFlow({ messages: safeMessages, drawRequested });
            } catch (err) {
                console.warn("[agent] chat model fallback:", err?.message || err);
                result = {
                    success: true,
                    reply: buildFallbackHeritageAnswer(latestUserText),
                    model_used: "local-fallback",
                    is_fallback: true
                };
            }
        }

        const parsedReply = cleanAgentReply(result.reply || "", { drawRequested });
        let cleanText = parsedReply.text || (drawRequested ? "小生已整理好画意。" : buildFallbackHeritageAnswer(latestUserText));

        if ((drawRequested || !localAnswer) && !paidGuard(req, res)) return;
        if (drawRequested) {
            promptUsed = parsedReply.drawPrompt || promptUsed || buildDrawPromptFromUser(latestUserText);
            cleanText = [
                cleanText,
                "",
                "我已把画意整理成稳定的生成提示词，正在后台作画；完成后会自动补到这条消息里。"
            ].join("\n");
        }

        return res.json({
            success: true,
            text: cleanText,
            image,
            prompt_used: promptUsed,
            draw_task_id: drawTask?.id || null,
            draw_status: drawTask?.status || null,
            model_used: result.model_used,
            is_fallback: result.is_fallback
        });
    } catch (err) {
        console.error("Agent chat error:", err?.message || err);
        return res.status(500).json({
            success: false,
            error: "AI 书童会话服务暂不可用",
            detail: err?.message
        });
    }
});

app.get("/api/agent/draw/:taskId", (req, res) => {
    pruneAgentDrawTasks();
    const taskId = String(req.params.taskId || "").trim();
    const task = agentDrawTasks.get(taskId);
    if (!task) {
        return res.status(404).json({ success: false, error: "书童作画任务不存在或已过期" });
    }
    if (!req.session.user || task.owner !== req.session.user.username) return res.status(403).json({ success: false, error: "无权访问此绘图任务" });
    return res.json({ success: true, task: serializeAgentDrawTask(task) });
});

// ==================== Start ====================

if (SPA_ROOT) {
    // Vue Router 使用 history 模式，刷新 /creation 这类地址时回退到 index.html。
    app.get(/^\/(?!api\/|uploads\/|user_images\/|assets\/|image\/).*/, (req, res, next) => {
        if (req.method !== "GET") return next();
        return res.sendFile(path.join(SPA_ROOT, "index.html"));
    });
}

app.use((error, _req, res, _next) => {
    console.error("[request]", error?.code || error?.name || "error");
    if (res.headersSent) return res.end();
    res.status(Number(error.status) || 500).json({ success: false, error: Number(error.status) === 400 ? "请求参数无效" : "请求处理失败，请稍后再试" });
});
app.listen(PORT, process.env.HOST || "127.0.0.1", () => {
    console.log(`Server running: http://localhost:${PORT}`);
    if (SPA_ROOT) console.log(`Web UI: http://localhost:${PORT} (SPA_DIR=${SPA_DIR})`);
});
