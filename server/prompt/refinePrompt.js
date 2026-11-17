import fetch from "node-fetch";
import { getSiliconFlowEndpoint, getSiliconFlowHeaders } from "../providers/siliconflow_config.js";

const DEFAULT_PROMPT_MODEL = "Qwen/Qwen2.5-72B-Instruct";
const DEFAULT_TIMEOUT_MS = 25000;

const STYLE_GUIDES = {
    ink: {
        label: "Chinese ink wash",
        positive: "monochrome black ink and light gray wash, xieyi brushwork, dry brush, wet ink diffusion, rice paper texture, large negative space",
        contrast: "must not look like porcelain blue patterns, Dunhuang mural pigments, oil painting, or modern poster art",
    },
    bluewhite: {
        label: "blue-and-white porcelain",
        positive: "cobalt blue linework on warm white porcelain, glazed ceramic surface, ornamental borders, porcelain floral rhythm",
        contrast: "must not become black ink wash, multi-color mural, oil painting, or photographic ceramic product shot",
    },
    dunhuang: {
        label: "Dunhuang cave mural",
        positive: "aged fresco texture, mineral pigments, ochre red, malachite green, lapis blue, bold decorative outlines, ancient Buddhist mural atmosphere",
        contrast: "must not become porcelain blue, monochrome ink wash, modern fantasy poster, or clean vector illustration",
    },
    gongbi: {
        label: "gongbi meticulous painting",
        positive: "ultra-fine contour lines, controlled brushwork, delicate layered color, crisp edges, refined botanical and fabric detail",
        contrast: "must not look like loose xieyi ink, messy sketch, low-detail watercolor, or abstract splash ink",
    },
    song: {
        label: "Song dynasty literati painting",
        positive: "restrained subtle color, elegant line economy, quiet poetic emptiness, misty distance, refined scholarly taste",
        contrast: "must not be ornate court painting, gaudy decoration, modern poster, or saturated fantasy art",
    },
    court: {
        label: "imperial court painting",
        positive: "polished palace elegance, ornate meticulous detail, luxurious mineral colors, balanced decorative composition",
        contrast: "must not be plain monochrome ink, sparse minimalism, rough sketch, or unfinished brushwork",
    },
    modern: {
        label: "modern Chinese fusion",
        positive: "clean contemporary composition, traditional Chinese motifs, refined digital painting, restrained modern layout",
        contrast: "must not become cyberpunk neon, western comic, generic fantasy, or photorealistic photography",
    },
    calligraphy: {
        label: "calligraphic ink image",
        positive: "dynamic brush rhythm, bold ink momentum, abstract stroke energy, image-only composition, no readable characters",
        contrast: "must not contain Chinese characters, typography, readable calligraphy, logo, seal, or text",
    },
    ming: {
        label: "Ming blue-green landscape",
        positive: "azurite and malachite mineral pigments, refined antique linework, decorative mountain layers, historical blue-green landscape",
        contrast: "must not become monochrome ink wash, porcelain glaze ornament, Dunhuang fresco, or modern flat poster",
    },
};

const CONTENT_GUIDES = {
    landscape: "mountains, rivers, mist, pine trees, pavilion or distant bridge only if supported by the sketch",
    birds: "flower-and-bird subject, branch rhythm, clear bird silhouette, blossoms or bamboo only if supported by the sketch",
    figure: "traditional Chinese figure, pose and robe flow follow the sketch gesture, no extra people unless drawn",
    flowers: "botanical subject, clear stems, petals, leaves and elegant growth direction",
    fish: "fish, insect, koi, goldfish, dragonfly or butterfly, creature count follows the sketch",
    architecture: "ancient Chinese architecture, stable roof lines, pavilion, bridge, temple or garden context",
    cloud: "layered auspicious clouds and mist, soft atmospheric depth following the sketch flow",
    flying: "Dunhuang flying apsaras, flowing ribbons and body motion following the sketch direction",
    dragon: "Chinese dragon in clouds and mist, body curve and head direction follow the sketch",
};

