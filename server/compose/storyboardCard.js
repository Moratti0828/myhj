/**
 * 叙事分镜卡：把「首帧 + 节拍」排成一张可预览的图。
 * 纯本地合成，不调用任何付费模型，适合在生成前确认故事是否成立。
 */
import sharp from "sharp";
import { bufferToDataUrl, dataUrlToBuffer } from "../vision/structure.js";

const FONT = "Microsoft YaHei, SimHei, sans-serif";

function escapeXml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function wrap(text, perLine) {
    const chars = Array.from(String(text || ""));
    const lines = [];
    for (let i = 0; i < chars.length; i += perLine) {
        lines.push(chars.slice(i, i + perLine).join(""));
    }
    return lines.slice(0, 3);
}

export async function renderStoryboard({ image, plan }) {
    const width = 1200;
    const height = 700;
    const imageSize = 460;

    const firstFrame = await sharp(dataUrlToBuffer(image), { failOn: "none" })
        .rotate()
        .resize(imageSize, imageSize, { fit: "cover" })
        .png()
        .toBuffer();

    const beats = plan.beats || [];
    const beatText = beats.map((beat, index) => {
        const y = 150 + index * 118;
        const lines = wrap(beat.line, 28);
        return `
      <text x="560" y="${y}" font-family="${FONT}" font-size="17" fill="#a3341f">${escapeXml(beat.time)}</text>
      <text x="700" y="${y}" font-family="${FONT}" font-size="19" font-weight="bold" fill="#3a3226">${escapeXml(beat.title)}</text>
      ${lines.map((line, i) => `
      <text x="560" y="${y + 26 + i * 24}" font-family="${FONT}" font-size="16" fill="#6b5b44">${escapeXml(line)}</text>`).join("")}
    `;
    }).join("");

    const risk = (plan.risk_notes || [])[0] || "";
    const overlay = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#f6f1e6"/>
      <text x="40" y="52" font-family="${FONT}" font-size="30" fill="#2f2921">《${escapeXml(plan.label)}》· ${plan.duration} 秒叙事分镜</text>
      <text x="40" y="86" font-family="${FONT}" font-size="18" fill="#8a6a3a">${escapeXml(plan.meaning)}</text>
      <text x="560" y="112" font-family="${FONT}" font-size="15" fill="#8a7a62">单镜头 · 总时长 ${plan.duration} 秒 · 事件优先于运镜</text>
      <text x="40" y="636" font-family="${FONT}" font-size="15" fill="#786b57">音效建议：${escapeXml((plan.audio || []).join(" · "))}</text>
      <text x="40" y="666" font-family="${FONT}" font-size="14" fill="#9b3d28">${escapeXml(risk)}</text>
    </svg>`;

    const textLayer = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${beatText}</svg>`;

    const composed = await sharp(Buffer.from(overlay))
        .composite([
            { input: firstFrame, left: 40, top: 130 },
            { input: Buffer.from(textLayer), left: 0, top: 0 }
        ])
        .png()
        .toBuffer();

    return bufferToDataUrl(composed);
}
