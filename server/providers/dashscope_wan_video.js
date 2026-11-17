import fetch from "node-fetch";
import { buildVideoDirection } from "../../shared/videoDirection.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const DASH_SCOPE_TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);
export const DASH_SCOPE_RUNNING_STATUSES = new Set(["PENDING", "RUNNING", "UNKNOWN"]);

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";
const DEFAULT_MODEL = "wan2.6-i2v-flash";
const DEFAULT_NEGATIVE =
    "低清晰度，模糊，抖动，闪烁，主体变形，字形扭曲，笔画漂移，纹样变形，新增字幕，额外标志";
const VIDEO_MODE_RANGES = {
    short: { min: 5, max: 5, fallback: 5 },
    long: { min: 6, max: 10, fallback: 8 }
};
const execFileAsync = promisify(execFile);

function buildProviderError({ message, status = 500, detail, requestId, errorCode, safeErrorMessage }) {
    const err = new Error(message);
    err.status = status;
    err.detail = detail;
    err.requestId = requestId;
    err.errorCode = errorCode;
    err.safeErrorMessage = safeErrorMessage;
    return err;
}

function envNumber(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sanitizeErrorText(value) {
    return String(value || "")
        .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***")
        .replace(/sk-[A-Za-z0-9._-]+/g, "sk-***")
        .slice(0, 1200);
}

async function fetchWithTimeout(url, options, timeoutMs, stage) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err?.name === "AbortError") {
            throw buildProviderError({
                message: `${stage} timeout`,
                status: 504,
                safeErrorMessage: `${stage} exceeded ${timeoutMs}ms`
            });
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

async function parseResponse(resp) {
    const raw = await resp.text();
    let data = null;
    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        data = null;
    }
    return { raw, data };
}

