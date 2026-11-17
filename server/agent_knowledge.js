const DRAW_INTENT_RE = /(帮我画|请画|画一幅|画一张|绘制|生成一幅|生成一张|生成图片|作一幅|来一幅|我想看一幅|我想看一张)/;

function normalizeText(text) {
    return String(text || "")
        .trim()
        .replace(/\s+/g, "");
}

export function getLatestUserText(messages = []) {
    const latest = [...messages].reverse().find(message => message?.role === "user");
    return String(latest?.content || "").trim();
}

export function isDrawRequest(text) {
    return DRAW_INTENT_RE.test(String(text || ""));
}

const DRAW_TERM_RULES = [
    [/中国结|红结|同心结|盘长结|如意结/, "Chinese knot, auspicious braided red cord, symmetrical woven structure"],
    [/红色|大红|朱红|红绳|红线/, "rich cinnabar red color, festive Chinese red accent"],
    [/祥云|云纹|如意云/, "auspicious cloud motifs, soft ruyi cloud pattern"],
    [/如意/, "ruyi ornament motif, graceful auspicious curves"],
    [/苏绣|刺绣|丝线|绣/, "Suzhou embroidery, silk thread texture, delicate needlework"],
    [/青花|瓷|瓷盘|青花瓷/, "blue-and-white porcelain ornament, cobalt blue linework on warm white ceramic"],
    [/剪纸|窗花|红纸/, "Chinese paper cutting, red paper, hollow carved folk patterns"],
    [/脸谱|京剧/, "Peking opera facial mask pattern, bold symbolic red black white colors"],
    [/书法|兰亭|行书|草书|楷书|隶书/, "calligraphic brush rhythm, image-only ink strokes, no readable characters"],
    [/山水|水墨|云山|远山|江南|亭台|小桥/, "Chinese ink wash shanshui landscape, misty mountains, river, pavilion and elegant negative space"],
    [/敦煌|飞天|壁画|飘带/, "Dunhuang mural style, mineral pigments, flowing ribbons, aged fresco texture"],
    [/龙|腾龙/, "Chinese dragon silhouette, coiling body, clouds and mist"],
    [/凤|凤凰/, "Chinese phoenix motif, elegant feather rhythm"],
    [/鱼|金鱼|锦鲤|池塘|荷塘/, "koi or goldfish in a quiet pond, lotus leaves, soft water reflections"],
    [/荷花|莲花|荷叶|莲叶/, "lotus flowers and lotus leaves, graceful botanical composition"],
    [/牡丹/, "peony bloom, refined petals, elegant botanical detail"],
    [/花鸟|鸟|雀|枝头/, "flower-and-bird painting, bird silhouette on branch, delicate blossoms"],
    [/灯笼|花灯|宫灯/, "traditional lantern, warm glow, decorative folk pattern"],
    [/宫廷|宫殿|楼阁|亭/, "ancient Chinese palace or pavilion architecture, stable roof lines"],
    [/牛皮|雕刻|影偶|皮影|皮影戏/, "Chinese shadow puppet style, carved leather silhouette, theatrical lighting"],
    [/生肖|牛|马|虎|兔|蛇|羊|猴|鸡|狗|猪|鼠/, "Chinese zodiac folk motif, auspicious animal silhouette, traditional festival ornament"],
];

