/**
 * 画意契约（Composition Contract）
 *
 * 把“用户想要什么 + 必须保留什么”写成机器可校验的 JSON，
 * 而不是一段散文提示词。契约是后续度量、择优、返修的唯一定义来源。
 */

const STYLE_FIDELITY = {
    calligraphy: 0.92,
    bluewhite: 0.78,
    dunhuang: 0.68,
    gongbi: 0.75,
    song: 0.72,
    court: 0.72,
    ming: 0.7,
    ink: 0.65,
    modern: 0.55
};

const STYLE_NAME = {
    calligraphy: "书法",
    bluewhite: "青花",
    dunhuang: "敦煌",
    gongbi: "工笔",
    song: "宋画",
    court: "宫廷",
    ming: "明式",
    ink: "水墨",
    modern: "现代国风"
};

const COMMON_FORBID = [
    "新增人物",
    "改变主体数量",
    "满构图、填满留白",
    "高饱和撞色",
    "现代元素与建筑",
    "文字、水印、标志"
];

const STYLE_FORBID = {
    calligraphy: ["改写字形", "把行书变成印刷体", "增删字符", "改变行列布局"],
    bluewhite: ["出现红绿彩", "丢失钴蓝色域", "纹样断裂"],
    ink: ["出现金粉塑料光泽", "主体变成照片质感"],
    dunhuang: ["套用宣纸晕染", "过强三维光效", "拼接其他文化元素"],
    gongbi: ["线条断裂", "色块溢出轮廓"]
};

const REGION_NAMES = [
    ["左上", "中上", "右上"],
    ["左中", "中心", "右中"],
    ["左下", "中下", "右下"]
];

function round(v, digits = 3) {
    const p = 10 ** digits;
    return Math.round(v * p) / p;
}

function regionOfCell(index, grid = 4) {
    if (grid !== 4) return `区域${index + 1}`;
    const row = Math.floor(index / 4);
    const col = index % 4;
    return REGION_NAMES[Math.min(2, Math.floor((row + 0.5) * 3 / 4))][Math.min(2, Math.floor((col + 0.5) * 3 / 4))];
}

function subjectNameFromCaption(caption, index) {
    const keywords = Array.isArray(caption?.keywords) ? caption.keywords.filter(Boolean) : [];
    if (index === 0 && caption?.subject) return String(caption.subject).slice(0, 40);
    if (keywords[index - 1]) return String(keywords[index - 1]).slice(0, 40);
    return `主体${index + 1}`;
}

function relationBetween(a, b) {
    const [ax, ay] = a.centroid;
    const [bx, by] = b.centroid;
    const dx = bx - ax;
    const dy = by - ay;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right_of" : "left_of";
    return dy > 0 ? "below" : "above";
}

/**
 * 由草图结构 + 识图结果生成契约（确定性、无额外模型调用）。
 * 结构框来自本地 CV 的连通域，比让 VLM 猜 bbox 更可靠。
 */
