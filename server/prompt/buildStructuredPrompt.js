/**
 * 把画意契约渲染成生成提示词。
 *
 * 与旧版“一段风格描述”的区别：
 * - 硬约束前置，模型先看到“不能动什么”；
 * - 禁止项显式列出，而不是只塞在负向词里；
 * - 明确优先级：结构 > 风格 > 装饰。
 */

const STYLE_TEXT = {
    ink: "中国水墨，墨分五色，笔触自然，留白透气，不出现照片质感与金粉光泽",
    bluewhite: "青花瓷风格，只用钴蓝与白釉色阶，纹样清晰连续，边饰完整",
    dunhuang: "敦煌壁画风格，矿物色与古朴壁面肌理，线描连贯，色彩关系贴近壁画",
    gongbi: "工笔风格，细线勾勒，层层淡彩，轮廓线不断裂",
    song: "宋画风格，设色含蓄，细节精雅，构图疏朗",
    court: "宫廷绘画风格，设色端雅，纹饰精细",
    modern: "现代国风，线面简练，色彩克制",
    calligraphy: "书法原作润饰，保留原有字形、笔锋、连笔与墨色节奏",
    ming: "明式审美，结构简洁，材质温润"
};

const STYLE_FIDELITY_NOTE = {
    calligraphy: "本任务禁止重写文字：任何字符都不得增删或改写。",
    bluewhite: "本任务必须保持钴蓝色域，禁止出现红、绿、黄等彩色。",
    ink: "本任务优先保持墨色层次与留白，不要用纹理填满画面。"
};

function pct(v) {
    return Math.round(v * 100);
}

export function buildStructuredPrompt({ contract, style = "ink", userPrompt = "" }) {
    const lines = [];
    lines.push("【任务】以输入图片为原作进行风格转绘。只改变表现方式，不改变画面结构，不另起一幅画。");
    lines.push("把原作的线条转译成毛笔笔触与墨色层次：线条位置与走向不变，但不要保留生硬的铅笔线、纯黑细线或矢量边。");
    lines.push("【优先级】结构保真 > 风格表现 > 装饰细节。");

    const subjects = contract?.subjects || [];
    if (subjects.length) {
        lines.push("【必须保留】");
        for (const s of subjects) {
            const [x, y, w, h] = s.bbox || [0, 0, 1, 1];
            lines.push(
                `- ${s.name}：数量 ${s.count}，位置 x ${pct(x)}%–${pct(x + w)}%、y ${pct(y)}%–${pct(y + h)}%，` +
                `占画面约 ${pct(s.scale ?? 0.1)}%，轮廓与姿态保持不变。`
            );
        }
    }

    const relations = contract?.relations || [];
    if (relations.length) {
        const label = { above: "在……上方", below: "在……下方", left_of: "在……左侧", right_of: "在……右侧" };
        const byId = new Map(subjects.map(s => [s.id, s.name]));
        lines.push("【空间关系】");
        for (const r of relations) {
            const a = byId.get(r.a) || r.a;
            const b = byId.get(r.b) || r.b;
            lines.push(`- ${a} ${label[r.type] || r.type} ${b}，关系不得调换。`);
        }
    }

    const spaces = contract?.negative_space || [];
    if (spaces.length) {
        lines.push("【留白】");
        for (const ns of spaces) {
            if (!ns.keep_empty) continue;
            lines.push(`- ${ns.region}保持留白，不要用云雾、纹理或墨色填满。`);
        }
    }

    if (contract?.forbid?.length) {
        lines.push("【禁止】");
        for (const item of contract.forbid) lines.push(`- ${item}。`);
    }

    lines.push(`【风格】${STYLE_TEXT[style] || STYLE_TEXT.ink}。`);
    if (STYLE_FIDELITY_NOTE[style]) lines.push(`【硬性】${STYLE_FIDELITY_NOTE[style]}`);
    if (contract?.canvas?.width) {
        lines.push(`【画幅】保持 ${contract.canvas.width}×${contract.canvas.height} 比例，不裁切、不拉伸。`);
    }
    lines.push(`【结构权重】${pct(contract?.fidelity?.structure ?? 0.65)}%：结构变化越小越好。`);
    if (String(userPrompt || "").trim()) {
        lines.push(`【用户补充】${String(userPrompt).trim()}`);
    }
    lines.push("只输出图像，不要出现文字、水印或标志。");

    return lines.join("\n");
}

export function buildStructuredNegative(userNegative = "") {
    const base = "低清晰度，模糊，主体变形，笔画缺失，错误字形，额外标志，水印，文字";
    return String(userNegative || "").trim() ? `${String(userNegative).trim()}，${base}` : base;
}