export function getDashScopeConfig() {
    const apiKey = String(process.env.DASHSCOPE_API_KEY || "").trim();
    if (!apiKey) {
        throw buildProviderError({
            message: "DashScope API key is not configured",
            status: 500,
            errorCode: "MISSING_DASHSCOPE_API_KEY",
            safeErrorMessage: "DASHSCOPE_API_KEY is missing or empty"
        });
    }
    return {
        apiKey,
        baseUrl: String(process.env.DASHSCOPE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
        model: process.env.DASHSCOPE_VIDEO_MODEL || DEFAULT_MODEL
    };
}

export function getDashScopeHeaders(apiKey) {
    return {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable"
    };
}

export function isValidVideoImageInput(image) {
    const value = String(image || "").trim();
    return /^https?:\/\//i.test(value) || /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

export function sanitizeWanDuration(value, fallback = 2) {
    const mode = sanitizeWanVideoMode(undefined, value);
    return sanitizeWanDurationForMode(value, mode, fallback);
}

export function sanitizeWanVideoMode(value, durationValue) {
    const mode = String(value || "").trim().toLowerCase();
    if (mode === "long" || mode === "story") return "long";
    if (mode === "short" || mode === "preview") return "short";
    const duration = Number(durationValue);
    return Number.isFinite(duration) && duration > VIDEO_MODE_RANGES.short.max ? "long" : "short";
}

export function sanitizeWanDurationForMode(value, mode = "short", fallback) {
    const videoMode = sanitizeWanVideoMode(mode, value);
    const range = VIDEO_MODE_RANGES[videoMode] || VIDEO_MODE_RANGES.short;
    const fallbackDuration = Number.isFinite(Number(fallback)) ? Number(fallback) : range.fallback;
    const duration = Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallbackDuration;
    return Math.max(range.min, Math.min(range.max, duration));
}

export function sanitizeWanResolution(value, fallback = "720P") {
    const resolution = String(value || fallback).trim().toUpperCase();
    return resolution === "1080P" ? "1080P" : "720P";
}

export function sanitizeWanShotType(value) {
    const shotType = String(value || "single").trim().toLowerCase();
    return shotType === "multi" ? "multi" : "single";
}

export function normalizeDashScopeStatus(status) {
    const value = String(status || "").trim().toUpperCase();
    if (!value) return "UNKNOWN";
    if (value === "SUCCEEDED" || value === "SUCCESS") return "SUCCEEDED";
    if (value === "FAILED" || value === "FAILURE" || value === "ERROR") return "FAILED";
    if (value === "CANCELED" || value === "CANCELLED") return "CANCELED";
    if (value === "PENDING" || value === "QUEUED") return "PENDING";
    if (value === "RUNNING" || value === "PROCESSING") return "RUNNING";
    return value;
}

export function mapDashScopeStatus(status) {
    const normalized = normalizeDashScopeStatus(status);
    if (normalized === "SUCCEEDED") return "succeeded";
    if (normalized === "FAILED" || normalized === "CANCELED") return "failed";
    if (normalized === "RUNNING") return "running";
    return "queued";
}

export function extractDashScopeTaskId(data) {
    return data?.output?.task_id || data?.task_id || data?.data?.task_id || null;
}

export function extractDashScopeTaskStatus(data) {
    return normalizeDashScopeStatus(
        data?.output?.task_status ||
        data?.task_status ||
        data?.data?.task_status ||
        data?.status
    );
}

export function extractDashScopeRequestId(data) {
    return data?.request_id || data?.requestId || data?.headers?.["x-request-id"] || null;
}

export function extractDashScopeErrorCode(data) {
    return data?.code || data?.error_code || data?.errorCode || data?.output?.code || null;
}

export function extractDashScopeErrorMessage(data) {
    return data?.message ||
        data?.error_message ||
        data?.errorMessage ||
        data?.output?.message ||
        data?.output?.task_metrics?.failed_reason ||
        "";
}

export function extractDashScopeVideoUrl(data) {
    return data?.output?.video_url ||
        data?.output?.url ||
        data?.output?.results?.video_url ||
        data?.output?.results?.url ||
        data?.output?.results?.[0]?.url ||
        data?.output?.results?.[0]?.video_url ||
        data?.video_url ||
        data?.url ||
        null;
}

export function buildWanPrompt(options = {}) {
    return buildVideoDirection(options);
}

export function buildWanNegative(negative = "") {
    return [DEFAULT_NEGATIVE, String(negative || "").trim()]
        .filter(Boolean)
        .join(", ")
        .slice(0, 500);
}

export function validateWanVideoRequest({ image, options = {} } = {}) {
    getDashScopeConfig();
    if (!isValidVideoImageInput(image)) {
        throw buildProviderError({
            message: "Invalid video first frame image",
            status: 400,
            errorCode: "INVALID_IMAGE_INPUT",
            safeErrorMessage: "image must be an http(s) URL or data:image base64 URL"
        });
    }
    const videoMode = sanitizeWanVideoMode(options?.video_mode || options?.duration_mode, options?.duration);
    sanitizeWanDurationForMode(options?.duration, videoMode);
    sanitizeWanResolution(options?.resolution);
    sanitizeWanShotType(options?.shot_type);
    if (options.seed !== undefined && (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 2147483647)) {
        throw buildProviderError({ message: "随机种子须为 0 到 2147483647 的整数", status: 400, errorCode: "INVALID_SEED" });
    }
}

export function createWanPayload({ image, prompt = "", negative = "", options = {} }) {
    const { model } = getDashScopeConfig();
    const videoMode = sanitizeWanVideoMode(options?.video_mode || options?.duration_mode, options?.duration);
    const duration = sanitizeWanDurationForMode(options?.duration, videoMode);
    const resolution = sanitizeWanResolution(options?.resolution, "720P");
    const shotType = sanitizeWanShotType(options?.shot_type);
    const promptUsed = String(options?.raw_prompt || "").trim()
        ? String(options.raw_prompt)
        : buildWanPrompt({
            prompt,
            scene: options?.scene,
            camera: options?.camera,
            motion_strength: options?.motion_strength,
            duration
        });
    return {
        model,
        input: {
            img_url: String(image).trim(),
            prompt: promptUsed,
            negative_prompt: buildWanNegative(negative)
        },
        parameters: {
            resolution,
            duration,
            audio: Boolean(options?.audio ?? false),
            watermark: Boolean(options?.watermark ?? false),
            shot_type: shotType,
            prompt_extend: options?.prompt_extend === true,
            ...(options?.seed !== undefined ? { seed: options.seed } : {})
        }
    };
}

export async function createDashScopeWanTask({ image, prompt = "", negative = "", options = {} }) {
    validateWanVideoRequest({ image, options });
    const { apiKey, baseUrl, model } = getDashScopeConfig();
    const requestTimeoutMs = envNumber("DASHSCOPE_VIDEO_REQUEST_TIMEOUT_MS", 30000);
    const payload = createWanPayload({ image, prompt, negative, options });
    const resp = await fetchWithTimeout(
        `${baseUrl}/services/aigc/video-generation/video-synthesis`,
        {
            method: "POST",
            headers: getDashScopeHeaders(apiKey),
            body: JSON.stringify(payload)
        },
        requestTimeoutMs,
        "DashScope Wan task create"
    );
    const { raw, data } = await parseResponse(resp);
    const requestId = extractDashScopeRequestId(data);
    const errorCode = extractDashScopeErrorCode(data);
    const extractedErrorMessage = extractDashScopeErrorMessage(data);
    const safeErrorMessage = extractedErrorMessage
        ? sanitizeErrorText(extractedErrorMessage)
        : resp.ok
        ? null
        : sanitizeErrorText(raw);
    if (!resp.ok) {
        throw buildProviderError({
            message: `DashScope Wan task create failed: HTTP ${resp.status}`,
            status: resp.status,
            detail: sanitizeErrorText(raw),
            requestId,
            errorCode,
            safeErrorMessage
        });
    }
    const providerTaskId = extractDashScopeTaskId(data);
    if (!providerTaskId) {
        throw buildProviderError({
            message: "DashScope Wan response missing task_id",
            status: 502,
            detail: sanitizeErrorText(raw),
            requestId,
            errorCode,
            safeErrorMessage
        });
    }
    return {
        providerTaskId,
        providerStatus: extractDashScopeTaskStatus(data),
        projectStatus: mapDashScopeStatus(extractDashScopeTaskStatus(data)),
        requestId,
        model,
        promptUsed: payload.input.prompt,
        negativeUsed: payload.input.negative_prompt,
        parameters: payload.parameters,
        raw: data
    };
}

export async function getDashScopeWanTask(providerTaskId) {
    const { apiKey, baseUrl } = getDashScopeConfig();
    const requestTimeoutMs = envNumber("DASHSCOPE_VIDEO_REQUEST_TIMEOUT_MS", 30000);
    const resp = await fetchWithTimeout(
        `${baseUrl}/tasks/${encodeURIComponent(providerTaskId)}`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            }
        },
        requestTimeoutMs,
        "DashScope Wan task query"
    );
    const { raw, data } = await parseResponse(resp);
    const requestId = extractDashScopeRequestId(data);
    const errorCode = extractDashScopeErrorCode(data);
    const extractedErrorMessage = extractDashScopeErrorMessage(data);
    const safeErrorMessage = extractedErrorMessage
        ? sanitizeErrorText(extractedErrorMessage)
        : resp.ok
        ? null
        : sanitizeErrorText(raw);
    if (!resp.ok) {
        throw buildProviderError({
            message: `DashScope Wan task query failed: HTTP ${resp.status}`,
            status: resp.status,
            detail: sanitizeErrorText(raw),
            requestId,
            errorCode,
            safeErrorMessage
        });
    }
    const providerStatus = extractDashScopeTaskStatus(data);
    return {
        providerTaskId,
        providerStatus,
        projectStatus: mapDashScopeStatus(providerStatus),
        requestId,
        errorCode,
        safeErrorMessage,
        videoUrl: extractDashScopeVideoUrl(data),
        raw: data
    };
}