const DRAW_STYLE_RULES = [
    [/中国结|红结|同心结|盘长结|如意结/, {
        cn: "中国结",
        craft: "红绳编结、对称盘绕、祥云如意",
        en: "traditional Chinese knot craft, woven red cord, symmetrical auspicious ornament, tassel details"
    }],
    [/苏绣|刺绣|丝线|绣/, {
        cn: "苏绣",
        craft: "丝线光泽、细密针脚、江南雅韵",
        en: "Suzhou embroidery aesthetic, luminous silk threads, delicate needlework texture, soft Jiangnan elegance"
    }],
    [/青花|瓷|瓷盘|青花瓷/, {
        cn: "青花瓷",
        craft: "钴蓝线描、白瓷留白、釉面温润",
        en: "blue-and-white porcelain style, cobalt blue linework, warm white ceramic glaze, refined porcelain ornament"
    }],
    [/剪纸|窗花|红纸/, {
        cn: "剪纸",
        craft: "红纸镂空、对称纹样、民间节庆",
        en: "Chinese paper cutting style, red paper cutout, hollow carved folk pattern, crisp symmetrical silhouette"
    }],
    [/脸谱|京剧/, {
        cn: "京剧脸谱",
        craft: "强烈对称、朱红墨黑、戏曲张力",
        en: "Peking opera mask style, bold symmetrical facial pattern, cinnabar red and ink black contrast"
    }],
    [/书法|兰亭|行书|草书|楷书|隶书/, {
        cn: "书法墨韵",
        craft: "笔势骨力、飞白墨痕、不可读文字化",
        en: "calligraphic ink rhythm, expressive brush energy, abstract non-readable strokes, rice paper texture"
    }],
    [/山水|水墨|云山|远山|江南|亭台|小桥/, {
        cn: "水墨山水",
        craft: "云山留白、皴染层次、远近虚实",
        en: "Chinese ink wash shanshui painting, misty mountain layers, elegant negative space, soft ink diffusion"
    }],
    [/敦煌|飞天|壁画|飘带/, {
        cn: "敦煌壁画",
        craft: "矿物色、飘带飞动、古壁画肌理",
        en: "Dunhuang mural style, mineral pigments, flowing ribbons, aged fresco texture, luminous warm palette"
    }],
    [/皮影|牛皮|影偶|雕刻/, {
        cn: "皮影",
        craft: "牛皮雕刻、透光剪影、戏台灯影",
        en: "Chinese shadow puppet craft, carved translucent leather silhouette, theatrical backlight, folk ornament"
    }],
];

