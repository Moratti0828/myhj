/**
 * 书法 / 手写作品的“分层保真”路径。
 *
 * 扩散模型写不对汉字。因此这条路径不重写笔画：
 *   结构层 = 原墨迹像素（保留字形、笔锋、行列）
 *   材质层 = 纸/绢/装裱背景（可程序生成，也可由模型生成）
 *   合成   = 边缘感知叠加 + 轻微墨扩散
 *
 * 结果：字形重合度按构造接近 1，结构稳定性不是概率问题。
 */
import sharp from "sharp";
import { bufferToDataUrl, dataUrlToBuffer } from "../vision/structure.js";

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function hash2(x, y, seed) {
    let h = x * 374761393 + y * 668265263 + seed * 1442695040888963407;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed);
    const b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed);
    const d = hash2(xi + 1, yi + 1, seed);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** 程序化宣纸：低频云斑 + 细纤维 + 边缘暗角，零模型成本。 */
function proceduralPaper(width, height) {
    const out = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const nx = x / width;
            const ny = y / height;
            const cloud =
                0.55 * valueNoise(nx * 6, ny * 6, 11) +
                0.3 * valueNoise(nx * 18, ny * 18, 23) +
                0.15 * valueNoise(nx * 54, ny * 54, 37);
            const fiber = 0.5 + 0.5 * Math.sin(y * 0.35 + valueNoise(nx * 40, ny * 3, 5) * 6);
            const vignette = 1 - 0.18 * Math.pow(Math.hypot(nx - 0.5, (ny - 0.5) * 1.2), 1.6);
            const tone = (cloud - 0.5) * 16 + (fiber - 0.5) * 4;
            out[i] = clamp(249 + tone * vignette, 0, 255);
            out[i + 1] = clamp(246 + tone * vignette, 0, 255);
            out[i + 2] = clamp(238 + tone * 0.9 * vignette, 0, 255);
            out[i + 3] = 255;
        }
    }
    return out;
}

/**
 * @param {object} params
 * @param {string} params.sketch           原作 dataURL
 * @param {string} [params.background]     可选背景图 dataURL；缺省用程序化宣纸
 * @param {number} [params.inkStrength]    墨迹保留强度 0–1
 * @param {number} [params.bleed]          墨扩散强度 0–1
 */
export async function composeCalligraphy({
    sketch,
    background = "",
    inkStrength = 0.95,
    bleed = 0.25
}) {
    const src = await sharp(dataUrlToBuffer(sketch), { failOn: "none" })
        .rotate()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width, height } = src.info;
    const srcData = src.data;

    let bgRaw = null;
    if (background) {
        const resized = await sharp(dataUrlToBuffer(background), { failOn: "none" })
            .resize(width, height, { fit: "cover", position: "centre" })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        bgRaw = resized.data;
    } else {
        bgRaw = proceduralPaper(width, height);
    }

    // 1) 由亮度与彩度提取墨迹 alpha，连带保留朱印。
    const alpha = new Float32Array(width * height);
    for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
        const r = srcData[p];
        const g = srcData[p + 1];
        const b = srcData[p + 2];
        const a = srcData[p + 3] / 255;
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        const ink = smoothstep(0.86, 0.18, lum);
        const colored = smoothstep(0.06, 0.22, chroma);
        alpha[i] = clamp(Math.max(ink, colored) * a, 0, 1);
    }

    // 2) 墨扩散：把 alpha 轻微模糊后取较大值，模拟宣纸洇墨。
    let bleedAlpha = null;
    if (bleed > 0) {
        const soft = new Uint8Array(width * height);
        for (let i = 0; i < alpha.length; i++) soft[i] = Math.round(alpha[i] * 255);
        const blurred = new Float32Array(width * height);
        const r = 2;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let count = 0;
                for (let dy = -r; dy <= r; dy += 2) {
                    const ny = y + dy;
                    if (ny < 0 || ny >= height) continue;
                    for (let dx = -r; dx <= r; dx += 2) {
                        const nx = x + dx;
                        if (nx < 0 || nx >= width) continue;
                        sum += soft[ny * width + nx];
                        count++;
                    }
                }
                blurred[y * width + x] = sum / Math.max(1, count) / 255;
            }
        }
        bleedAlpha = blurred;
    }

    // 3) 合成：背景 × (1 - a) + 墨色 × a
    const out = Buffer.alloc(width * height * 4);
    for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
        let a = alpha[i] * inkStrength;
        if (bleedAlpha) a = Math.max(a, bleedAlpha[i] * bleed);
        a = clamp(a, 0, 1);
        const r = srcData[p];
        const g = srcData[p + 1];
        const b = srcData[p + 2];
        out[p] = Math.round(bgRaw[p] * (1 - a) + r * a);
        out[p + 1] = Math.round(bgRaw[p + 1] * (1 - a) + g * a);
        out[p + 2] = Math.round(bgRaw[p + 2] * (1 - a) + b * a);
        out[p + 3] = 255;
    }

    const png = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
    return {
        image: bufferToDataUrl(png),
        width,
        height,
        mode: "layered-calligraphy",
        preserved: true
    };
}
