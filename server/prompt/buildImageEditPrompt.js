const styles = {
    ink: "中国水墨，墨色浓淡自然，保留笔触与留白",
    bluewhite: "青花瓷风格，钴蓝与白色相映，纹样清晰",
    dunhuang: "敦煌壁画风格，矿物色与古朴壁面肌理",
    gongbi: "工笔风格，细线勾勒，层层淡彩",
    song: "宋画风格，设色含蓄，细节精雅",
    court: "宫廷绘画风格，设色端雅，纹饰精细",
    modern: "现代国风，线面简练，色彩克制",
    calligraphy: "书法原作润饰，保留原有字形、笔锋、连笔和墨色节奏",
    ming: "明式审美，结构简洁，材质温润"
};

/**
 * 题材约束：用户选的题材必须进入提示词。
 * 否则稀疏草图没有语义锚点，模型会自由发挥（例如把山水线稿画成人物）。
 */
const contents = {
    landscape: "山水：山石、水流、树木、云雾。不要出现人物、僧侣或建筑主体。",
    birds: "花鸟：花枝、叶片、鸟雀。不要出现人物。",
    figure: "人物：人物是画面主体，数量与姿态按草图中的轮廓。",
    flowers: "花卉：花枝、花瓣与叶片特写。不要出现人物。",
    fish: "鱼虫：鱼、虾、蟹或草虫。不要出现人物。",
    architecture: "建筑：亭台、楼阁、桥、屋宇。不要出现人物。",
    cloud: "云雾：云雾与远山，画面以留白与淡墨为主。不要出现人物。",
    flying: "飞天：飘带、云气与飞天体态，人物按草图中的轮廓。",
    dragon: "龙凤：龙或凤的轮廓与云气，不要出现其他人物。"
};

const contentNegatives = {
    landscape: "人物，僧侣，佛像，建筑",
    birds: "人物，建筑",
    flowers: "人物，建筑",
    fish: "人物，建筑",
    architecture: "人物",
    cloud: "人物，建筑",
    dragon: "人物，建筑"
};

export function buildImageEditPrompt({
    prompt = "",
    style = "ink",
    negative = "",
    mode = "generate",
    content = ""
}) {
    const task = mode === "enhance"
        ? "精修输入图片，改善局部边缘、纹理与色彩衔接；保持当前画面的主体、位置与构图，不另起一幅画。"
        : "以输入图片为原作进行风格转绘。保留可辨认的主体、轮廓、姿态、相对位置、构图和主要配色，再按指定风格润饰。";
    const contentLine = contents[content] || "";
    const positivePrompt = [
        task,
        "输入图是唯一的视觉依据：只沿着输入图中的线条生长画面，不要新增输入图中不存在的场景、人物或建筑。",
        contentLine ? `题材约束：${contentLine}` : "",
        "原图是视觉依据。原图中的手写文字必须保留文字内容、字形结构、行列布局、笔画走向与书写特点，不转写为印刷字，不增删字符。",
        "参考图中的人物、物件和纹样应能与原图对应；不要用无关场景替换原作。",
        `风格：${styles[style] || styles.ink}。风格只改变表现方式，不覆盖原作的识别特征。`,
        prompt.trim() ? `具体修改要求：${prompt.trim()}` : "仅润饰原作的线条、质感与色彩，不添加无关主体。"
    ].filter(Boolean).join("\n");
    const negativeBase = negative.trim() || "低清晰度，模糊，主体变形，笔画缺失，错误字形，额外标志";
    const contentNegative = contentNegatives[content] || "";
    const negativePrompt = [negativeBase, contentNegative].filter(Boolean).join("，");
    return { positivePrompt, negativePrompt };
}

/** 稀疏草图判断：线条太少时，模型会自行脑补，需要提前提示用户。 */
export const SPARSE_SKETCH_RATIO = 0.004;
