/**
 * 结构体检（Critic）
 *
 * 先跑确定性 CV 指标，再决定是否值得调用 VLM 做语义复核。
 * 评分只衡量“结构是否守住”，不衡量“画得好不好看”。
 */

export const STYLE_PROFILES = {
    ink: {
        label: "水墨",
        weights: { lineFollow: 0.55, drift: 0.2, whitespace: 0.15, palette: 0.1 },
        thresholds: { lineFollow: 0.45, drift: 0.07, whitespace: 0.45, layoutSim: 0.7, aspectDelta: 0.06 },
        palette: { maxWarmRatio: 0.5, maxMeanSat: 0.55 }
    },
    bluewhite: {
        label: "青花",
        weights: { lineFollow: 0.33, drift: 0.17, whitespace: 0.15, palette: 0.35 },
        thresholds: { lineFollow: 0.45, drift: 0.07, whitespace: 0.5, layoutSim: 0.7, aspectDelta: 0.05 },
        palette: { minBlueRatio: 0.008, maxWarmRatio: 0.35 }
    },
    calligraphy: {
        label: "书法",
        weights: { glyph: 0.6, edgeIoU: 0.15, layoutSim: 0.1, drift: 0.05, palette: 0.1 },
        thresholds: { glyphIoU: 0.95, edgeIoU: 0.55, layoutSim: 0.85, drift: 0.04, aspectDelta: 0.03 },
        palette: { maxMeanSat: 0.45 }
    },
    dunhuang: {
        label: "敦煌",
        weights: { lineFollow: 0.38, drift: 0.2, whitespace: 0.2, palette: 0.22 },
        thresholds: { lineFollow: 0.42, drift: 0.08, whitespace: 0.45, layoutSim: 0.68, aspectDelta: 0.06 },
        palette: { minWarmRatio: 0.06 }
    },
    gongbi: {
        label: "工笔",
        weights: { lineFollow: 0.5, drift: 0.15, whitespace: 0.2, palette: 0.15 },
        thresholds: { lineFollow: 0.5, drift: 0.06, whitespace: 0.55, layoutSim: 0.72, aspectDelta: 0.05 },
        palette: { maxMeanSat: 0.6 }
    }
};

const DEFAULT_PROFILE = STYLE_PROFILES.ink;
export const ACCEPT_SCORE = 0.62;

export function getProfile(style) {
    return STYLE_PROFILES[style] || DEFAULT_PROFILE;
}

