function safeJoin(arr, sep = ", ") {
    return (arr || [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join(sep);
}

function dedupeTerms(items) {
    const seen = new Set();
    return items
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((item) => {
            const key = item.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function cleanPromptText(value, maxLength = 5000) {
    return String(value || "")
        .replace(/\[DRAW:\s*[\s\S]*?\]/gi, "")
        .replace(/subject\s+subject+/gi, "subject")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

const CAPTION_STYLE_NOISE_TERMS = [
    "tattoo",
    "sticker",
    "logo",
    "watermark",
    "poster",
    "anime",
    "manga",
    "cartoon",
    "photorealistic",
    "realistic photo",
    "3d",
    "render",
    "ink wash",
    "watercolor",
    "oil painting",
    "line art",
    "sketch style",
];

function hasCaptionStyleNoise(value) {
    const text = String(value || "").toLowerCase();
    return CAPTION_STYLE_NOISE_TERMS.some((term) => text.includes(term));
}

function cleanCaptionSemantic(value, maxLength = 1000) {
    let text = cleanPromptText(value, maxLength);
    for (const term of CAPTION_STYLE_NOISE_TERMS) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "");
    }
    return text
        .replace(/\s+,/g, ",")
        .replace(/,\s*,+/g, ", ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

const USER_INTENT_KEYWORDS = [
    [/云山|远山|山|峰|山水/, "misty mountains and layered shanshui depth"],
    [/江水|河|水面|临水|溪|湖/, "quiet river water and soft reflections"],
    [/小舟|舟|船|扁舟/, "small boat as a clear focal subject"],
    [/少年|人物|仕女|书生|执笔/, "single traditional figure with restrained gesture"],
    [/松|松林| pine/i, "pine trees and literati landscape rhythm"],
    [/荷|莲|荷花|莲花/, "lotus flowers and elegant botanical structure"],
    [/花鸟|鸟|雀|枝/, "flower-and-bird motif with branch rhythm"],
    [/龙|腾龙|龙凤/, "Chinese dragon silhouette with cloud movement"],
    [/飞天|飘带|敦煌/, "Dunhuang flying apsara ribbons and mural rhythm"],
    [/青花|瓷|瓷盘|瓷器/, "blue-and-white porcelain ornament and cobalt linework"],
    [/剪纸|窗花/, "Chinese paper-cut hollow pattern and red folk ornament"],
    [/刺绣|苏绣|丝线/, "silk embroidery texture and delicate thread detail"],
    [/宫廷|亭台|楼阁|建筑|亭/, "ancient Chinese architecture with stable roof lines"],
    [/月|月光|夜/, "soft moonlight and quiet night atmosphere"],
    [/晨|清晨| dawn/i, "soft dawn light"],
    [/雾|烟|氤氲|朦胧/, "gentle mist and atmospheric haze"],
    [/宣纸|纸/, "rice paper texture"],
    [/金粉|金色/, "subtle gold powder accents"],
    [/清幽|空灵|静|寂|雅/, "quiet poetic mood and refined negative space"],
    [/热闹|喜庆|吉祥/, "auspicious festive atmosphere"],
    [/不要出现文字|无文字|不要文字|不出现文字/, "image-only composition with no readable text"],
];

const USER_INTENT_TERM_GROUPS = [
    {
        terms: [
            ["瀑布", "waterfall"],
            ["溪流", "mountain stream"],
            ["湖面", "quiet lake surface"],
            ["倒影", "soft water reflection"],
            ["云雾", "mist and drifting clouds"],
            ["烟雨", "misty rain atmosphere"],
            ["雪", "snowy atmosphere"],
            ["雨", "rain-washed atmosphere"],
            ["月", "moonlight"],
            ["日出", "sunrise glow"],
            ["夕阳", "warm sunset glow"],
        ],
    },
    {
        terms: [
            ["竹", "bamboo leaves and slender bamboo rhythm"],
            ["松", "pine tree structure"],
            ["梅", "plum blossom branches"],
            ["兰", "orchid leaves"],
            ["菊", "chrysanthemum petals"],
            ["牡丹", "peony bloom"],
            ["荷", "lotus leaves and lotus flowers"],
            ["莲", "lotus flowers"],
            ["花瓣", "falling petals"],
            ["枝", "branch rhythm"],
        ],
    },
    {
        terms: [
            ["鸟", "bird silhouette"],
            ["雀", "small bird silhouette"],
            ["鹤", "crane with elegant posture"],
            ["鱼", "fish movement"],
            ["锦鲤", "koi fish"],
            ["蝶", "butterfly"],
            ["蜻蜓", "dragonfly"],
            ["马", "horse figure"],
            ["鹿", "deer figure"],
            ["虎", "tiger form"],
            ["龙", "Chinese dragon form"],
            ["凤", "phoenix motif"],
        ],
    },
    {
        terms: [
            ["亭", "small pavilion"],
            ["桥", "arched bridge"],
            ["楼阁", "ancient tower pavilion"],
            ["庙", "temple architecture"],
            ["宫殿", "palace architecture"],
            ["院落", "courtyard layout"],
            ["窗", "traditional window lattice"],
            ["船", "boat form"],
            ["伞", "oil-paper umbrella"],
            ["灯笼", "lantern glow"],
        ],
    },
    {
        terms: [
            ["少年", "young scholar figure"],
            ["书生", "scholar figure"],
            ["仕女", "elegant court lady figure"],
            ["仙人", "immortal figure"],
            ["飞天", "Dunhuang apsara figure"],
            ["执笔", "figure holding a brush"],
            ["抚琴", "figure playing guqin"],
            ["饮茶", "tea-drinking scene"],
        ],
    },
    {
        terms: [
            ["红", "red accent"],
            ["金", "subtle gold accent"],
            ["青绿", "blue-green mineral color"],
            ["青花", "cobalt blue porcelain linework"],
            ["墨", "black ink wash"],
            ["赭石", "ochre mineral tone"],
            ["淡彩", "light restrained color wash"],
            ["留白", "elegant negative space"],
        ],
    },
    {
        terms: [
            ["清幽", "quiet secluded mood"],
            ["空灵", "ethereal poetic mood"],
            ["古雅", "antique refined mood"],
            ["苍茫", "vast atmospheric mood"],
            ["喜庆", "auspicious festive mood"],
            ["庄重", "dignified solemn mood"],
            ["淡雅", "subtle elegant mood"],
            ["梦幻", "dreamlike atmosphere"],
        ],
    },
    {
        terms: [
            ["左侧", "main element placed on the left"],
            ["右侧", "main element placed on the right"],
            ["中央", "main element centered"],
            ["前景", "clear foreground layer"],
            ["中景", "middle-ground layer"],
            ["远景", "distant background layer"],
            ["俯视", "slightly top-down view"],
            ["近景", "close foreground framing"],
        ],
    },
];

function buildUserIntentKeywords(input) {
    const text = String(input || "").trim();
    if (!text) return "";

    const terms = [];
    for (const [pattern, phrase] of USER_INTENT_KEYWORDS) {
        if (pattern.test(text)) terms.push(phrase);
    }
    for (const group of USER_INTENT_TERM_GROUPS) {
        for (const [needle, phrase] of group.terms) {
            if (text.includes(needle)) terms.push(phrase);
        }
    }

    const ascii = text
        .replace(/[\u4e00-\u9fff]+/g, " ")
        .replace(/[，。！？；、]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (ascii && /[a-zA-Z]/.test(ascii)) terms.push(ascii);

    if (!terms.length && /[\u4e00-\u9fff]/.test(text)) {
        terms.push("poetic Chinese atmosphere from the user's note");
    }

    return safeJoin(dedupeTerms(terms));
}

const CONTENT_PRESETS = {
    landscape: {
        subject: "Chinese shanshui landscape, mountains, river, misty peaks, ancient pavilions, pine trees",
        must: "natural mountain-water hierarchy, readable horizon, elegant empty space",
    },
    birds: {
        subject: "Chinese flower-and-bird painting, birds on branches, blossoms, bamboo leaves",
        must: "delicate branch rhythm, bird silhouette clear, botanical details",
    },
    figure: {
        subject: "traditional Chinese figure painting, hanfu clothing, elegant posture",
        must: "human pose follows sketch gesture, graceful sleeve and robe flow",
    },
    flowers: {
        subject: "Chinese botanical painting, plum blossom, orchid, bamboo, chrysanthemum, peony or lotus",
        must: "clear floral structure, elegant stem direction, refined petal shapes",
    },
    fish: {
        subject: "traditional Chinese fish and insect painting, koi, goldfish, dragonfly or butterfly",
        must: "lively creature silhouette, water or leaf context, delicate natural movement",
    },
    architecture: {
        subject: "ancient Chinese architecture, pavilion, temple, curved bridge, garden rockery",
        must: "architectural perspective remains stable, roof lines clear, garden context",
    },
    cloud: {
        subject: "Chinese cloudscape, layered auspicious clouds and misty atmosphere",
        must: "cloud layers follow sketch flow, soft atmospheric depth",
    },
    flying: {
        subject: "Dunhuang flying apsaras, celestial ribbons flowing, mural aesthetics",
        must: "ribbons and body motion follow sketch direction, mural rhythm",
    },
    dragon: {
        subject: "Chinese dragon, dynamic movement in clouds and mist",
        must: "dragon body direction follows sketch curve, head and claws readable",
    },
};

const STYLE_PROFILES = {
    ink: {
        name: "Chinese ink wash xieyi",
        positive:
            "strict Chinese ink wash style, monochrome black ink and light gray wash, xieyi brush strokes, dry brush texture, soft ink diffusion, elegant negative space, restrained palette",
        difference:
            "style difference marker: mostly black-white-gray ink, visible brush energy, no decorative colors, no ceramic blue, no mural pigments",
        negative: ["photorealistic", "oil painting", "3d render", "neon colors", "blue-and-white ceramic pattern", "Dunhuang mural palette", "overly colorful"],
    },
    bluewhite: {
        name: "blue-and-white porcelain",
        positive:
            "strict blue-and-white porcelain style, cobalt blue lines on warm white ceramic ground, porcelain floral motif language, glaze texture, decorative border rhythm, crisp blue ornament",
        difference:
            "style difference marker: only cobalt blue and porcelain white, ceramic glaze feeling, ornamental blue patterns, not black ink wash",
        negative: ["multi-color palette", "black ink only", "Dunhuang ochre", "photorealistic", "oil brush texture", "red seal"],
    },
    dunhuang: {
        name: "Dunhuang cave mural",
        positive:
            "strict Dunhuang cave mural style, warm mineral pigments, ochre red, malachite green, lapis blue, bold decorative outlines, aged fresco texture, Buddhist mural atmosphere",
        difference:
            "style difference marker: warm ancient mural pigments and fresco texture, decorative outlines, not porcelain blue, not monochrome ink",
        negative: ["cyberpunk", "modern western outfit", "flat icon", "photographic", "pure monochrome ink", "porcelain glaze"],
    },
    gongbi: {
        name: "gongbi meticulous painting",
        positive:
            "strict gongbi meticulous painting, ultra-fine contour lines, precise controlled brushwork, delicate layered color wash, jewel-like details, clean edges",
        difference:
            "style difference marker: precise line art and fine color layers, not loose xieyi brushwork, not rough sketch",
        negative: ["rough sketch", "messy brushwork", "low detail", "impressionistic", "heavy ink splatter", "blurred contour"],
    },
    song: {
        name: "Song dynasty literati painting",
        positive:
            "strict Song dynasty literati painting, restrained subtle color, refined line economy, quiet poetic emptiness, misty distance, elegant scholarly taste",
        difference:
            "style difference marker: quiet restrained literati mood, sparse composition, subtle color, not ornate court style",
        negative: ["vibrant colors", "busy composition", "overdetailed", "gaudy ornament", "modern poster"],
    },
    court: {
        name: "imperial court color painting",
        positive:
            "strict imperial court painting, ornate meticulous details, balanced decorative composition, luxurious mineral colors, refined palace elegance",
        difference:
            "style difference marker: polished court elegance and rich color, more ornate than Song painting, more precise than ink wash",
        negative: ["rough", "sketchy", "unfinished", "plain monochrome only", "minimalist"],
    },
    ming: {
        name: "Ming dynasty blue-green landscape",
        positive:
            "strict Ming dynasty blue-green landscape style, mineral azurite and malachite pigments, refined linework, decorative mountain layers, elegant antique court-literati fusion",
        difference:
            "style difference marker: blue-green mineral landscape, crisp antique linework, brighter than Song painting, more historical than modern fusion",
        negative: ["pure monochrome ink", "porcelain glaze pattern", "Dunhuang fresco texture", "flat modern poster", "photographic"],
    },
    modern: {
        name: "modern Chinese fusion",
        positive:
            "modern Chinese fusion art, clean contemporary composition, traditional motifs translated into refined digital painting, bold but harmonious visual language",
        difference:
            "style difference marker: contemporary layout with traditional Chinese elements, not ancient mural, not strict historical painting",
        negative: ["medieval", "renaissance", "baroque", "cyberpunk neon", "western comic"],
    },
    calligraphy: {
        name: "calligraphic ink image",
        positive:
            "ink brush aesthetic image only, dynamic calligraphic brush rhythm, abstract ink momentum, bold confident stroke energy, no readable written characters",
        difference:
            "style difference marker: calligraphic stroke energy as visual rhythm, image only, not actual text or calligraphy words",
        negative: ["readable text", "Chinese characters", "typography", "rigid sans-serif", "photographic"],
    },
};

const GLOBAL_NEGATIVE = [
    "text",
    "any text",
    "watermark",
    "logo",
    "signature",
    "artist signature",
    "Chinese characters",
    "written characters",
    "words",
    "letters",
    "numbers",
    "typography",
    "caption",
    "label",
    "annotation",
    "banner",
    "stamp",
    "seal",
    "red seal stamp",
    "brand name",
    "subtitle",
    "title text",
    "overlay text",
    "embedded text",
    "low quality",
    "blurry",
    "out of focus",
    "deformed",
    "extra limbs",
    "mutated",
    "distorted perspective",
    "unreadable subject",
    "noisy",
    "jpeg artifacts",
    "cropped",
    "duplicate subject",
];

function normalizeNegativeInput(input) {
    if (!input) return [];
    if (Array.isArray(input)) return input.map((x) => String(x).trim()).filter(Boolean);
    return String(input)
        .split(/[,，;；\n]/)
        .map((x) => {
            const text = x.trim();
            const map = {
                "文字": "text",
                "水印": "watermark",
                "标志": "logo",
                "低清晰度": "low quality",
                "畸形": "deformed",
                "现代塑料感": "modern plastic feeling",
                "过度饱和": "over-saturated",
            };
            return map[text] || text;
        })
        .filter(Boolean);
}

function buildSemanticBlock(cap) {
    const keywords = Array.isArray(cap.keywords)
        ? cap.keywords
            .filter((item) => item && !hasCaptionStyleNoise(item))
            .map((item) => cleanCaptionSemantic(item, 120))
            .filter((item) => item && item.toLowerCase() !== "style")
        : [];
    return [
        cap.subject && `recognized subject from sketch: ${cleanCaptionSemantic(cap.subject)}`,
        cap.scene && `recognized scene from sketch: ${cleanCaptionSemantic(cap.scene)}`,
        cap.composition && `recognized composition from sketch: ${cleanCaptionSemantic(cap.composition)}`,
        cap.silhouette && `recognized silhouette: ${cleanCaptionSemantic(cap.silhouette)}`,
        cap.spatial_layout && `recognized spatial layout: ${cleanCaptionSemantic(cap.spatial_layout)}`,
        cap.line_density && `recognized line density: ${cleanCaptionSemantic(cap.line_density, 240)}`,
        keywords.length ? `recognized keywords: ${safeJoin(keywords)}` : null,
    ].filter(Boolean).join(". ");
}

export function buildSiliconFlowPrompt({ basePromptFromUI, content, style, caption, mode = "generate", uiNegative }) {
    const cap = caption || {};
    const contentPreset = CONTENT_PRESETS[content] || CONTENT_PRESETS.landscape;
    const styleProfile = STYLE_PROFILES[style] || STYLE_PROFILES.ink;
    const captionNeg = Array.isArray(cap.negative) ? cap.negative : [];
    const uiPrompt = buildUserIntentKeywords(basePromptFromUI);

    const sketchFidelity = [
        "TOP PRIORITY: preserve the user's sketch as the structural source of truth",
        "match the sketch composition, silhouette, subject count, pose, object placement, and relative proportions",
        "keep foreground, midground, background, left/right/center relationships from the sketch",
        "do not add unrelated subjects; if the sketch is simple, keep the final painting simple",
        "make the result clearly recognizable as a polished version of the user's sketch",
    ].join(". ");

    const styleSeparation = [
        `SELECTED STYLE: ${styleProfile.name}`,
        styleProfile.positive,
        styleProfile.difference,
        "the selected style must be visually obvious at first glance",
        "if user text or caption conflicts with the selected style, selected style wins",
    ].join(". ");

    const contentBlock = [
        `SELECTED SUBJECT CATEGORY: ${contentPreset.subject}`,
        `subject requirement: ${contentPreset.must}`,
    ].join(". ");

    const quality = mode === "enhance"
        ? "enhancement mode: refine details, improve line clarity, strengthen composition, preserve all original subject positions"
        : "generation mode: clean composition, high quality, coherent artwork, refined traditional Chinese visual language";

    const positivePrompt = [
        sketchFidelity,
        buildSemanticBlock(cap),
        contentBlock,
        styleSeparation,
        uiPrompt && `user intention keywords, secondary to sketch structure: ${uiPrompt}`,
        "hard rule: pure visual artwork only, no text, no watermark, no logo, no signature, no seal",
        quality,
    ].filter(Boolean).join(". ");

    const mergedNeg = dedupeTerms([
        ...GLOBAL_NEGATIVE,
        ...(styleProfile.negative || []),
        ...captionNeg,
        ...normalizeNegativeInput(uiNegative),
    ]);

    return {
        positivePrompt: cleanPromptText(positivePrompt),
        negativePrompt: cleanPromptText(safeJoin(mergedNeg), 2500),
    };
}
