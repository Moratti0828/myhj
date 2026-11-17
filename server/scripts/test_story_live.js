/**
 * 叙事短片真实链路测试（会消耗视频生成额度）。
 * 默认使用「东篱采菊」与已有底画；底画不存在时才生成一张。
 * 运行前先启动后端：PORT=3010 node server.js
 */
import fs from "node:fs/promises";
import path from "node:path";
import "../env.js";
import { generateWithSiliconFlow, imageUrlToDataUrl } from "../providers/siliconflow_image.js";

const BASE = process.env.STORY_BASE || "http://127.0.0.1:3010";
const OUT = path.resolve("..", "artifacts", "story_demo");
const DURATION = Number(process.env.STORY_DURATION || 8);
const MOTIF = process.env.STORY_MOTIF || "dongli_pick";
const IMAGE_FILE = path.join(OUT, process.env.STORY_IMAGE || "01b_dongli_pick.png");

async function saveDataUrl(dataUrl, file) {
    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl || "");
    if (!match) throw new Error("not a data url");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.from(match[2], "base64"));
}

async function generatePainting() {
    console.log("底画不存在，先生成一张…");
    const out = await generateWithSiliconFlow({
        prompt: [
            "中国水墨画，东篱采菊，秋日夕照。",
            "竹篱边数丛秋菊，夕阳低垂在山边，暖光斜照，石上放一只竹篮。",
            "大片留白，宣纸质感，竖幅构图。不要人物，不要文字，不要印章。"
        ].join(""),
        size: "1024x1024",
        options: { negative_prompt: "人物, 建筑, 文字, 印章, 水印, 照片, 3d, 高饱和, 现代" }
    });
    let image = out.imageDataUrl;
    if (!image?.startsWith("data:")) image = await imageUrlToDataUrl(out.imageUrl);
    await saveDataUrl(image, IMAGE_FILE);
    return image;
}

async function loadPainting() {
    try {
        const buffer = await fs.readFile(IMAGE_FILE);
        console.log("复用底画：", path.basename(IMAGE_FILE));
        return `data:image/png;base64,${buffer.toString("base64")}`;
    } catch (_) {
        return generatePainting();
    }
}

async function postJson(pathname, body) {
    const resp = await fetch(`${BASE}${pathname}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok || data.success === false) {
        throw new Error(`${pathname} failed: ${JSON.stringify(data).slice(0, 400)}`);
    }
    return data;
}

async function getJson(pathname) {
    const resp = await fetch(`${BASE}${pathname}`);
    return resp.json();
}

const painting = await loadPainting();

const planRes = await postJson("/api/videos/story/plan", {
    motif_id: MOTIF,
    duration: DURATION
});
console.log("分镜：", planRes.plan.beats.map(b => `${b.time} ${b.title}`).join(" | "));
await fs.writeFile(path.join(OUT, "02_story_plan.json"), JSON.stringify(planRes.plan, null, 2), "utf8");

const createRes = await postJson("/api/videos/image-to-video", {
    image: painting,
    prompt: "",
    negative: "",
    story: { motif_id: MOTIF, duration: DURATION },
    options: { resolution: "720P", watermark: true }
});
const taskId = createRes.task.taskId;
console.log("任务已提交：", taskId, "状态：", createRes.task.status);

const started = Date.now();
let task = createRes.task;
while (!["succeeded", "failed", "canceled"].includes(task.status)) {
    if (Date.now() - started > 9 * 60 * 1000) throw new Error("等待超时");
    await new Promise(resolve => setTimeout(resolve, 12000));
    const res = await getJson(`/api/videos/tasks/${taskId}`);
    task = res.task;
    console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${task.status} / ${task.stage}`);
}

await fs.writeFile(path.join(OUT, "03_video_task.json"), JSON.stringify(task, null, 2), "utf8");
if (task.status !== "succeeded") {
    console.error("生成失败：", task.error || task.errorCode);
    process.exit(1);
}

console.log("成片：", task.videoUrl, "时长：", task.parameters?.duration, "音频：", task.parameters?.audio);
const resp = await fetch(`${BASE}${task.videoUrl}`);
const buffer = Buffer.from(await resp.arrayBuffer());
await fs.writeFile(path.join(OUT, `04_${MOTIF}.mp4`), buffer);
console.log("已保存 MP4，大小：", buffer.length);
