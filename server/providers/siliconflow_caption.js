import fetch from "node-fetch";
import { getSiliconFlowEndpoint, getSiliconFlowHeaders } from "./siliconflow_config.js";

const DEFAULT_MODEL = "Qwen/Qwen3-VL-8B-Instruct";

function buildCaptionFallback(rawText = "") {
    return {
        subject: String(rawText || "").slice(0, 80) || "unknown subject",
        scene: "",
        composition: "follow the sketch layout",
        silhouette: "preserve the visible sketch silhouette",
        spatial_layout: "keep the relative object positions from the sketch",
        line_density: "unknown",
        style_hint: "",
        keywords: [],
        negative: ["text", "watermark", "logo", "blurry"]
    };
}

function parseJsonSafely(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function extractJsonObjectText(text) {
    if (!text) return "";
    const direct = String(text).trim();
    if (direct.startsWith("{") && direct.endsWith("}")) return direct;

    const start = direct.indexOf("{");
    const end = direct.lastIndexOf("}");
    if (start >= 0 && end > start) return direct.slice(start, end + 1);
    return "";
}

function normalizeCaptionObject(obj, rawText = "") {
    const source = obj && typeof obj === "object" ? obj : {};
    const fallback = buildCaptionFallback(rawText);
    const keywords = Array.isArray(source.keywords) ? source.keywords.filter(Boolean) : [];
    const negative = Array.isArray(source.negative) ? source.negative.filter(Boolean) : [];

    return {
        subject: String(source.subject || "").trim() || fallback.subject,
        scene: String(source.scene || "").trim(),
        composition: String(source.composition || "").trim() || fallback.composition,
        silhouette: String(source.silhouette || "").trim() || fallback.silhouette,
        spatial_layout: String(source.spatial_layout || "").trim() || fallback.spatial_layout,
        line_density: String(source.line_density || "").trim() || fallback.line_density,
        style_hint: String(source.style_hint || "").trim(),
        keywords,
        negative: negative.length ? negative : fallback.negative
    };
}

function buildProviderError({ message, status, detail }) {
    const err = new Error(message);
    err.status = status;
    err.detail = detail;
    return err;
}

function getMessageText(messageContent) {
    if (typeof messageContent === "string") return messageContent;
    if (Array.isArray(messageContent)) {
        return messageContent
            .filter((item) => item && typeof item === "object")
            .map((item) => item.text || item.content || "")
            .join("\n")
            .trim();
    }
    if (messageContent && typeof messageContent === "object") {
        return String(messageContent.text || messageContent.content || "").trim();
    }
    return "";
}

export async function siliconFlowCaptionFromSketch({ sketchDataUrl }) {
    const endpoint = getSiliconFlowEndpoint("/chat/completions");
    const model = process.env.SILICONFLOW_CAPTION_MODEL || DEFAULT_MODEL;

    console.log(`[siliconflow-caption] calling visual model: ${model}`);

    if (!sketchDataUrl || typeof sketchDataUrl !== "string" || !sketchDataUrl.startsWith("data:image/")) {
        throw buildProviderError({
            message: "Invalid sketch data URL",
            status: 400,
            detail: "Request sketch must be a valid data:image/...;base64,... string"
        });
    }

    const systemPrompt = `You are a specialized sketch-analysis assistant for traditional Chinese painting generation. Your job is to preserve the user's drawing as much as possible when it is later converted into a polished artwork.

Analyze the provided sketch and output STRICT JSON only (no markdown, no code fence) following this schema exactly:
{
  "subject": "main subject described using Chinese art vocabulary",
  "scene": "atmospheric setting description using poetic Chinese art language",
  "composition": "layout using spatial terms: foreground/midground/background, left/center/right, subject occupies X% of frame",
  "silhouette": "describe the sketch silhouette, main contour, pose, object count, and proportions so the final image can match it",
  "spatial_layout": "precise relative positions: what is at left/center/right/top/bottom, and approximate size relationships",
  "line_density": "sparse / medium / dense, and where the user's strokes are concentrated",
  "style_hint": "suggest ink tone, brush style, or color palette suited for traditional Chinese painting",
  "keywords": ["3-6 English keywords suitable for Chinese painting prompts"],
  "negative": ["things to avoid in the final painting, e.g. photorealistic, text, watermark, modern elements"]
}
Rules:
- If the sketch is simple, do not invent many extra objects.
- Prioritize accurate layout and silhouette over poetic imagination.
- If the sketch is unclear, infer conservatively and say it is sparse or ambiguous in line_density/spatial_layout.
- Never output anything except the JSON object.`;

    const body = {
        model,
        temperature: 0.15,
        messages: [
            { role: "system", content: systemPrompt },
            {
                role: "user",
                content: [
                    { type: "image_url", image_url: { url: sketchDataUrl } },
                    {
                        type: "text",
                        text: "Analyze this sketch for image generation. Preserve its layout, silhouette, object count, proportions, and stroke focus. Output only the requested JSON."
                    }
                ]
            }
        ]
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    let resp;
    try {
        resp = await fetch(endpoint, {
            method: "POST",
            headers: getSiliconFlowHeaders("caption provider"),
            body: JSON.stringify(body),
            signal: controller.signal
        });
    } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === "AbortError") {
            throw buildProviderError({ message: "SiliconFlow caption timeout (20s)", status: 504, detail: "Request timed out" });
        }
        throw fetchErr;
    }
    clearTimeout(timeoutId);

    const raw = await resp.text();
    if (!resp.ok) {
        throw buildProviderError({
            message: `SiliconFlow caption failed: HTTP ${resp.status}`,
            status: resp.status,
            detail: raw
        });
    }

    const data = parseJsonSafely(raw);
    if (!data) {
        throw buildProviderError({
            message: "SiliconFlow caption failed: invalid JSON response",
            status: 502,
            detail: raw
        });
    }

    const content = data?.choices?.[0]?.message?.content;
    const modelText = getMessageText(content);
    if (!modelText) {
        throw buildProviderError({
            message: "SiliconFlow caption missing content",
            status: 502,
            detail: raw
        });
    }

    const directObj = parseJsonSafely(modelText);
    if (directObj && typeof directObj === "object") return normalizeCaptionObject(directObj, modelText);

    const extractedText = extractJsonObjectText(modelText);
    const extractedObj = extractedText ? parseJsonSafely(extractedText) : null;
    if (extractedObj && typeof extractedObj === "object") return normalizeCaptionObject(extractedObj, modelText);

    return buildCaptionFallback(modelText);
}
