/**
 * 结构稳定性度量：纯本地计算的图像结构分析。
 *
 * 设计原则：
 * 1. 不依赖任何在线模型，结果确定、可复现、零调用成本。
 * 2. 只回答“结构有没有守住”，不做审美评分。
 * 3. 所有几何指标都归一化到 [0,1]，便于跨画幅比较。
 */
import sharp from "sharp";

const DEFAULT_GRID = 4;

export function dataUrlToBuffer(input) {
    if (Buffer.isBuffer(input)) return input;
    const text = String(input || "").trim();
    const match = /^data:([^;]+);base64,([\s\S]+)$/i.exec(text);
    if (!match) {
        throw new Error("结构分析需要 dataURL 或 Buffer 图像");
    }
    return Buffer.from(match[2], "base64");
}

export function bufferToDataUrl(buffer, mime = "image/png") {
    return `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
}

/** 载入为 RGBA raw，自动处理 EXIF 方向与透明通道。 */
export async function loadRaw(input) {
    const buffer = dataUrlToBuffer(input);
    const { data, info } = await sharp(buffer, { failOn: "none" })
        .rotate()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}

/** 透明像素按白纸合成后转灰度，避免导出 PNG 的透明背景被当成墨。 */
export function toGray(raw) {
    const { data, width, height } = raw;
    const gray = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
        const a = data[p + 3] / 255;
        const r = data[p] * a + 255 * (1 - a);
        const g = data[p + 1] * a + 255 * (1 - a);
        const b = data[p + 2] * a + 255 * (1 - a);
        gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return gray;
}

/** Otsu 阈值：把墨迹与纸面分开。 */
export function otsuThreshold(gray) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let best = 0;
    let threshold = 127;
    for (let i = 0; i < 256; i++) {
        wB += hist[i];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += i * hist[i];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > best) {
            best = between;
            threshold = i;
        }
    }
    return threshold;
}

export function inkMask(gray, threshold) {
    const mask = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i++) mask[i] = gray[i] < threshold ? 1 : 0;
    return mask;
}

/** Sobel 边缘，阈值取幅值分布的高分位，避免不同扫描亮度导致全黑或全空。 */
export function edgeMask(gray, width, height, percentile = 0.88) {
    const mag = new Uint16Array(width * height);
    const hist = new Uint32Array(1024);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const tl = gray[i - width - 1], tc = gray[i - width], tr = gray[i - width + 1];
            const ml = gray[i - 1], mr = gray[i + 1];
            const bl = gray[i + width - 1], bc = gray[i + width], br = gray[i + width + 1];
            const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
            const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
            const m = Math.min(1020, Math.abs(gx) + Math.abs(gy));
            mag[i] = m;
            hist[m]++;
        }
    }
    const target = Math.max(1, Math.floor(width * height * (1 - percentile)));
    let acc = 0;
    let cutoff = 1020;
    for (let m = 0; m < 1024; m++) {
        acc += hist[m];
        if (acc >= target) {
            cutoff = Math.max(16, m);
            break;
        }
    }
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = mag[i] >= cutoff ? 1 : 0;
    return mask;
}

/** 可分离最大值膨胀，用于容忍轻微错位后再比较边缘重合。 */
export function dilate(mask, width, height, radius = 2) {
    if (radius <= 0) return mask;
    const tmp = new Uint8Array(mask.length);
    const out = new Uint8Array(mask.length);
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            let v = 0;
            const from = Math.max(0, x - radius);
            const to = Math.min(width - 1, x + radius);
            for (let k = from; k <= to && !v; k++) v = mask[row + k];
            tmp[row + x] = v;
        }
    }
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            let v = 0;
            const from = Math.max(0, y - radius);
            const to = Math.min(height - 1, y + radius);
            for (let k = from; k <= to && !v; k++) v = tmp[k * width + x];
            out[y * width + x] = v;
        }
    }
    return out;
}

export function maskIoU(a, b) {
    let inter = 0;
    let union = 0;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (x || y) union++;
        if (x && y) inter++;
    }
    return union === 0 ? 1 : inter / union;
}

/** 8 连通域，返回按面积降序的目标列表。 */
export function connectedComponents(mask, width, height, minArea = 0) {
    const visited = new Uint8Array(mask.length);
    const stack = new Int32Array(mask.length);
    const items = [];
    for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || visited[start]) continue;
        let top = 0;
        stack[top++] = start;
        visited[start] = 1;
        let area = 0;
        let sumX = 0;
        let sumY = 0;
        let minX = width, minY = height, maxX = 0, maxY = 0;
        while (top > 0) {
            const idx = stack[--top];
            const x = idx % width;
            const y = (idx - x) / width;
            area++;
            sumX += x;
            sumY += y;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= height) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= width) continue;
                    const nidx = ny * width + nx;
                    if (mask[nidx] && !visited[nidx]) {
                        visited[nidx] = 1;
                        stack[top++] = nidx;
                    }
                }
            }
        }
        if (area >= minArea) {
            items.push({
                area,
                centroid: [sumX / area / width, sumY / area / height],
                bbox: [minX / width, minY / height, (maxX - minX + 1) / width, (maxY - minY + 1) / height],
            });
        }
    }
    items.sort((a, b) => b.area - a.area);
    return items;
}

export function gridDensity(mask, width, height, n = DEFAULT_GRID) {
    const grid = new Float64Array(n * n);
    const cellW = width / n;
    const cellH = height / n;
    for (let y = 0; y < height; y++) {
        const gy = Math.min(n - 1, Math.floor(y / cellH));
        for (let x = 0; x < width; x++) {
            if (!mask[y * width + x]) continue;
            const gx = Math.min(n - 1, Math.floor(x / cellW));
            grid[gy * n + gx]++;
        }
    }
    const cellArea = cellW * cellH;
    for (let i = 0; i < grid.length; i++) grid[i] /= cellArea;
    return grid;
}

/** 可分离均值模糊，用于把“线”变成“块”，让线稿与成画可以比较。 */
export function boxBlur(src, width, height, radius) {
    if (radius <= 0) return src;
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let count = 0;
            const from = Math.max(0, x - radius);
            const to = Math.min(width - 1, x + radius);
            for (let k = from; k <= to; k++) {
                sum += src[row + k];
                count++;
            }
            tmp[row + x] = sum / count;
        }
    }
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            let sum = 0;
            let count = 0;
            const from = Math.max(0, y - radius);
            const to = Math.min(height - 1, y + radius);
            for (let k = from; k <= to; k++) {
                sum += tmp[k * width + x];
                count++;
            }
            out[y * width + x] = sum / count;
        }
    }
    return out;
}

/** 深色密度网格：比边缘密度更稳，纸张肌理不会把它拉满。 */
export function darknessGrid(darkness, width, height, n = DEFAULT_GRID) {
    const grid = new Float64Array(n * n);
    const cellW = width / n;
    const cellH = height / n;
    for (let y = 0; y < height; y++) {
        const gy = Math.min(n - 1, Math.floor(y / cellH));
        for (let x = 0; x < width; x++) {
            const gx = Math.min(n - 1, Math.floor(x / cellW));
            grid[gy * n + gx] += darkness[y * width + x];
        }
    }
    const cellArea = cellW * cellH;
    for (let i = 0; i < grid.length; i++) grid[i] /= cellArea;
    return grid;
}

/** 深色重心：画面“重量”落在哪里，作为主体漂移的代理。 */
export function darknessCentroid(darkness, width, height) {
    let sx = 0;
    let sy = 0;
    let total = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const v = darkness[y * width + x];
            const w = v * v;
            sx += x * w;
            sy += y * w;
            total += w;
        }
    }
    if (total === 0) return [0.5, 0.5];
    return [sx / total / width, sy / total / height];
}

export function cosine(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return na === nb ? 1 : 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 采样统计色相，用于判断“青花是否变成彩瓷”这类越界。 */
export function colorStats(raw) {
    const { data } = raw;
    let blue = 0;
    let warm = 0;
    let colored = 0;
    let sumSat = 0;
    let sumVal = 0;
    let samples = 0;
    for (let p = 0; p < data.length; p += 16) {
        const r = data[p] / 255;
        const g = data[p + 1] / 255;
        const b = data[p + 2] / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const v = max;
        const s = max === 0 ? 0 : (max - min) / max;
        sumSat += s;
        sumVal += v;
        samples++;
        if (v < 0.12 || s < 0.12) continue;
        colored++;
        let h = 0;
        const d = max - min;
        if (d === 0) h = 0;
        else if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
        if (h >= 185 && h <= 250) blue++;
        if (h < 65 || h > 330) warm++;
    }
    const total = Math.max(1, samples);
    return {
        coloredRatio: colored / total,
        blueRatio: blue / total,
        warmRatio: warm / total,
        meanSat: sumSat / total,
        meanVal: sumVal / total,
    };
}

export function analyzeRaw(raw, options = {}) {
    const { width, height } = raw;
    const gray = toGray(raw);
    const threshold = otsuThreshold(gray);
    const ink = inkMask(gray, threshold);
    const edges = edgeMask(gray, width, height, options.edgePercentile ?? 0.88);
    const minArea = Math.max(24, Math.round(width * height * 0.0002));
    const comps = connectedComponents(ink, width, height, minArea);

    const dark = new Float32Array(gray.length);
    let darkSum = 0;
    for (let i = 0; i < gray.length; i++) {
        const v = 1 - gray[i] / 255;
        dark[i] = v;
        darkSum += v;
    }
    const meanDark = darkSum / gray.length;
    const soft = boxBlur(dark, width, height, 6);

    return {
        width,
        height,
        aspect: width / height,
        threshold,
        ink,
        edges,
        components: comps,
        grid: gridDensity(edges, width, height, options.grid ?? DEFAULT_GRID),
        inkCentroid: comps[0]?.centroid ?? [0.5, 0.5],
        inkRatio: comps.reduce((sum, c) => sum + c.area, 0) / (width * height),
        color: colorStats(raw),
        darkness: soft,
        meanDark,
        gridDark: darknessGrid(soft, width, height, DEFAULT_GRID),
        darkCentroid: darknessCentroid(soft, width, height),
        gray
    };
}

export async function analyzeImage(input, options = {}) {
    const raw = await loadRaw(input);
    return { ...analyzeRaw(raw, options), raw };
}

async function resizeToWidth(input, width, height) {
    const buffer = dataUrlToBuffer(input);
    const meta = await sharp(buffer, { failOn: "none" }).rotate().metadata();
    if (meta.width === width && meta.height === height) return buffer;
    return sharp(buffer, { failOn: "none" })
        .rotate()
        .resize(width, height, { fit: "fill" })
        .png()
        .toBuffer();
}

/**
 * 比较草图与生成结果的结构一致性。
 *
 * 难点：草图是“线”，成画是“面”。直接比边缘会被纹理淹没，
 * 所以主线指标改为「线跟随度」：墨迹落点处的成画是否更重（更深）。
 * 这等价于问：画师有没有沿着你的线走。
 */
export async function compareStructure(source, candidate, options = {}) {
    const src = source?.edges ? source : await analyzeImage(source, options);
    const original = await loadRaw(candidate);
    const aligned = await resizeToWidth(candidate, src.width, src.height);
    const out = await analyzeImage(aligned, options);
    const { width, height } = src;

    // 线跟随度：草图墨迹附近 vs 其它区域的深色差异（按整体明度归一化）。
    const nearLine = dilate(src.ink, width, height, 12);
    let inSum = 0;
    let inCount = 0;
    let outSum = 0;
    let outCount = 0;
    for (let i = 0; i < nearLine.length; i++) {
        if (nearLine[i]) {
            inSum += out.darkness[i];
            inCount++;
        } else {
            outSum += out.darkness[i];
            outCount++;
        }
    }
    const lineContrast = inSum / Math.max(1, inCount) - outSum / Math.max(1, outCount);
    const relativeContrast = lineContrast / Math.max(0.05, out.meanDark);
    const lineFollow = Math.min(1, Math.max(0, relativeContrast / 0.35));

    // 主体漂移：草图墨迹重心 vs 成画深色重心。
    const drift = Math.hypot(
        out.darkCentroid[0] - src.darkCentroid[0],
        out.darkCentroid[1] - src.darkCentroid[1]
    );

    // 留白：草图中空的格子，成画后不应被厚重的墨块压住。
    // 淡雾、淡墨渲染属于正常表现，只惩罚“实墨填满”。
    let emptyCells = 0;
    let filledEmpty = 0;
    for (let i = 0; i < src.gridDark.length; i++) {
        if (src.gridDark[i] > 0.03) continue;
        emptyCells++;
        const dark = out.gridDark[i];
        if (dark > 0.5) filledEmpty += 1;
        else if (dark > 0.4) filledEmpty += (dark - 0.4) / 0.1;
    }
    const whitespace = emptyCells === 0 ? 1 : Math.max(0, 1 - filledEmpty / emptyCells);

    // 布局相似：粗粒度深色分布的余弦相似度，仅作辅助。
    const layoutSim = cosine(src.gridDark, out.gridDark);

    // 边缘重合：对线稿与线稿（书法/分层路径）更有效，成画场景仅参考。
    const srcEdge = dilate(src.edges, width, height, 3);
    const outEdge = dilate(out.edges, width, height, 3);
    const edgeIoU = maskIoU(srcEdge, outEdge);

    const aspectDelta = Math.abs(original.width / original.height - src.width / src.height) /
        (src.width / src.height);

    // 线稿残留：原作线条在成画里是否仍是“孤立黑线”，说明笔墨没有盖上去。
    let inkPixels = 0;
    let residue = 0;
    for (let i = 0; i < src.ink.length; i++) {
        if (!src.ink[i]) continue;
        inkPixels++;
        if (out.gray[i] < 90 && out.darkness[i] < 0.55) residue++;
    }
    const lineResidue = inkPixels === 0 ? 0 : residue / inkPixels;

    return {
        width,
        height,
        lineFollow,
        lineContrast,
        relativeContrast,
        edgeIoU,
        layoutSim,
        drift,
        whitespace,
        lineResidue,
        aspectDelta,
        outputComponents: out.components.length,
        outputGrid: Array.from(out.gridDark),
        color: out.color,
        // 书法/线稿：直接比较墨迹掩膜，用于分层保真路径的验收。
        glyphIoU: maskIoU(src.ink, out.ink),
    };
}

export { DEFAULT_GRID };
