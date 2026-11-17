/**
 * 把视频抽帧拼成对照图，便于检查事件与变形。
 * 运行：node scripts/make_video_sheet.js
 */
import sharp from "sharp";
import path from "node:path";

const DIR = path.resolve("..", "artifacts", "story_demo");
const FONT = "Microsoft YaHei, SimHei, sans-serif";
const files = [
    ["frame_0.2.png", "0.2s 夕照"],
    ["frame_2.2.png", "2.2s 花颤"],
    ["frame_4.5.png", "4.5s 篮满"],
    ["frame_7.png", "7.0s 归静"]
];
const W = 320;
const H = 320;
const GAP = 14;
const M = 32;
const TOP = 96;

const panels = await Promise.all(files.map(async ([file]) =>
    sharp(path.join(DIR, file)).resize(W, H, { fit: "cover" }).png().toBuffer()
));

const totalW = M * 2 + W * files.length + GAP * (files.length - 1);
const totalH = TOP + H + 56;

const header = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${TOP}">
  <rect width="${totalW}" height="${TOP}" fill="#f6f1e6"/>
  <text x="${M}" y="46" font-family="${FONT}" font-size="26" fill="#2f2921">东篱采菊 · 8 秒成片关键帧</text>
  <text x="${M}" y="76" font-family="${FONT}" font-size="15" fill="#7a6a52">检查：人物是否出现、花瓣是否变形、菊丛位置是否稳定</text>
</svg>`;

const composite = [{ input: Buffer.from(header), left: 0, top: 0 }];
files.forEach(([file, label], index) => {
    const left = M + index * (W + GAP);
    composite.push({ input: panels[index], left, top: TOP });
    const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="30">
      <text x="0" y="21" font-family="${FONT}" font-size="15" fill="#5b4c3a">${label}</text>
    </svg>`;
    composite.push({ input: Buffer.from(text), left, top: TOP + H + 10 });
});

await sharp({ create: { width: totalW, height: totalH, channels: 3, background: "#f6f1e6" } })
    .composite(composite)
    .png()
    .toFile(path.join(DIR, "07_dongli_frames.png"));

console.log("saved 07_dongli_frames.png");