const MUST_KEEP_NEGATIVE = [
    "text",
    "watermark",
    "logo",
    "signature",
    "Chinese characters",
    "letters",
    "numbers",
    "typography",
    "caption",
    "label",
    "seal",
    "low quality",
    "blurry",
    "deformed",
    "distorted perspective",
    "extra limbs",
    "duplicate subject",
    "photorealistic",
    "3d render",
];

function cleanText(value, maxLength = 5000) {
    return String(value || "")
        .replace(/\[DRAW:\s*[\s\S]*?\]/gi, "")
        .replace(/subject\s+subject+/gi, "subject")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

function countCjk(text) {
    return (String(text || "").match(/[\u4e00-\u9fff]/g) || []).length;
}

function hasPromptArtifacts(text) {
    return /\[DRAW:/i.test(text) || /subject\s+subject/i.test(text) || /D{4,}/.test(text);
}

function parseJsonObject(text) {
    if (!text) return null;
    const raw = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    try {
        return JSON.parse(raw);
    } catch (_) {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(raw.slice(start, end + 1));
            } catch (_) {
                return null;
            }
        }
    }
    return null;
}

function splitNegativeTerms(text) {
    return String(text || "")
        .split(/[,;，；\n]+/)
        .map((item) => cleanText(item, 120))
        .filter(Boolean);
}

function dedupeTerms(items) {
    const seen = new Set();
    const out = [];
    for (const item of items || []) {
        const term = cleanText(item, 160);
        if (!term) continue;
        const key = term.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(term);
    }
    return out;
}

function getModelText(messageContent) {
    if (typeof messageContent === "string") return messageContent;
    if (Array.isArray(messageContent)) {
        return messageContent.map((part) => part?.text || part?.content || "").join("\n");
    }
    if (messageContent && typeof messageContent === "object") {
        return String(messageContent.text || messageContent.content || "");
    }
    return "";
}

function isRefinerEnabled() {
    return String(process.env.SILICONFLOW_PROMPT_REFINER || "true").toLowerCase() !== "false";
}

