/**
 * 叙事导演：把「母题」变成 5–10 秒可执行的单镜头事件脚本。
 *
 * 设计原则：
 * 1. 只做一个动作 + 一个反应，时长上限 10 秒。
 * 2. 事件写进时间轴，而不是堆形容词。
 * 3. 时长变化时，节拍按比例重排，提示词里的秒数同步更新。
 */
import motifData from "../../shared/motifs.json" with { type: "json" };

export const MIN_DURATION = 5;
export const MAX_DURATION = 10;

function clampDuration(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(n)));
}

function seconds(value) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function listMotifs() {
    return (motifData.motifs || []).map(motif => ({
        id: motif.id,
        label: motif.label,
        meaning: motif.meaning,
        summary: motif.summary,
        suitable: motif.suitable,
        default_duration: motif.default_duration,
        beats: motif.beats.map(beat => ({ title: beat.title, line: beat.line })),
        audio: motif.audio,
        risk_notes: motif.risk_notes || []
    }));
}

export function getMotif(id) {
    const motif = (motifData.motifs || []).find(item => item.id === id);
    if (!motif) return null;
    return motif;
}

/** 把 at 比例换算成秒，最后一段收在总时长上。 */
export function buildBeats(motif, duration) {
    const marks = motif.beats.map(beat => beat.at);
    return motif.beats.map((beat, index) => {
        const start = Math.round(marks[index] * duration * 10) / 10;
        const next = index + 1 < marks.length ? marks[index + 1] : 1;
        const end = index + 1 < marks.length
            ? Math.round(next * duration * 10) / 10
            : duration;
        return {
            index,
            start,
            end,
            title: beat.title,
            line: beat.line,
            time: `${seconds(start)}–${seconds(end)} 秒`
        };
    });
}

export function buildNarrativePrompt({ motif, beats, duration }) {
    const lines = [
        `单一连续镜头，总时长 ${duration} 秒。保持原画的${motif.medium}媒介、纸张质感、画幅、构图与主体位置不变。`,
        `画面：${motif.scene}`,
        ...beats.map(beat => `${beat.time}：${beat.line}。`),
        `${motif.camera}。`,
        motif.forbid
    ];
    return lines.join("\n");
}

/**
 * @param {object} params
 * @param {string} params.motifId
 * @param {number} [params.duration] 5–10 秒
 * @param {object} [params.caption] 首帧识别结果（可选，用于补充画面描述）
 * @param {string} [params.wish] 用户的一句话愿望
 */
export function planStory({ motifId, duration, caption, wish = "" } = {}) {
    const motif = getMotif(motifId) || (motifData.motifs || [])[0];
    if (!motif) {
        const err = new Error("母题库为空");
        err.status = 500;
        throw err;
    }

    const finalDuration = clampDuration(duration, motif.default_duration);
    const beats = buildBeats(motif, finalDuration);
    let prompt = buildNarrativePrompt({ motif, beats, duration: finalDuration });

    const scene = String(caption?.scene || "").trim();
    if (scene) {
        prompt += `\n首帧补充：${scene.slice(0, 120)}。`;
    }
    if (String(wish || "").trim()) {
        prompt += `\n情绪：${String(wish).trim().slice(0, 60)}。不要因此新增物件。`;
    }

    return {
        motif_id: motif.id,
        label: motif.label,
        meaning: motif.meaning,
        summary: motif.summary,
        duration: finalDuration,
        beats,
        prompt,
        negative: motif.negative,
        audio: motif.audio,
        risk_notes: motif.risk_notes || [],
        camera: motif.camera,
        source: "motif-library"
    };
}
