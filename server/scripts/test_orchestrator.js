/**
 * 编排层自检：用本地合成图模拟“好候选 / 偏移候选”，验证择优、返修与书法分层路径。
 * 不调用任何在线服务。
 * 运行：node scripts/test_orchestrator.js
 */
import sharp from "sharp";
import { bufferToDataUrl } from "../vision/structure.js";
import { runStructurePipeline } from "../agent/orchestrator.js";

function scene({ shiftX = 0, shiftY = 0, scale = 1, ink = "#1a1a1a" } = {}) {
    return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="1180">
      <rect width="960" height="1180" fill="#faf8f4"/>
      <g transform="translate(${shiftX} ${shiftY}) translate(480 590) scale(${scale}) translate(-480 -590)"
         fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 700 700 L 705 360 M 705 470 L 620 400 M 705 520 L 790 440"/>
        <path d="M 210 760 q 90 -40 190 0 q -20 46 -95 46 q -75 0 -95 -46 Z"/>
      </g>
    </svg>`);
}

async function png(svg, tint = false) {
    let img = sharp(svg);
    if (tint) img = img.modulate({ brightness: 0.97, saturation: 1.5 }).tint({ r: 230, g: 214, b: 180 });
    return bufferToDataUrl(await img.png().toBuffer());
}

const sketch = await png(scene());
const good = await png(scene(), true);
const drifted = await png(scene({ shiftX: 240, shiftY: 90, scale: 0.75 }));

let repairCalled = 0;
const generate = async ({ index }) => ({ image: index === 0 ? drifted : good });
const repair = async () => {
    repairCalled++;
    return { image: good };
};

const result = await runStructurePipeline({
    sketch,
    prompt: "月下松风，一叶扁舟",
    style: "ink",
    options: { candidates: 2, repair: true },
    onProgress: () => {},
    generate,
    repair
});

console.log("候选分数：", result.candidates.map(c => c.report.score).join(" / "));
console.log("选中来源：", result.chosen.source, "分数：", result.chosen.report.score);
console.log("决策轨迹：", result.trace.map(t => t.reason_code).join(" → "));
console.log("契约摘要：", result.summary.slice(0, 3));

const pickedBest = result.candidates.every(c => c.report.score <= result.chosen.report.score);
if (!pickedBest) {
    console.error("[FAIL] 未选中最高分候选");
    process.exit(1);
}

// 书法分层：保存墨迹形状，换纸后字形应几乎完全重合。
const handwriting = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
    <rect width="600" height="900" fill="#faf8f4"/>
    <g fill="none" stroke="#111" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 150 160 h 260 M 280 160 v 300 M 280 300 h 130"/>
      <path d="M 150 420 q 130 -60 260 0 q -40 120 -130 120 q -90 0 -130 -120 Z"/>
    </g>
  </svg>`);
const handPng = bufferToDataUrl(await sharp(handwriting).png().toBuffer());

const calli = await runStructurePipeline({
    sketch: handPng,
    prompt: "",
    style: "calligraphy",
    options: {},
    onProgress: () => {},
    generate: async () => {
        throw new Error("书法分层路径不应调用生成模型");
    }
});

console.log("书法路径：", calli.mode, "glyphIoU=", calli.metrics.glyphIoU.toFixed(4), "score=", calli.report.score);
if (calli.mode !== "layered" || calli.metrics.glyphIoU < 0.95) {
    console.error("[FAIL] 书法分层保真未达标");
    process.exit(1);
}

console.log("\n[PASS] 择优 / 书法分层路径验证通过");