export function buildContract({ caption, analysis, style = "ink", userText = "", options = {} }) {
    const fidelity = Number.isFinite(options.fidelity)
        ? Math.min(1, Math.max(0, options.fidelity))
        : STYLE_FIDELITY[style] ?? 0.65;

    const minArea = 0.0015;
    const candidates = (analysis?.components || []).filter(c => c.area / (analysis.width * analysis.height) >= minArea);
    const chosen = candidates.slice(0, options.maxSubjects ?? 3);

    const subjects = chosen.map((c, index) => ({
        id: `s${index + 1}`,
        name: subjectNameFromCaption(caption, index),
        count: 1,
        must_keep: true,
        bbox: [round(c.bbox[0]), round(c.bbox[1]), round(c.bbox[2]), round(c.bbox[3])],
        anchor: [round(c.centroid[0]), round(c.centroid[1])],
        scale: round(c.area / (analysis.width * analysis.height), 4)
    }));

    const relations = [];
    for (let i = 0; i < subjects.length; i++) {
        for (let j = i + 1; j < subjects.length; j++) {
            relations.push({ a: subjects[i].id, b: subjects[j].id, type: relationBetween(chosen[i], chosen[j]) });
        }
    }

    const negativeSpace = [];
    if (analysis?.grid) {
        const cells = [];
        for (let i = 0; i < analysis.grid.length; i++) {
            if (analysis.grid[i] <= 0.02) cells.push(i);
        }
        const byRegion = new Map();
        for (const cell of cells) {
            const name = regionOfCell(cell, 4);
            byRegion.set(name, (byRegion.get(name) || 0) + 1);
        }
        for (const [region, count] of byRegion) {
            negativeSpace.push({ region, ratio: round(count / 16), keep_empty: true });
        }
    }

    return {
        contract_version: "1.0",
        style,
        style_name: STYLE_NAME[style] || style,
        canvas: {
            width: analysis?.width || 0,
            height: analysis?.height || 0,
            aspect: analysis ? round(analysis.width / analysis.height, 3) : 0,
            orientation: analysis && analysis.height >= analysis.width ? "portrait" : "landscape"
        },
        subjects,
        relations,
        negative_space: negativeSpace,
        fidelity: { structure: round(fidelity), style: round(1 - fidelity) },
        allow: ["纸纹、装裱与题跋位置的调整", "在不改变主体位置的前提下增加淡墨层次"],
        forbid: [...COMMON_FORBID, ...(STYLE_FORBID[style] || [])],
        user_intent: String(userText || caption?.scene || "").slice(0, 200),
        source: caption?.subject ? "caption+cv" : "cv"
    };
}

/** 允许前端/模型回传契约，但必须过一遍归一化，避免越界值。 */
export function normalizeContract(input, fallback) {
    const base = fallback || {};
    const contract = input && typeof input === "object" ? input : {};
    const clamp01 = (v, d) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : d);
    return {
        ...base,
        ...contract,
        fidelity: {
            structure: clamp01(contract?.fidelity?.structure, base?.fidelity?.structure ?? 0.65),
            style: clamp01(contract?.fidelity?.style, base?.fidelity?.style ?? 0.35)
        },
        subjects: Array.isArray(contract?.subjects) && contract.subjects.length
            ? contract.subjects.slice(0, 5).map((s, i) => ({
                id: String(s?.id || `s${i + 1}`),
                name: String(s?.name || `主体${i + 1}`).slice(0, 40),
                count: Math.max(1, Math.min(9, Number(s?.count) || 1)),
                must_keep: s?.must_keep !== false,
                bbox: Array.isArray(s?.bbox) && s.bbox.length === 4
                    ? s.bbox.map(v => clamp01(v, 0))
                    : [0, 0, 1, 1],
                anchor: Array.isArray(s?.anchor) && s.anchor.length === 2
                    ? s.anchor.map(v => clamp01(v, 0.5))
                    : [0.5, 0.5],
                scale: clamp01(s?.scale, 0.2)
            }))
            : base?.subjects || []
    };
}

/** 给界面用的中文摘要，让“契约”可见、可改。 */
export function describeContract(contract) {
    if (!contract) return [];
    const lines = [];
    for (const s of contract.subjects || []) {
        const x = Math.round(s.bbox[0] * 100);
        const y = Math.round(s.bbox[1] * 100);
        const w = Math.round(s.bbox[2] * 100);
        const h = Math.round(s.bbox[3] * 100);
        lines.push(`保留 ${s.name}：数量 ${s.count}，位于 x ${x}%–${x + w}%、y ${y}%–${y + h}%`);
    }
    for (const ns of contract.negative_space || []) {
        lines.push(`${ns.region}保持留白（约 ${Math.round(ns.ratio * 100)}% 画面）`);
    }
    lines.push(`结构保真权重 ${Math.round(contract.fidelity.structure * 100)}%，风格权重 ${Math.round(contract.fidelity.style * 100)}%`);
    return lines;
}
