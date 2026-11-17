import {
    buildWanNegative,
    buildWanPrompt,
    createWanPayload,
    extractDashScopeTaskId,
    extractDashScopeTaskStatus,
    extractDashScopeVideoUrl,
    mapDashScopeStatus,
    normalizeDashScopeStatus,
    sanitizeWanDuration,
    sanitizeWanDurationForMode,
    sanitizeWanVideoMode,
    validateMp4Buffer
} from "../providers/dashscope_wan_video.js";

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const oldKey = process.env.DASHSCOPE_API_KEY;
process.env.DASHSCOPE_API_KEY = "mock-key";
process.env.DASHSCOPE_VIDEO_MODEL = "wan2.6-i2v-flash";

try {
    const prompt = buildWanPrompt({
        prompt: "水墨山水云雾缓慢流动，镜头轻轻推进。",
        profile: "balanced"
    });
    assert(prompt.includes("complete visual reference") && prompt.includes("count, position"), "prompt must preserve the existing image rather than ask for a new painting");
    assert(prompt.includes("水墨山水"), "prompt should preserve user intent");
    const longPrompt = buildWanPrompt({
        prompt: "山水长卷从晨雾到月色，镜头分四段展开。",
        profile: "cinematic",
        videoMode: "long",
        duration: 8
    });
    assert(longPrompt.includes("开头短暂停驻"), "long prompt should include narrative guidance");

    assert(sanitizeWanVideoMode("short", 15) === "short", "explicit short mode should win");
    assert(sanitizeWanVideoMode("long", 2) === "long", "explicit long mode should win");
    assert(sanitizeWanVideoMode(undefined, 15) === "long", "duration above short max should infer long mode");
    assert(sanitizeWanDuration(15) === 10, "legacy duration sanitizer should clamp to the long maximum");
    assert(sanitizeWanDurationForMode(1, "short") === 5, "short duration should be fixed at 5 seconds");
    assert(sanitizeWanDurationForMode(9, "short") === 5, "short max clamp failed");
    assert(sanitizeWanDurationForMode(9, "long") === 9, "long duration should be preserved");
    assert(sanitizeWanDurationForMode(40, "long") === 10, "long max clamp failed");

    const negative = buildWanNegative("extra people");
    assert(negative.includes("额外标志"), "negative prompt should include logo guard");
    assert(negative.includes("extra people"), "negative prompt should keep user negative terms");

    const payload = createWanPayload({
        image: "data:image/png;base64,AAAA",
        prompt,
        negative,
        options: {
            duration: 2,
            video_mode: "short",
            resolution: "720P",
            audio: false,
            watermark: false,
            shot_type: "single"
        }
    });
    assert(payload.model === "wan2.6-i2v-flash", "payload model mismatch");
    assert(payload.input.img_url.startsWith("data:image/"), "payload image mismatch");
    assert(payload.parameters.duration === 5, "short duration should be clamped to 5");
    assert(payload.parameters.resolution === "720P", "resolution should be 720P");
    assert(payload.parameters.audio === false, "audio should be false");
    assert(payload.parameters.watermark === false, "watermark should be false");
    assert(payload.parameters.shot_type === "single", "shot_type should be single");
    assert(!Object.prototype.hasOwnProperty.call(payload.parameters, "video_mode"), "internal mode should not be sent as DashScope parameter");

    const longPayload = createWanPayload({
        image: "data:image/png;base64,AAAA",
        prompt: "山水长卷从晨雾到月色，镜头分四段展开。",
        negative,
        options: {
            video_mode: "long",
            duration: 15,
            resolution: "720P",
            audio: false,
            watermark: false,
            shot_type: "single"
        }
    });
    assert(longPayload.parameters.duration === 10, "long duration should be clamped to 10");

    const createResponse = { output: { task_id: "task-123", task_status: "PENDING" }, request_id: "req-1" };
    assert(extractDashScopeTaskId(createResponse) === "task-123", "task id extract failed");
    assert(extractDashScopeTaskStatus(createResponse) === "PENDING", "task status extract failed");
    assert(mapDashScopeStatus("PENDING") === "queued", "pending map failed");
    assert(mapDashScopeStatus("RUNNING") === "running", "running map failed");
    assert(mapDashScopeStatus("SUCCEEDED") === "succeeded", "succeeded map failed");
    assert(mapDashScopeStatus("FAILED") === "failed", "failed map failed");
    assert(normalizeDashScopeStatus("cancelled") === "CANCELED", "cancelled normalize failed");

    const successResponse = { output: { task_status: "SUCCEEDED", video_url: "https://example.com/out.mp4" } };
    assert(extractDashScopeVideoUrl(successResponse) === "https://example.com/out.mp4", "video url extract failed");

    const mp4 = Buffer.concat([
        Buffer.from([0, 0, 0, 24]),
        Buffer.from("ftypisom", "ascii"),
        Buffer.alloc(64, 0)
    ]);
    assert(validateMp4Buffer(mp4) === true, "mp4 validation failed");

    console.log("WAN MOCK TEST PASSED");
} finally {
    if (oldKey === undefined) {
        delete process.env.DASHSCOPE_API_KEY;
    } else {
        process.env.DASHSCOPE_API_KEY = oldKey;
    }
}
