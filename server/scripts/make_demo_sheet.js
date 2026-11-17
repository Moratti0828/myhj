/**
 * 生成竞赛用对照图。
 * 运行：node scripts/make_demo_sheet.js
 */
import sharp from "sharp";
import path from "node:path";

const DIR = path.resolve("..", "artifacts", "structure_demo");
const FONT = "Microsoft YaHei, SimHei, sans-serif";

async function panel(file, w, h) {
    return sharp(path.join(DIR, file)).resize(w, h, { fit: "cover" }).png().toBuffer();
}

async function sheet({ files, labels, title, subtitle, w, h, out }) {
    const gap = 26;
    const top = 132;
    const labelH = 76;
    const margin = 40;
    const totalW = margin * 2 + w * files.length + gap * (files.length - 1);
    const totalH = top + h + labelH;
    const composite = [];

    const header = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${top}">
      <rect width="${totalW}" height="${top}" fill="#f6f1e6"/>
      <text x="${margin}" y="58" font-family="${FONT}" font-size="32" fill="#2f2921">${title}</text>
      <text x="${margin}" y="98" font-family="${FONT}" font-size="18" fill="#7a6a52">${subtitle}</text>
    </svg>`;
    composite.push({ input: Buffer.from(header), left: 0, top: 0 });

    for (let i = 0; i < files.length; i++) {
        const x = margin + i * (w + gap);
        composite.push({ input: await panel(files[i], w, h), left: x, top });
        const label = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="34">
          <text x="0" y="24" font-family="${FONT}" font-size="19" fill="#5b4c3a">${labels[i]}</text>
        </svg>`;
        composite.push({ input: Buffer.from(label), left: x, top: top + h + 14 });
    }

    await sharp({ create: { width: totalW, height: totalH, channels: 3, background: "#f6f1e6" } })
        .composite(composite)
        .png()
        .toFile(path.join(DIR, out));
    console.log("saved", out);
}

await sheet({
    files: ["01_sketch.png", "02_ink_candidate_1.png", "02_ink_candidate_2.png"],
    labels: ["草图（输入）", "候选 A · 结构分 72", "候选 B · 结构分 16"],
    title: "结构守门：同一草图的两个候选",
    subtitle: "结构分只衡量构图与骨架，不衡量审美；B 更漂亮但换了主体位置，所以不选",
    w: 440,
    h: 541,
    out: "00_compare_sheet.png"
});

await sheet({
    files: ["03_calligraphy_source.png", "04_calligraphy_result.png"],
    labels: ["手写原作", "分层保真 · 字形 IoU 99.2%"],
    title: "书法：不重写你的字，只换纸与墨韵",
    subtitle: "结构层保留原墨迹，材质层替换为宣纸；字形漂移由架构排除，不靠概率",
    w: 400,
    h: 562,
    out: "06_calligraphy_sheet.png"
});