export async function refineSiliconFlowPrompt({
    draftPositive,
    draftNegative,
    basePromptFromUI,
    content,
    style,
    caption,
    mode = "generate",
}) {
    if (!isRefinerEnabled()) {
        return {
            positivePrompt: draftPositive,
            negativePrompt: draftNegative,
            source: "rule",
            modelUsed: null,
        };
    }

    const endpoint = getSiliconFlowEndpoint("/chat/completions");
    const model =
        process.env.SILICONFLOW_PROMPT_MODEL ||
        process.env.SILICONFLOW_CHAT_MODEL ||
        DEFAULT_PROMPT_MODEL;

    const styleGuide = STYLE_GUIDES[style] || STYLE_GUIDES.ink;
    const contentGuide = CONTENT_GUIDES[content] || CONTENT_GUIDES.landscape;
    const payload = {
        mode,
        selected_style: style || "ink",
        selected_style_guide: styleGuide,
        selected_subject_category: content || "landscape",
        selected_subject_guide: contentGuide,
        sketch_analysis: caption || {},
        user_intention: cleanText(basePromptFromUI, 1200),
        rule_based_positive_prompt: cleanText(draftPositive, 5000),
        rule_based_negative_prompt: cleanText(draftNegative, 2500),
    };

    const systemPrompt = `You are a senior prompt engineer for a Chinese traditional painting image-generation app.
Your task is to merge sketch analysis, selected subject, selected style, and user intention into one image prompt.

Output STRICT JSON only, no markdown:
{
  "positive_prompt": "English image-generation prompt",
  "negative_prompt": "comma separated English negative prompt"
}

Hard rules:
1. Preserve the user's sketch as the structural source of truth: composition, silhouette, subject count, pose, object placement, proportions, foreground/midground/background, left/right/top/bottom relationships.
2. Do not invent unrelated subjects. If the sketch is sparse, keep the final artwork sparse and refined.
3. The selected style must be visually obvious at first glance and clearly different from other styles.
4. If user intention conflicts with the sketch or style, keep the sketch and selected style, then use user text only as mood, light, ornament, or atmosphere.
5. The positive prompt must be in English, concise but specific, 900-1700 characters, suitable for text-to-image.
6. The negative prompt must forbid text, watermark, logo, signature, readable characters, photorealism, 3D render, modern plastic feeling, low quality, blur, deformation, and styles that conflict with the selected style.
7. Never include actual text to be rendered inside the image.`;

    const controller = new AbortController();
    const timeoutMs = Number(process.env.SILICONFLOW_PROMPT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let resp;
    try {
        resp = await fetch(endpoint, {
            method: "POST",
            headers: getSiliconFlowHeaders("prompt refinement"),
            signal: controller.signal,
            body: JSON.stringify({
                model,
                temperature: 0.35,
                max_tokens: 1800,
                messages: [
                    { role: "system", content: systemPrompt },
                    {
                        role: "user",
                        content: `Refine this generation prompt context into strict JSON:\n${JSON.stringify(payload, null, 2)}`,
                    },
                ],
            }),
        });
    } catch (err) {
        clearTimeout(timeoutId);
        if (err?.name === "AbortError") {
            const timeoutErr = new Error(`SiliconFlow prompt refinement timeout (${timeoutMs}ms)`);
            timeoutErr.status = 504;
            throw timeoutErr;
        }
        throw err;
    }
    clearTimeout(timeoutId);

    const raw = await resp.text();
    if (!resp.ok) {
        const err = new Error(`SiliconFlow prompt refinement failed: HTTP ${resp.status}`);
        err.status = resp.status;
        err.detail = raw;
        throw err;
    }

    const data = parseJsonObject(raw);
    const contentText = getModelText(data?.choices?.[0]?.message?.content);
    const parsed = parseJsonObject(contentText);
    if (!parsed || typeof parsed !== "object") {
        const err = new Error("SiliconFlow prompt refinement returned invalid JSON");
        err.status = 502;
        err.detail = raw;
        throw err;
    }

    let positivePrompt = cleanText(parsed.positive_prompt || parsed.positivePrompt, 3200);
    if (positivePrompt.length < 120) {
        const err = new Error("SiliconFlow prompt refinement returned an empty or too-short prompt");
        err.status = 502;
        err.detail = raw;
        throw err;
    }
    if (countCjk(positivePrompt) > 12 || hasPromptArtifacts(positivePrompt)) {
        const err = new Error("SiliconFlow prompt refinement returned low-quality prompt text");
        err.status = 502;
        err.detail = raw;
        throw err;
    }

    if (positivePrompt.length < 700) {
        positivePrompt = cleanText([
            positivePrompt,
            `Use the user's sketch as the exact structural guide: preserve composition, silhouette, subject count, pose, proportions, object placement, and left/right/top/bottom spatial relationships`,
            caption?.composition && `Sketch composition to preserve: ${caption.composition}`,
            caption?.silhouette && `Sketch silhouette to preserve: ${caption.silhouette}`,
            caption?.spatial_layout && `Sketch spatial layout to preserve: ${caption.spatial_layout}`,
            `Selected subject guide: ${contentGuide}`,
            `Selected style anchor: ${styleGuide.label}; ${styleGuide.positive}`,
            `Style separation rule: ${styleGuide.contrast}; the selected style must be obvious at first glance`,
            mode === "enhance"
                ? "Enhancement mode: refine line clarity, brush texture, atmosphere, and detail quality while keeping all original subject positions unchanged"
                : "Generation mode: create a coherent polished Chinese traditional artwork with elegant composition, controlled detail, refined paper or fresco texture, and balanced negative space",
            "Pure visual artwork only, no rendered text, no watermark, no logo, no signature, no seal",
        ].filter(Boolean).join(". "), 3200);
    }

    let negativePrompt = dedupeTerms([
        ...MUST_KEEP_NEGATIVE,
        ...splitNegativeTerms(draftNegative),
        ...splitNegativeTerms(parsed.negative_prompt || parsed.negativePrompt),
    ]).join(", ");
    if (countCjk(negativePrompt) > 8 || hasPromptArtifacts(negativePrompt)) {
        negativePrompt = dedupeTerms([
            ...MUST_KEEP_NEGATIVE,
            ...splitNegativeTerms(draftNegative),
        ]).join(", ");
    }

    return {
        positivePrompt,
        negativePrompt: negativePrompt || draftNegative,
        source: "llm",
        modelUsed: model,
    };
}