function dedupeTerms(items) {
    const seen = new Set();
    return items.filter((item) => {
        const key = String(item || "").toLowerCase().trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function cleanDrawRequest(text) {
    return String(text || "")
        .replace(DRAW_INTENT_RE, " ")
        .replace(/\[DRAW:\s*[\s\S]*?\]/gi, " ")
        .replace(/[。！？!?；;]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
}

function getDrawStyle(text) {
    for (const [pattern, style] of DRAW_STYLE_RULES) {
        if (pattern.test(text)) return style;
    }
    return {
        cn: "国风非遗",
        craft: "传统纹样、手作质感、宣纸留白",
        en: "Chinese intangible heritage inspired artwork, refined folk craft details, handmade texture"
    };
}

export function buildDrawPromptFromUser(text) {
    const raw = cleanDrawRequest(text);
    const style = getDrawStyle(raw);
    const terms = [];
    for (const [pattern, phrase] of DRAW_TERM_RULES) {
        if (pattern.test(raw)) terms.push(phrase);
    }
    if (!terms.length) {
        terms.push("traditional Chinese intangible heritage artwork, refined folk craft subject");
    }

    const subject = dedupeTerms([style.en, ...terms]).join(", ");
    return [
        `Main subject and craft: ${subject}`,
        raw ? `User intention: ${raw}` : "",
        "single clear focal subject, composition follows the requested object and cultural motif",
        "elegant Chinese composition, centered and readable silhouette, balanced negative space",
        "refined handcrafted texture, museum quality, soft rice paper background, delicate traditional color harmony",
        "polished Chinese illustration quality, detailed but not cluttered, no unrelated modern objects",
        "pure visual artwork only, no text, no watermark, no logo, no signature, no readable characters"
    ].filter(Boolean).join(". ");
}

export function buildDrawSummaryFromUser(text) {
    const raw = cleanDrawRequest(text);
    const style = getDrawStyle(raw);
    const subject = raw || style.cn;
    return [
        `小生已接住这幅“${subject}”的画意。`,
        `这次会按“${style.cn}”来取势，重点放在${style.craft}，画面保持主体清楚、留白干净。`,
        "我先让云端作画，若稍有排队，也会把结果补回当前对话。"
    ].join("\n");
}

export function getLocalHeritageAnswer(text) {
    const normalized = normalizeText(text);

    if (/脸谱/.test(normalized) && /红/.test(normalized) && /黑/.test(normalized)) {
        return [
            "京剧脸谱的颜色是人物性格的视觉密码。",
            "",
            "红色多代表忠勇、正直、赤胆忠心，典型人物是关羽。它让观众一眼感到人物可靠、有义气、重承诺。",
            "",
            "黑色多代表刚正、粗犷、豪迈或铁面无私，典型人物有包拯、张飞。黑脸常给人端正、威严、敢直言的印象。",
            "",
            "用于创作时，可以抓住“红脸忠义、黑脸刚正”的对比，用对称脸谱、粗黑线条、朱红与墨黑形成强烈戏曲张力。"
        ].join("\n");
    }

    if (/剪纸/.test(normalized)) {
        return [
            "中国剪纸起源很早，成熟于民间节庆、婚嫁、祭祀和日常装饰之中，是把生活愿望剪成图案的艺术。",
            "",
            "它的工艺核心是“以刀代笔、镂空成像”：线线相连、面面相扣，既要剪得精细，也要让整体图案不断裂。",
            "",
            "审美上，剪纸常用红色表达喜庆与祝福，常见题材有花鸟、鱼莲、娃娃、生肖、福字和吉祥纹样。",
            "",
            "创作关键词：红纸、镂空、对称构图、窗花、吉祥纹样、莲鱼寓意、民间节庆。"
        ].join("\n");
    }

    if (/苏绣|双面绣/.test(normalized)) {
        return [
            "苏绣以细腻、雅洁、针法丰富著称，讲究“平、齐、细、密、匀、顺、和、光”。",
            "",
            "双面绣的神奇之处在于正反两面都能成像，甚至可以做到两面异色、异形、异稿。绣工需要把线头、走针和色阶都隐藏得极精巧。",
            "",
            "它不像单纯复制图案，更像用丝线重新塑造光影。花鸟、金鱼、猫、仕女等题材最能体现它的透明感和层次。",
            "",
            "创作关键词：丝线光泽、细密针脚、双面成像、柔和设色、江南雅韵。"
        ].join("\n");
    }

    if (/青花|景德镇|瓷/.test(normalized)) {
        return [
            "青花瓷以白地蓝花为主要特征，先用含钴颜料在瓷胎上绘纹，再罩透明釉高温烧成。",
            "",
            "景德镇青花常见缠枝莲、牡丹、云龙、海水、如意、卷草等纹样。花纹不只是装饰，也常寄托富贵、清雅、连绵生发与吉祥如意。",
            "",
            "它的美在“蓝白之间”：色彩克制，层次却丰富；线条清爽，器物气质温润。",
            "",
            "创作关键词：钴蓝、白瓷、缠枝花、莲纹、如意云头、留白、釉面光泽。"
        ].join("\n");
    }

    if (/中国结|盘长结|同心结/.test(normalized)) {
        return [
            "中国结以一根绳线盘绕编结，讲究连续不断、首尾相连，因此常寓意团圆、平安、吉祥和长久。",
            "",
            "盘长结象征连绵不绝，同心结常用于表达情感相连，如意结则带有顺遂圆满的祝愿。",
            "",
            "它的审美特点是对称、秩序、节奏和红色喜庆感，既是装饰品，也是一种把祝福编进结构里的民间艺术。",
            "",
            "创作关键词：红绳、对称编结、流苏、盘长纹、祥云、吉祥寓意。"
        ].join("\n");
    }

    return "";
}

export function buildFallbackHeritageAnswer(text) {
    const topic = String(text || "").replace(/[？?。！!]/g, "").trim() || "这项非遗";
    return [
        `${topic}可以从“源流、工艺、纹样寓意、当代创作”四个角度理解。`,
        "",
        "源流看它如何从民间生活、礼俗节庆或宫廷审美中生长出来；工艺看材料、手法和制作步骤；纹样寓意看颜色、题材与象征；当代创作则可以把它转译成画面构图、色彩和质感。",
        "",
        "若要用于创作，可先提炼 3 个关键词：主体、传统纹样、材质质感，再补充留白、构图和色彩气质。"
    ].join("\n");
}

export function cleanAgentReply(rawText, { drawRequested = false } = {}) {
    let text = String(rawText || "").trim();
    let drawPrompt = "";

    const drawMatches = [...text.matchAll(/\[DRAW:\s*([\s\S]*?)\]/gi)];
    if (drawMatches.length) {
        drawPrompt = String(drawMatches[0][1] || "").trim();
    }

    if (!drawRequested) {
        text = text.replace(/\[DRAW:[\s\S]*?\]/gi, "");
        text = text.replace(/subject\s+subject[\s\S]*$/i, "");
        drawPrompt = "";
    } else {
        text = text.replace(/\[DRAW:[\s\S]*?\]/gi, "").trim();
    }

    text = text
        .replace(/请{4,}/g, "请")
        .replace(/等{4,}/g, "等")
        .replace(/D{2,}/g, "。")
        .replace(/([\u4e00-\u9fa5])D(?=[\u4e00-\u9fa5])/g, "$1，")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return { text, drawPrompt };
}
