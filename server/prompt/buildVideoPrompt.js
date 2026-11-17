import { siliconFlowCaptionFromSketch } from "../providers/siliconflow_caption.js";

const DEFAULT_MOTION = [
    "slow cinematic push-in",
    "gentle atmospheric parallax",
    "subtle ink wash diffusion",
    "soft mist drifting across the scene",
    "tiny natural ripples or petal movement only where present in the first frame"
];

const MOTION_MAP = [
    [/云雾|雾|烟云|云/, "mist drifts slowly through the mountains and background"],
    [/水墨|晕染|墨/, "ink pigment softly diffuses along paper fibers"],
    [/花瓣|落花|花/, "petals move gently in the breeze without changing the flower structure"],
    [/镜头|推进|推近|运镜/, "stable slow camera push-in with no shake"],
    [/飞天|飘带|起舞/, "ribbons flow gracefully with restrained Dunhuang mural rhythm"],
    [/江水|流水|水面|波纹/, "water surface forms subtle slow ripples"],
    [/金粉|金色|流金/, "fine gold dust glimmers softly and disperses slowly"],
    [/莲|荷|荷花/, "lotus petals sway slightly and reflections ripple gently"],
    [/青花|瓷/, "cobalt blue porcelain ornaments shimmer subtly while the composition stays still"],
    [/剪纸|窗花/, "paper-cut layers breathe with slight shadow parallax, no tearing or deformation"],
    [/刺绣|丝线|苏绣/, "silk threads catch light with subtle shimmer, stitches remain stable"],
    [/脸谱|京剧/, "opera mask colors remain sharp while stage light shifts softly"],
    [/中国结|绳结/, "red cords sway very slightly, knot structure remains intact"]
];

const NEGATIVE_BASE = [
    "text",
    "watermark",
    "logo",
    "signature",
    "subtitle",
    "letters",
    "numbers",
    "caption",
    "stock photo watermark",
    "brand mark",
    "flicker",
    "jitter",
    "camera shake",
    "warped subject",
    "melting object",
    "shape morphing",
    "extra objects",
    "new people",
    "deformed face",
    "distorted hands",
    "unstable lines",
    "overexposed",
    "low quality",
    "blurry"
];

function cleanText(value, maxLength = 1200) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

function splitTerms(value) {
    return String(value || "")
        .split(/[,，;；\n]+/)
        .map(item => cleanText(item, 100))
        .filter(Boolean);
}

function dedupe(items) {
    const seen = new Set();
    const out = [];
    for (const item of items || []) {
        const text = cleanText(item, 180);
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(text);
    }
    return out;
}

function withTimeout(promise, timeoutMs, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(`${label} timeout`);
            err.status = 504;
            reject(err);
        }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function collectMotionTerms(userPrompt) {
    const prompt = String(userPrompt || "");
    const terms = [];
    for (const [pattern, phrase] of MOTION_MAP) {
        if (pattern.test(prompt)) terms.push(phrase);
    }
    for (const part of prompt.split(/[，,。.;；\n]+/)) {
        const text = cleanText(part, 120);
        if (text && !/默认|高质量|高清|国风/.test(text)) terms.push(text);
    }
    return dedupe(terms).slice(0, 8);
}

function captionToFrameText(caption) {
    if (!caption) return "";
    return [
        caption.subject && `first frame subject: ${caption.subject}`,
        caption.scene && `scene: ${caption.scene}`,
        caption.composition && `composition: ${caption.composition}`,
        caption.silhouette && `main silhouette: ${caption.silhouette}`,
        caption.spatial_layout && `spatial layout: ${caption.spatial_layout}`,
        caption.style_hint && `visual style: ${caption.style_hint}`,
        Array.isArray(caption.keywords) && caption.keywords.length ? `keywords: ${caption.keywords.join(", ")}` : ""
    ].filter(Boolean).join("; ");
}

function buildRulePrompt({ userPrompt, caption, imageSize, profile }) {
    const frameText = captionToFrameText(caption);
    const motionTerms = collectMotionTerms(userPrompt);
    const motion = motionTerms.length ? motionTerms : DEFAULT_MOTION;
    const aspect = imageSize === "720x1280"
        ? "vertical 9:16 composition"
        : imageSize === "960x960"
        ? "square 1:1 composition"
        : "wide 16:9 composition";

    const profileMotion = profile === "cinematic"
        ? "cinematic but restrained, layered foreground-midground-background parallax, slow poetic rhythm"
        : profile === "premium"
        ? "clean high-detail motion, stable camera, natural continuity"
        : "short quick-preview motion, minimal deformation, low-risk subtle movement";

    return cleanText([
        "Image-to-video prompt for a refined Chinese traditional artwork.",
        frameText || "Preserve the uploaded first frame as the exact visual source.",
        `Preserve the original first frame composition, subject identity, colors, brush texture, object positions, and ${aspect}.`,
        "Do not invent new subjects, do not change the main object, do not crop important content.",
        `Motion plan: ${motion.join("; ")}.`,
        profileMotion,
        "The animation should feel natural, elegant, quiet, and handcrafted, like a living ink painting or heritage artwork.",
        "Keep lines stable, keep faces and architecture stable, keep ornament patterns readable.",
        "No text, no watermark, no logo, no subtitles."
    ].join(" "), 2200);
}

export async function buildVideoPrompt({
    image,
    userPrompt,
    negativePrompt,
    options = {},
    onProgress = null
}) {
    let caption = null;
    if (options?.prompt_extend !== false) {
        try {
            onProgress?.({ stage: "video_caption", message: "正在识别首帧主体与构图，用于重构视频提示词..." });
            const timeoutMs = Number(process.env.SILICONFLOW_VIDEO_CAPTION_TIMEOUT_MS || 10000);
            caption = await withTimeout(
                siliconFlowCaptionFromSketch({ sketchDataUrl: image }),
                timeoutMs,
                "video first-frame caption"
            );
        } catch (err) {
            onProgress?.({
                stage: "video_caption_fallback",
                message: "首帧识别超时，已改用用户运镜描述构建视频提示词。"
            });
        }
    }

    const prompt = buildRulePrompt({
        userPrompt,
        caption,
        imageSize: options?.image_size || "1280x720",
        profile: options?.profile || "balanced"
    });

    const negative = dedupe([
        ...NEGATIVE_BASE,
        ...splitTerms(negativePrompt)
    ]).join(", ");

    return {
        prompt,
        negative,
        caption,
        source: caption ? "frame-caption-rule" : "rule"
    };
}
