import "../env.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    createDashScopeWanTask,
    downloadDashScopeVideo,
    getDashScopeWanTask,
    validateMp4File
} from "../providers/dashscope_wan_video.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ARTIFACT_DIR = path.join(ROOT_DIR, "artifacts");
const STATE_PATH = path.join(ARTIFACT_DIR, "wan-live-test-state.json");
const OUTPUT_PATH = path.join(ARTIFACT_DIR, "wan-live-test.mp4");
const SAMPLE_IMAGE_PATH = path.join(ROOT_DIR, "public", "image", "中国画", "花鸟画.png");
const POLL_INTERVAL_MS = Number(process.env.WAN_LIVE_TEST_POLL_INTERVAL_MS || 15000);
const MAX_WAIT_MS = Number(process.env.WAN_LIVE_TEST_TIMEOUT_MS || 20 * 60 * 1000);
const MAX_REAL_TASKS = 3;
const MAX_CREATE_ATTEMPTS = Number(process.env.WAN_LIVE_TEST_CREATE_ATTEMPTS || 3);

function printJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}

async function readState() {
    try {
        return JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
    } catch (err) {
        if (err?.code === "ENOENT") return {};
        throw err;
    }
}

async function writeState(state) {
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

async function imageFileToDataUrl(filePath) {
    const bytes = await fs.readFile(filePath);
    if (!bytes.length) throw new Error("sample image is empty");
    return `data:image/png;base64,${bytes.toString("base64")}`;
}

function isTerminal(status) {
    return ["SUCCEEDED", "FAILED", "CANCELED"].includes(String(status || "").toUpperCase());
}

function isAccountSideBlocker(errorCode = "", message = "", status = 0) {
    const text = `${errorCode} ${message}`.toLowerCase();
    return status === 401 ||
        /invalid.*api|apikey|api key|unauthorized|accessdenied|forbidden|permission|quota|balance|insufficient|arrearage|overdue|good standing|model.*not.*exist|model.*permission|region|billing/.test(text);
}

function isNetworkSideBlocker(message = "") {
    return /socket hang up|econnreset|econnrefused|enotfound|etimedout|network|tls|certificate/i.test(String(message || ""));
}

function safeError(err) {
    return {
        http_status: err?.status || null,
        request_id: err?.requestId || null,
        error_code: err?.errorCode || null,
        message: String(err?.safeErrorMessage || err?.message || "unknown error").slice(0, 800)
    };
}

async function ensureTask(state) {
    if (state.providerTaskId) {
        return state;
    }

    if (Number(state.createdTaskCount || 0) >= MAX_REAL_TASKS) {
        throw new Error(`real task limit reached (${MAX_REAL_TASKS})`);
    }

    const image = await imageFileToDataUrl(SAMPLE_IMAGE_PATH);
    const created = await createDashScopeWanTask({
        image,
        prompt: "A tranquil Chinese ink painting of lotus and birds, restrained natural motion, gentle camera push-in, soft mist drift, preserve the first frame composition and brush texture.",
        negative: "text, watermark, logo, signature, subtitle, letters, numbers",
        options: {
            profile: "balanced",
            resolution: "720P",
            duration: 2,
            audio: false,
            watermark: false,
            shot_type: "single",
            prompt_extend: true
        }
    });

    const next = {
        createdTaskCount: Number(state.createdTaskCount || 0) + 1,
        providerTaskId: created.providerTaskId,
        providerStatus: created.providerStatus,
        requestId: created.requestId || null,
        model: created.model,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    await writeState(next);
    printJson({
        event: "task_created",
        task_id: next.providerTaskId,
        status: next.providerStatus,
        request_id: next.requestId,
        created_task_count: next.createdTaskCount
    });
    return next;
}

async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureTaskWithRetry(state) {
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
        try {
            return await ensureTask(state);
        } catch (err) {
            lastErr = err;
            const safe = safeError(err);
            printJson({ event: "task_create_failed", attempt, ...safe });
            if (isAccountSideBlocker(err?.errorCode, err?.safeErrorMessage || err?.message, err?.status)) {
                process.exitCode = 2;
                return null;
            }
            if (attempt >= MAX_CREATE_ATTEMPTS) break;
            printJson({
                event: "task_create_retry",
                attempt,
                next_attempt: attempt + 1,
                reason: safe.message
            });
            await sleep(5000);
        }
    }

    if (isNetworkSideBlocker(lastErr?.safeErrorMessage || lastErr?.message)) {
        printJson({
            event: "task_create_network_blocked",
            ...safeError(lastErr)
        });
        process.exitCode = 2;
        return null;
    }

    throw lastErr;
}

async function runLiveTest() {
    if (process.env.RUN_WAN_LIVE_TEST !== "true") {
        console.log("WAN LIVE TEST SKIPPED: set RUN_WAN_LIVE_TEST=true to call the paid DashScope API.");
        return;
    }

    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    let state = await readState();

    state = await ensureTaskWithRetry(state);
    if (!state) return;

    const deadline = Date.now() + MAX_WAIT_MS;
    let finalTask = null;

    while (Date.now() <= deadline) {
        try {
            const task = await getDashScopeWanTask(state.providerTaskId);
            finalTask = task;
            state = {
                ...state,
                providerStatus: task.providerStatus,
                requestId: task.requestId || state.requestId || null,
                videoUrl: task.videoUrl || state.videoUrl || null,
                errorCode: task.errorCode || null,
                error: task.safeErrorMessage || null,
                updatedAt: new Date().toISOString()
            };
            await writeState(state);
            printJson({
                event: "task_polled",
                task_id: state.providerTaskId,
                status: task.providerStatus,
                request_id: state.requestId
            });

            if (task.providerStatus === "SUCCEEDED") break;
            if (task.providerStatus === "FAILED" || task.providerStatus === "CANCELED") {
                printJson({
                    event: "task_terminal_failure",
                    task_id: state.providerTaskId,
                    status: task.providerStatus,
                    request_id: state.requestId,
                    error_code: task.errorCode,
                    message: task.safeErrorMessage
                });
                process.exitCode = 3;
                return;
            }
        } catch (err) {
            printJson({ event: "task_poll_failed", task_id: state.providerTaskId, ...safeError(err) });
            if (isAccountSideBlocker(err?.errorCode, err?.safeErrorMessage || err?.message, err?.status)) {
                process.exitCode = 2;
                return;
            }
        }
        await sleep(POLL_INTERVAL_MS);
    }

    if (!finalTask || finalTask.providerStatus !== "SUCCEEDED") {
        printJson({
            event: "task_wait_timeout",
            task_id: state.providerTaskId,
            status: state.providerStatus,
            request_id: state.requestId
        });
        process.exitCode = 4;
        return;
    }

    if (!finalTask.videoUrl) {
        printJson({
            event: "task_missing_video_url",
            task_id: state.providerTaskId,
            status: finalTask.providerStatus,
            request_id: state.requestId
        });
        process.exitCode = 5;
        return;
    }

    const downloaded = await downloadDashScopeVideo(finalTask.videoUrl, OUTPUT_PATH);
    const validation = await validateMp4File(downloaded.filePath);
    state = {
        ...state,
        providerStatus: "SUCCEEDED",
        videoUrl: null,
        errorCode: null,
        error: null,
        videoFile: OUTPUT_PATH,
        fileSize: validation.fileSize,
        updatedAt: new Date().toISOString()
    };
    await writeState(state);
    printJson({
        event: "WAN_LIVE_TEST_PASSED",
        task_id: state.providerTaskId,
        status: "SUCCEEDED",
        request_id: state.requestId,
        video_file: OUTPUT_PATH,
        file_size: validation.fileSize,
        valid_mp4: true
    });
}

runLiveTest().catch(err => {
    printJson({ event: "wan_live_test_unhandled_error", ...safeError(err) });
    process.exitCode = 1;
});
