/**
 * 为两个母题各生成一张底画（2 次文生图调用）。
 * 运行：node scripts/make_story_images.js
 */
import fs from "node:fs/promises";
import path from "node:path";
import "../env.js";
import { generateWithSiliconFlow, imageUrlToDataUrl } from "../providers/siliconflow_image.js";

const OUT = path.resolve("..", "artifacts", "story_demo");

const jobs = [
    {
        file: "01b_dongli_pick.png",
        prompt: [
            "中国水墨画，东篱采菊，秋日夕照。",
            "竹篱边数丛秋菊，夕阳低垂在山边，暖光斜照菊花与竹篱，石上放一只竹篮。",
            "大片留白，宣纸质感，竖幅构图，意境闲适。",
            "不要人物，不要文字，不要印章，不要水印。"
        ].join("")
    },
    {
        file: "01c_moon_boat.png",
        prompt: [
            "中国水墨画，江月归舟。",
            "远山如黛，江面开阔，一轮明月从山脊后升起，一叶小舟停在江面左侧，月光铺在水上。",
            "大片留白，淡墨渲染，宣纸质感，横幅构图，意境清冷。",
            "不要人物，不要文字，不要印章，不要水印。"
        ].join("")
    }
];

for (const job of jobs) {
    console.log("生成：", job.file);
    const out = await generateWithSiliconFlow({
        prompt: job.prompt,
        size: "1024x1024",
        options: {
            negative_prompt: "人物, 建筑, 文字, 印章, 水印, 照片, 3d, 高饱和, 现代"
        }
    });
    let image = out.imageDataUrl;
    if (!image?.startsWith("data:")) image = await imageUrlToDataUrl(out.imageUrl);
    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(image);
    await fs.writeFile(path.join(OUT, job.file), Buffer.from(match[2], "base64"));
    console.log("saved", job.file);
}