export async function downloadDashScopeVideo(videoUrl, outputPath) {
    if (!/^https?:\/\//i.test(String(videoUrl || ""))) {
        throw buildProviderError({
            message: "DashScope Wan succeeded but returned an invalid video URL",
            status: 502,
            errorCode: "INVALID_VIDEO_URL",
            safeErrorMessage: "invalid video URL"
        });
    }
    const timeoutMs = envNumber("DASHSCOPE_VIDEO_DOWNLOAD_TIMEOUT_MS", 120000);
    const resp = await fetchWithTimeout(
        videoUrl,
        {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 MoyunHuajing/1.0",
                Accept: "video/mp4,video/*,*/*"
            }
        },
        timeoutMs,
        "DashScope Wan video download"
    );
    if (!resp.ok) {
        throw buildProviderError({
            message: `DashScope Wan video download failed: HTTP ${resp.status}`,
            status: resp.status,
            safeErrorMessage: `download HTTP ${resp.status}`
        });
    }
    const bytes = Buffer.from(await resp.arrayBuffer());
    validateMp4Buffer(bytes);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, bytes);
    return {
        filePath: outputPath,
        fileSize: bytes.length
    };
}

export function validateMp4Buffer(bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length <= 0) {
        throw buildProviderError({
            message: "Downloaded video is empty",
            status: 502,
            errorCode: "EMPTY_VIDEO",
            safeErrorMessage: "video size is zero"
        });
    }
    const header = bytes.subarray(0, Math.min(bytes.length, 64)).toString("latin1");
    if (!header.includes("ftyp")) {
        throw buildProviderError({
            message: "Downloaded video is not a valid MP4",
            status: 502,
            errorCode: "INVALID_MP4",
            safeErrorMessage: "MP4 ftyp header missing"
        });
    }
    return true;
}

