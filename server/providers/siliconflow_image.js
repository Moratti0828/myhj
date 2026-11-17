import fetch from "node-fetch";
import { imageUrlToDataUrl } from "./safeImageDownload.js";
import { getSiliconFlowEndpoint, getSiliconFlowHeaders } from "./siliconflow_config.js";

const DEFAULT_MODEL = "black-forest-labs/FLUX.1-schnell";


function buildProviderError({ message, status, detail }) {
    const err = new Error(message);
    err.status = status;
    err.detail = detail;
    return err;
}

function sanitizeSize(size) {
    const text = String(size || "").trim();
    if (!text) return "1024x1024";
    // Replace '*' with 'x' for SiliconFlow API compatibility (e.g. 1024*1024 -> 1024x1024)
    const normalized = text.replace("*", "x");
    return /^\d{3,5}x\d{3,5}$/.test(normalized) ? normalized : "1024x1024";
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
                detail: `超过 ${timeoutMs}ms 未返回，请稍后重试或降低生成参数。`
            });
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

export { imageUrlToDataUrl } from "./safeImageDownload.js";

export async function generateWithSiliconFlow({ prompt, image, size = "1024x1024", options = {}, onProgress = null }) {
    const endpoint = getSiliconFlowEndpoint("/images/generations");
    const model = image
        ? (process.env.SILICONFLOW_IMAGE_EDIT_MODEL || "Qwen/Qwen-Image-Edit-2509")
        : (options?.model || process.env.SILICONFLOW_IMAGE_MODEL || DEFAULT_MODEL);

    console.log(`[siliconflow-image] calling ${image ? "image-edit" : "text2image"} model: ${model}`);

    if (!prompt || !String(prompt).trim()) {
        throw buildProviderError({
            message: "SiliconFlow prompt is empty",
            status: 400,
            detail: "Prompt must be a non-empty string"
        });
    }

    const steps = Number.isFinite(Number(options?.num_inference_steps))
        ? Math.max(4, Math.min(50, Math.round(Number(options.num_inference_steps))))
        : envNumber("SILICONFLOW_IMAGE_STEPS", 30);

    const body = {
        model,
        prompt: String(prompt),
        num_inference_steps: steps
    };

    // Qwen 图像编辑直接接收原图，不支持 image_size。
    if (image) body.image = image;
    else body.image_size = sanitizeSize(size);

    // 图像编辑不排除文字，以免擦除手写作品。
    const negativePrompt = options?.negative_prompt ?? (image
        ? "low quality, blurry, deformed strokes"
        : "text, watermark, logo, signature, chinese characters, words, letters, low quality, blurry");
    body.negative_prompt = negativePrompt;

    // 可选参数
    if (typeof options?.seed === "number" && Number.isFinite(options.seed)) {
        body.seed = Math.floor(options.seed);
    }
    if (!image && model === "Kwai-Kolors/Kolors" && typeof options?.guidance === "number" && Number.isFinite(options.guidance)) {
        body.guidance_scale = options.guidance;
    }

    if (onProgress) onProgress({ stage: "generating", message: image ? "正在依原作润色成画…" : "正在绘制作品…" });
    const timeoutMs = envNumber("SILICONFLOW_IMAGE_TIMEOUT_MS", 120000);
    const resp = await fetchWithTimeout(
        endpoint,
        {
            method: "POST",
            headers: getSiliconFlowHeaders("image generation"),
            body: JSON.stringify(body)
        },
        timeoutMs,
        "硅基流动生图"
    );

    const raw = await resp.text();
    if (!resp.ok) {
        throw buildProviderError({
            message: `SiliconFlow image generation failed: HTTP ${resp.status}`,
            status: resp.status,
            detail: raw
        });
    }

    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        throw buildProviderError({
            message: "SiliconFlow image generation returned invalid JSON",
            status: 502,
            detail: raw
        });
    }

    // Extract image URL from either data.images[0].url or data.data[0].url (OpenAI standard)
    const imageUrl = data?.images?.[0]?.url || data?.data?.[0]?.url;
    if (!imageUrl) {
        throw buildProviderError({
            message: "SiliconFlow response missing image output url",
            status: 502,
            detail: raw
        });
    }

    let imageDataUrl = imageUrl;
    let materialized = false;
    let materializeError = "";
    try {
        imageDataUrl = await imageUrlToDataUrl(imageUrl);
        materialized = /^data:image\/[a-z0-9.+-]+;base64,/i.test(imageDataUrl);
    } catch (err) {
        materializeError = err?.message || "image materialize failed";
        console.warn("[siliconflow-image] provider image url returned, local materialize failed:", materializeError);
    }

    return { imageDataUrl, imageUrl, materialized, materializeError, raw: data };
}
