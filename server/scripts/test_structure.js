/**
 * 结构度量自检：不调用任何在线服务，用本地合成的草图/候选图验证指标方向正确。
 * 运行：node scripts/test_structure.js
 */
import sharp from "sharp";
import { analyzeImage, compareStructure, bufferToDataUrl } from "../vision/structure.js";

function svgScene({ shiftX = 0, shiftY = 0, fill = false, scale = 1 } = {}) {
    const bg = fill
        ? `<rect width="960" height="1180" fill="#e8dcc0"/>`
        : `<rect width="960" height="1180" fill="#faf8f4"/>`;
    return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="1180">
      ${bg}
      <g transform="translate(${shiftX} ${shiftY}) translate(480 590) scale(${scale}) translate(-480 -590)"
         fill="none" stroke="#1a1a1a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 700 700 L 705 360 M 705 470 L 620 400 M 705 520 L 790 440
                 M 640 380 q -40 -60 -10 -110 q 50 20 40 80
                 M 790 420 q 60 -50 40 -110 q -60 10 -70 70"/>
        <path d="M 210 760 q 90 -40 190 0 q -20 46 -95 46 q -75 0 -95 -46 Z"/>
        <path d="M 320 806 l 120 0" stroke-width="5"/>
      </g>
    </svg>`);
}

async function toPngDataUrl(svg) {
    const png = await sharp(svg).png().toBuffer();
    return bufferToDataUrl(png);
}

function pct(v) {
    return `${(v * 100).toFixed(1)}%`;
}

const sketch = await toPngDataUrl(svgScene());

const good = await toPngDataUrl(await sharp(svgScene())
    .modulate({ brightness: 0.96, saturation: 1.6 })
    .tint({ r: 232, g: 216, b: 180 })
    .blur(0.6)
    .png()
    .toBuffer());

const drifted = await toPngDataUrl(await sharp(svgScene({ shiftX: 260, shiftY: 120, scale: 0.72 }))
    .png().toBuffer());

const filled = await toPngDataUrl(await sharp(svgScene({ fill: true }))
    .blur(1.2).png().toBuffer());

const src = await analyzeImage(sketch);
console.log(`[src] ${src.width}x${src.height} 墨迹占比=${pct(src.inkRatio)} 主体数=${src.components.length}`);

for (const [name, image] of [["good 同构候选", good], ["drifted 整体偏移", drifted], ["filled 满构图", filled]]) {
    const m = await compareStructure(src, image);
    console.log(
        `${name.padEnd(14)} edgeIoU=${m.edgeIoU.toFixed(3)} layout=${m.layoutSim.toFixed(3)} ` +
        `drift=${m.drift.toFixed(3)} 留白=${m.whitespace.toFixed(3)} 字形IoU=${m.glyphIoU.toFixed(3)}`
    );
}

const baseline = await compareStructure(src, good);
const shifted = await compareStructure(src, drifted);
const ok =
    baseline.edgeIoU > shifted.edgeIoU &&
    baseline.layoutSim > shifted.layoutSim &&
    baseline.drift < shifted.drift;
console.log(ok ? "\n[PASS] 指标方向正确：同构候选优于偏移候选" : "\n[FAIL] 指标方向异常");
if (!ok) process.exit(1);