function readMp4TopLevelBoxes(bytes) {
    const boxes = [];
    let offset = 0;

    while (offset + 8 <= bytes.length) {
        let size = bytes.readUInt32BE(offset);
        const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
        let headerSize = 8;

        if (size === 1) {
            if (offset + 16 > bytes.length) break;
            const bigSize = bytes.readBigUInt64BE(offset + 8);
            if (bigSize > BigInt(Number.MAX_SAFE_INTEGER)) break;
            size = Number(bigSize);
            headerSize = 16;
        } else if (size === 0) {
            size = bytes.length - offset;
        }

        if (!/^[a-zA-Z0-9 ]{4}$/.test(type) || size < headerSize || offset + size > bytes.length) {
            break;
        }

        boxes.push({ type, size });
        offset += size;
    }

    return boxes;
}

async function probeMp4WithFfprobe(filePath) {
    try {
        const { stdout } = await execFileAsync(
            "ffprobe",
            [
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_entries",
                "format=duration:stream=codec_type,codec_name,width,height",
                filePath
            ],
            { timeout: envNumber("DASHSCOPE_VIDEO_FFPROBE_TIMEOUT_MS", 30000) }
        );
        const data = JSON.parse(stdout || "{}");
        const streams = Array.isArray(data.streams) ? data.streams : [];
        const videoStream = streams.find(stream => stream?.codec_type === "video");
        const duration = Number(data?.format?.duration);

        if (!videoStream) {
            throw buildProviderError({
                message: "Downloaded MP4 has no video stream",
                status: 502,
                errorCode: "MP4_NO_VIDEO_STREAM",
                safeErrorMessage: "MP4 has no video stream"
            });
        }
        if (!Number.isFinite(duration) || duration <= 0) {
            throw buildProviderError({
                message: "Downloaded MP4 has invalid duration",
                status: 502,
                errorCode: "MP4_INVALID_DURATION",
                safeErrorMessage: "MP4 duration is not playable"
            });
        }

        return {
            ffprobeAvailable: true,
            duration,
            resolution: videoStream.width && videoStream.height
                ? `${videoStream.width}x${videoStream.height}`
                : null,
            codec: videoStream.codec_name || null
        };
    } catch (err) {
        if (err?.code === "ENOENT") {
            return { ffprobeAvailable: false };
        }
        if (err?.status) throw err;
        throw buildProviderError({
            message: "Downloaded MP4 failed playback validation",
            status: 502,
            errorCode: "MP4_PLAYBACK_VALIDATION_FAILED",
            safeErrorMessage: sanitizeErrorText(err?.stderr || err?.message || "ffprobe validation failed")
        });
    }
}

export async function validateMp4File(filePath) {
    const bytes = await fs.readFile(filePath);
    validateMp4Buffer(bytes);
    const boxes = readMp4TopLevelBoxes(bytes);
    const boxTypes = new Set(boxes.map(box => box.type));
    if (!boxTypes.has("moov") || (!boxTypes.has("mdat") && !boxTypes.has("moof"))) {
        throw buildProviderError({
            message: "Downloaded video is not a complete playable MP4",
            status: 502,
            errorCode: "INCOMPLETE_MP4",
            safeErrorMessage: "MP4 is missing moov or media data boxes"
        });
    }
    const probe = await probeMp4WithFfprobe(filePath);
    return {
        filePath,
        fileSize: bytes.length,
        duration: probe.duration ?? null,
        resolution: probe.resolution ?? null,
        codec: probe.codec ?? null,
        ffprobeAvailable: probe.ffprobeAvailable
    };
}
