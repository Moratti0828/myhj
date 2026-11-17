import fetch from "node-fetch";
import { getSiliconFlowApiKey, getSiliconFlowBaseEndpoint, getSiliconFlowHeaders } from "./siliconflow_config.js";
import { buildVideoPrompt } from "../prompt/buildVideoPrompt.js";

const DEFAULT_VIDEO_MODEL = "Wan-AI/Wan2.2-I2V-A14B";

const VIDEO_PROFILES = {
    balanced: {
        maxWaitMs: 90000,
        intervalMs: 5000,
        duration: 5,
        resolution: "720P",
        message: "快速预览：720P / 5 秒，优先减少等待时间"
    },
    premium: {
        maxWaitMs: 180000,
        intervalMs: 6000,
        duration: 5,
        resolution: "1080P",
        message: "高清成片：1080P / 5 秒，兼顾画质与等待时间"
    },
    cinematic: {
        maxWaitMs: 360000,
        intervalMs: 8000,
        duration: 10,
        resolution: "1080P",
        message: "展映精修：1080P / 10 秒，队列可能明显更久"
    }
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseJsonSafely(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function buildProviderError({ message, status = 500, detail }) {
    const err = new Error(message);
    err.status = status;
    err.detail = detail;
    return err;
}

function getBaseEndpoint() {
    return getSiliconFlowBaseEndpoint();
}

function getApiKey() {
    return getSiliconFlowApiKey("SiliconFlow video generation");
}

function isValidImageInput(image) {
    const value = String(image || "").trim();
    return /^https?:\/\//i.test(value) || /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

function sanitizeProfile(value) {
    const profile = String(value || process.env.SILICONFLOW_VIDEO_PROFILE || "balanced").trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(VIDEO_PROFILES, profile)) {
        throw buildProviderError({
            message: "Invalid video profile",
            status: 400,
            detail: "profile must be balanced, premium, or cinematic"
        });
    }
    return profile;
}

function sanitizeDuration(value) {
    const fallback = Number(process.env.SILICONFLOW_VIDEO_DEFAULT_DURATION || 5);
    const duration = Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
    if (duration < 2 || duration > 15) {
        throw buildProviderError({
            message: "Invalid video duration",
            status: 400,
            detail: "duration must be an integer between 2 and 15 seconds"
        });
    }
    return duration;
}

function sanitizeImageSize(value) {
    const resolution = String(value || process.env.SILICONFLOW_VIDEO_IMAGE_SIZE || "1280x720").trim();
    const map = {
        "720P": "1280x720",
        "1080P": "1280x720",
        "16:9": "1280x720",
        "9:16": "720x1280",
        "1:1": "960x960"
    };
    const normalized = map[resolution.toUpperCase()] || resolution;
    if (!["1280x720", "720x1280", "960x960"].includes(normalized)) {
        throw buildProviderError({
            message: "Invalid video image_size",
            status: 400,
            detail: "image_size must be 1280x720, 720x1280, or 960x960"
        });
    }
    return normalized;
}

function sanitizeResolution(value) {
    const resolution = String(value || process.env.SILICONFLOW_VIDEO_RESOLUTION || "1080P").trim().toUpperCase();
    if (!["720P", "1080P"].includes(resolution)) {
        throw buildProviderError({
            message: "Invalid video resolution",
            status: 400,
            detail: "resolution must be 720P or 1080P"
        });
    }
    return resolution;
}

function sanitizeSeed(value) {
    if (value === undefined || value === null || value === "") return undefined;
    const seed = Number(value);
    if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) {
        throw buildProviderError({
            message: "Invalid video seed",
            status: 400,
            detail: "seed must be an integer between 0 and 2147483647"
        });
    }
    return seed;
}

function envNumber(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function fetchWithTimeout(url, options, timeoutMs, serviceName) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err?.name === "AbortError") {
            throw buildProviderError({
                message: `${serviceName} 请求超时`,
                status: 504,
                detail: `超过 ${timeoutMs}ms 未返回。视频任务可能仍在第三方侧排队，请稍后重试。`
            });
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function extractRequestId(payload) {
    return payload?.requestId ||
        payload?.request_id ||
        payload?.taskId ||
        payload?.task_id ||
        payload?.id ||
        payload?.data?.requestId ||
        payload?.data?.request_id ||
        payload?.data?.taskId ||
        payload?.data?.task_id;
}

function extractVideoUrl(payload) {
    const direct = payload?.video_url ||
        payload?.url ||
        payload?.videoUrl ||
        payload?.results?.video_url ||
        payload?.results?.url ||
        payload?.results?.videoUrl ||
        payload?.result?.video_url ||
        payload?.result?.url ||
        payload?.data?.video_url ||
        payload?.data?.url ||
        payload?.data?.videoUrl;
    if (direct) return direct;
    if (Array.isArray(payload?.results?.videos)) {
        const hit = payload.results.videos.find(item => item?.url || item?.video_url);
        if (hit) return hit.url || hit.video_url;
    }
    if (Array.isArray(payload?.videos)) {
        const hit = payload.videos.find(item => item?.url || item?.video_url);
        if (hit) return hit.url || hit.video_url;
    }
    if (Array.isArray(payload?.data?.videos)) {
        const hit = payload.data.videos.find(item => item?.url || item?.video_url || item?.videoUrl);
        if (hit) return hit.url || hit.video_url || hit.videoUrl;
    }
    return null;
}

function extractFailureReason(payload) {
    return payload?.reason ||
        payload?.message ||
        payload?.msg ||
        payload?.error ||
        payload?.error_message ||
        payload?.data?.reason ||
        payload?.data?.message ||
        payload?.data?.msg ||
        payload?.data?.error ||
        payload?.data?.error_message ||
        payload?.result?.reason ||
        payload?.result?.message ||
        "";
}

export function validateSiliconFlowVideoRequest({ image, options = {} } = {}) {
    getApiKey();
    if (!isValidImageInput(image)) {
        throw buildProviderError({
            message: "Invalid video first frame image",
            status: 400,
            detail: "image must be an http(s) URL or a data:image/...;base64 data URL"
        });
    }
    sanitizeProfile(options?.profile);
    sanitizeDuration(options?.duration);
    sanitizeResolution(options?.resolution);
    sanitizeImageSize(options?.image_size || options?.resolution);
    sanitizeSeed(options?.seed);
}

export async function generateVideoWithSiliconFlow({
    image,
    prompt = "",
    negative = "",
    options = {},
    onProgress = null
}) {
    validateSiliconFlowVideoRequest({ image, options });

    getApiKey();
    const baseEndpoint = getBaseEndpoint();
    const model = process.env.SILICONFLOW_VIDEO_MODEL || DEFAULT_VIDEO_MODEL;
    const profileName = sanitizeProfile(options?.profile);
    const profile = VIDEO_PROFILES[profileName];
    const maxWaitMs = envNumber(
        `SILICONFLOW_VIDEO_${profileName.toUpperCase()}_MAX_WAIT_MS`,
        envNumber("SILICONFLOW_VIDEO_MAX_WAIT_MS", profile.maxWaitMs)
    );
    const intervalMs = envNumber(
        `SILICONFLOW_VIDEO_${profileName.toUpperCase()}_POLL_INTERVAL_MS`,
        envNumber("SILICONFLOW_VIDEO_POLL_INTERVAL_MS", profile.intervalMs)
    );
    const requestTimeoutMs = envNumber("SILICONFLOW_VIDEO_REQUEST_TIMEOUT_MS", 30000);
    const duration = sanitizeDuration(options?.duration ?? profile.duration);
    const resolution = sanitizeResolution(options?.resolution ?? profile.resolution);

    const builtPrompt = await buildVideoPrompt({
        image,
        userPrompt: prompt,
        negativePrompt: negative,
        options: {
            ...options,
            image_size: sanitizeImageSize(options?.image_size || options?.resolution)
        },
        onProgress
    });
    const finalPrompt = builtPrompt.prompt ||
        "Chinese ink painting comes alive, slow drifting mist, gentle camera push-in, subtle ink diffusion, elegant traditional atmosphere";

    const submitBody = {
        model,
        prompt: finalPrompt.slice(0, 5000),
        image: String(image).trim(),
        image_size: sanitizeImageSize(options?.image_size || options?.resolution),
        negative_prompt: String(builtPrompt.negative || negative || "").trim().slice(0, 1000)
    };

    const seed = sanitizeSeed(options?.seed);
    if (seed !== undefined) submitBody.seed = seed;

    if (onProgress) {
        onProgress({
            stage: "submit",
            profile: profileName,
            prompt_source: builtPrompt.source,
            message: `正在提交硅基流动图生视频任务，${profile.message}...`
        });
    }

    const submitResp = await fetchWithTimeout(
        `${baseEndpoint}/video/submit`,
        {
            method: "POST",
            headers: getSiliconFlowHeaders("SiliconFlow video generation"),
            body: JSON.stringify(submitBody)
        },
        requestTimeoutMs,
        "硅基流动视频提交"
    );

    const submitRaw = await submitResp.text();
    const submitData = parseJsonSafely(submitRaw);
    if (!submitResp.ok) {
        throw buildProviderError({
            message: `SiliconFlow video submit failed: HTTP ${submitResp.status}`,
            status: submitResp.status,
            detail: submitRaw
        });
    }
    const requestId = extractRequestId(submitData);
    if (!requestId) {
        throw buildProviderError({
            message: "SiliconFlow video response missing requestId",
            status: 502,
            detail: submitRaw
        });
    }

    if (onProgress) {
        onProgress({
            stage: "polling",
            task_id: requestId,
            profile: profileName,
            message: "视频任务已提交，正在等待硅基流动处理..."
        });
    }

    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        await sleep(intervalMs);

        const pollResp = await fetchWithTimeout(
            `${baseEndpoint}/video/status`,
            {
                method: "POST",
                headers: getSiliconFlowHeaders("SiliconFlow video polling"),
                body: JSON.stringify({ requestId })
            },
            requestTimeoutMs,
            "硅基流动视频状态查询"
        );

        const pollRaw = await pollResp.text();
        const pollData = parseJsonSafely(pollRaw);
        if (!pollResp.ok) {
            throw buildProviderError({
                message: `SiliconFlow video status failed: HTTP ${pollResp.status}`,
                status: pollResp.status,
                detail: pollRaw
            });
        }

        const status = String(pollData?.status || pollData?.data?.status || pollData?.result?.status || "").trim();
        const statusKey = status.toLowerCase();
        const elapsed = Math.floor((Date.now() - start) / 1000);
        if (onProgress) {
            onProgress({
                stage: /progress|running|processing|generating/.test(statusKey)
                    ? "running"
                    : /queue|pending|waiting/.test(statusKey)
                    ? "queued"
                    : "polling",
                task_id: requestId,
                status,
                elapsed,
                profile: profileName,
                message: /progress|running|processing|generating/.test(statusKey)
                    ? `硅基流动视频生成中，已等待 ${elapsed}s`
                    : `硅基流动视频排队中，已等待 ${elapsed}s`
            });
        }

        if (/succeed|success|completed|complete|done/.test(statusKey)) {
            const videoUrl = extractVideoUrl(pollData);
            if (!videoUrl) {
                throw buildProviderError({
                    message: "SiliconFlow video succeeded but no video url was returned",
                    status: 502,
                    detail: pollRaw
                });
            }
            return {
                taskId: requestId,
                videoUrl,
                promptUsed: finalPrompt,
                usage: pollData?.results?.timings || {},
                raw: pollData
            };
        }

        if (/failed|failure|error|canceled|cancelled/.test(statusKey)) {
            const reason = extractFailureReason(pollData);
            throw buildProviderError({
                message: reason
                    ? `SiliconFlow video task failed: ${reason}`
                    : "SiliconFlow video task failed",
                status: 502,
                detail: pollRaw
            });
        }
    }

    throw buildProviderError({
        message: `SiliconFlow video timeout after ${maxWaitMs}ms. 当前任务仍在第三方队列或生成中，可改用“快速预览”或稍后重试。`,
        status: 504,
        detail: `requestId=${requestId}`
    });
}