function norm(value, min, max) {
    if (!Number.isFinite(value)) return 0;
    if (max === min) return 0;
    return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function paletteScore(metrics, profile) {
    const color = metrics.color || {};
    const rules = profile.palette || {};
    const parts = [];
    if (Number.isFinite(rules.minBlueRatio)) {
        parts.push(norm(color.blueRatio, rules.minBlueRatio * 0.5, rules.minBlueRatio * 2));
    }
    if (Number.isFinite(rules.maxWarmRatio)) {
        parts.push(1 - norm(color.warmRatio, rules.maxWarmRatio * 0.6, rules.maxWarmRatio * 1.4));
    }
    if (Number.isFinite(rules.maxMeanSat)) {
        parts.push(1 - norm(color.meanSat, rules.maxMeanSat * 0.7, rules.maxMeanSat * 1.3));
    }
    if (Number.isFinite(rules.minWarmRatio)) {
        parts.push(norm(color.warmRatio, rules.minWarmRatio * 0.4, rules.minWarmRatio * 2));
    }
    if (!parts.length) return 1;
    return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/**
 * @returns {{score:number, verdict:'accept'|'repair', defects:Array, breakdown:Object}}
 */
export function evaluateCandidate({ metrics, style = "ink", contract }) {
    const profile = getProfile(style);
    const t = profile.thresholds;
    const defects = [];

    const push = (code, message, value, threshold, severity = "soft") =>
        defects.push({ code, message, value, threshold, severity });

    if (metrics.aspectDelta > t.aspectDelta) {
        push("ASPECT", `画幅比例偏移 ${(metrics.aspectDelta * 100).toFixed(1)}%，构图可能被裁切`, metrics.aspectDelta, t.aspectDelta, "hard");
    }
    if (Number.isFinite(t.glyphIoU) && metrics.glyphIoU < t.glyphIoU) {
        push("GLYPH", `字形重合度 ${(metrics.glyphIoU * 100).toFixed(1)}%，汉字被改写`, metrics.glyphIoU, t.glyphIoU, "hard");
    }
    if (Number.isFinite(t.lineFollow) && metrics.lineFollow < t.lineFollow) {
        push("LINE_LOW", `线跟随度 ${(metrics.lineFollow * 100).toFixed(0)}%，成画没有沿着原作骨架走`, metrics.lineFollow, t.lineFollow, "soft");
    }
    if (metrics.drift > t.drift) {
        push("DRIFT", `画面重心漂移 ${(metrics.drift * 100).toFixed(1)}%`, metrics.drift, t.drift, "soft");
    }
    if (metrics.whitespace < t.whitespace) {
        push("WHITESPACE_LOST", `留白保持 ${(metrics.whitespace * 100).toFixed(0)}%，画面被填满`, metrics.whitespace, t.whitespace, "soft");
    }
    if (Number.isFinite(t.layoutSim) && metrics.layoutSim < t.layoutSim) {
        push("LAYOUT_SHIFT", `布局相似度 ${(metrics.layoutSim * 100).toFixed(0)}%，主体可能移位`, metrics.layoutSim, t.layoutSim, "soft");
    }
    if (style !== "calligraphy" && Number.isFinite(metrics.lineResidue) && metrics.lineResidue > 0.6) {
        push("LINE_RESIDUE", `线稿残留 ${(metrics.lineResidue * 100).toFixed(0)}%，笔墨没有盖住铅笔线`, metrics.lineResidue, 0.6, "soft");
    }
    if (Number.isFinite(t.edgeIoU) && metrics.edgeIoU < t.edgeIoU) {
        push("EDGE_LOW", `轮廓重合度 ${(metrics.edgeIoU * 100).toFixed(0)}%`, metrics.edgeIoU, t.edgeIoU, "soft");
    }
    const minBlue = profile.palette?.minBlueRatio;
    if (Number.isFinite(minBlue) && (metrics.color?.blueRatio ?? 0) < minBlue) {
        push("PALETTE_BLUE", "钴蓝色域不足，青花特征丢失", metrics.color?.blueRatio ?? 0, minBlue, "hard");
    }

    const components = {
        lineFollow: norm(metrics.lineFollow, 0.15, 0.75),
        drift: 1 - norm(metrics.drift, 0.03, 0.15),
        whitespace: norm(metrics.whitespace, 0.35, 0.85),
        layoutSim: norm(metrics.layoutSim, 0.55, 0.95),
        edgeIoU: norm(metrics.edgeIoU, 0.1, 0.7),
        palette: paletteScore(metrics, profile),
        glyph: norm(metrics.glyphIoU, 0.5, 1)
    };

    let score = 0;
    let weightSum = 0;
    const breakdown = {};
    for (const [key, weight] of Object.entries(profile.weights)) {
        if (!Number.isFinite(components[key]) || weight <= 0) continue;
        score += components[key] * weight;
        weightSum += weight;
        breakdown[key] = Math.round(components[key] * weight * 1000) / 1000;
    }
    score = weightSum > 0 ? score / weightSum : 0;

    const hardFail = defects.some(d => d.severity === "hard");
    const verdict = hardFail || score < ACCEPT_SCORE ? "repair" : "accept";

    return {
        score: Math.round(score * 1000) / 1000,
        verdict,
        defects,
        breakdown
    };
}

/** 把缺陷翻译成可直接执行的返修指令（只允许局部修改）。 */
export function buildRepairInstruction(defects, contract) {
    if (!defects?.length) return "";
    const parts = [];
    for (const defect of defects) {
        switch (defect.code) {
            case "ASPECT":
                parts.push("按原作画幅重新输出，不要裁切或拉伸主体");
                break;
            case "LINE_LOW":
                parts.push("沿原作的主要线条重新组织墨色，让轮廓与结构线落在原作位置上");
                break;
            case "LAYOUT_SHIFT":
                parts.push("把主体放回原作位置，保持相对大小与画面重心");
                break;
            case "DRIFT":
                parts.push("把画面重量移回原作位置，避免主体整体偏移");
                break;
            case "WHITESPACE_LOST":
                parts.push("恢复画面留白，不要用纹理、云雾或墨色填满空白区域");
                break;
            case "EDGE_LOW":
                parts.push("加强主体轮廓与关键结构线，使形状更接近原作");
                break;
            case "LINE_RESIDUE":
                parts.push("用笔墨覆盖原作的铅笔线条，位置不变但不要留下生硬细线");
                break;
            case "GLYPH":
                parts.push("不得重写任何汉字，保持原字形、笔顺与行列布局");
                break;
            case "PALETTE_BLUE":
                parts.push("只使用钴蓝与白釉色阶，去掉其它彩色");
                break;
            default:
                break;
        }
    }
    const subjects = (contract?.subjects || []).map(s => s.name).join("、");
    if (subjects) parts.push(`必须保留的主体：${subjects}`);
    return parts.join("；");
}
