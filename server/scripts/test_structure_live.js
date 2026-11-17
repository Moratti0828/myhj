/**
 * 构图守门接口的真实链路冒烟测试。
 * 会调用一次图片编辑模型（1 张），书法分层路径不调用模型。
 * 运行前先启动后端：PORT=3010 node server.js
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const BASE = process.env.STRUCTURE_BASE || "http://127.0.0.1:3010";
const OUT_DIR = path.resolve("..", "artifacts", "structure_demo");

function svgSketch() {
    return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="1180">
      <rect width="960" height="1180" fill="#faf8f4"/>
      <g fill="none" stroke="#151515" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 120 900 q 180 -70 330 -30 q 200 40 390 -40"/>
        <path d="M 690 860 L 700 300 M 700 470 L 590 380 M 700 540 L 815 430"/>
        <path d="M 640 380 q -30 -70 0 -120 q 55 25 45 95"/>
        <path d="M 815 430 q 70 -50 45 -120 q -65 10 -75 80"/>
        <path d="M 200 850 q 80 -35 170 0 q -18 40 -85 40 q -67 0 -85 -40 Z"/>
      </g>
    </svg>`);
}

function svgHandwriting() {
    return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="900">
      <rect width="640" height="900" fill="#faf8f4"/>
      <g fill="none" stroke="#101010" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 150 150 h 300 M 300 150 v 320 M 300 300 h 150"/>
        <path d="M 150 470 q 160 -70 320 0 q -50 150 -160 150 q -110 0 -160 -150 Z"/>
        <path d="M 200 700 h 240"/>
      </g>
      <rect x="470" y="760" width="90" height="90" fill="none" stroke="#b5321f" stroke-width="8"/>
    </svg>`);
}

async function png(svg) {
    const buf = await sharp(svg).png().toBuffer();
    return `data:image/png;base64,${buf.toString("base64")}`;
}

async function saveDataUrl(dataUrl, file) {
    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl || "");
    if (!match) return false;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.from(match[2], "base64"));
    return true;
}

async function runStructure({ sketch, style, candidates = 1 }) {
    const body = JSON.stringify({
        sketch,
        prompt: style === "calligraphy" ? "" : "月下松风，一叶扁舟，淡墨远山",
        content: "landscape",
        style,
        negative: "低清晰度，畸形，过度饱和",
        options: { candidates, repair: false }
    });
    const resp = await fetch(`${BASE}/api/generate/structure/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let donePayload = null;
    const stages = [];
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";
        for (const block of blocks) {
            const line = block.split(/\r?\n/).find(l => l.startsWith("data:"));
            if (!line) continue;
            const payload = JSON.parse(line.replace(/^data:\s?/, ""));
            stages.push(payload.stage);
            if (payload.stage === "error") throw new Error(payload.error || "生成失败");
            if (payload.stage === "done") donePayload = payload;
        }
    }
    return { stages, payload: donePayload };
}

await fs.mkdir(OUT_DIR, { recursive: true });

// 1) 真实生成：1 张候选，验证接口与度量链路。
const sketch = await png(svgSketch());
await saveDataUrl(sketch, path.join(OUT_DIR, "01_sketch.png"));
console.log("生成中（2 张候选，可能 20–60 秒）…");
const ink = await runStructure({ sketch, style: "ink", candidates: 2 });
console.log("阶段：", ink.stages.join(" → "));
console.log("契约主体：", ink.payload?.contract?.subjects?.map(s => s.name).join("、") || "(无)");
const candidates = ink.payload?.candidates || [];
candidates.forEach((c, i) => {
    console.log(`候选 ${i + 1}：score=${c.report?.score} verdict=${c.report?.verdict} defects=${c.report?.defects?.map(d => d.code).join(",") || "-"}`);
});
console.log("体检：", JSON.stringify(ink.payload?.report));
for (let i = 0; i < candidates.length; i++) {
    await saveDataUrl(candidates[i].image, path.join(OUT_DIR, `02_ink_candidate_${i + 1}.png`));
}
await saveDataUrl(ink.payload?.chosen?.image, path.join(OUT_DIR, "02_ink_result.png"));
await fs.writeFile(path.join(OUT_DIR, "02_ink_report.json"),
    JSON.stringify({ contract: ink.payload?.contract, report: ink.payload?.report, trace: ink.payload?.trace, prompt: ink.payload?.prompt_used }, null, 2),
    "utf8");

// 2) 书法分层：不调用模型，验证字形零漂移。
const hand = await png(svgHandwriting());
await saveDataUrl(hand, path.join(OUT_DIR, "03_calligraphy_source.png"));
const calli = await runStructure({ sketch: hand, style: "calligraphy", candidates: 1 });
console.log("书法阶段：", calli.stages.join(" → "));
console.log("书法体检：", JSON.stringify(calli.payload?.report), "glyphIoU=", calli.payload?.metrics?.glyphIoU);
await saveDataUrl(calli.payload?.chosen?.image, path.join(OUT_DIR, "04_calligraphy_result.png"));

console.log("产物目录：", OUT_DIR);
