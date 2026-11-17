/**
 * 分镜卡接口测试：本地合成，不调用生成模型。
 * 运行前先启动后端：PORT=3010 node server.js
 */
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.STORY_BASE || "http://127.0.0.1:3010";
const DIR = path.resolve("..", "artifacts", "story_demo");

for (const [motifId, duration, sourceFile, file] of [
    ["dongli_pick", 8, "01b_dongli_pick.png", "05_storyboard_dongli.png"],
    ["moon_boat", 8, "01c_moon_boat.png", "06_storyboard_boat.png"]
]) {
    const buffer = await fs.readFile(path.join(DIR, sourceFile));
    const image = `data:image/png;base64,${buffer.toString("base64")}`;
    const resp = await fetch(`${BASE}/api/videos/story/storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, motif_id: motifId, duration })
    });
    const data = await resp.json();
    if (!resp.ok || data.success === false) {
        throw new Error(`${motifId} failed: ${JSON.stringify(data).slice(0, 300)}`);
    }
    const match = /^data:image\/png;base64,([\s\S]+)$/.exec(data.image || "");
    if (!match) throw new Error("not a png data url");
    await fs.writeFile(path.join(DIR, file), Buffer.from(match[1], "base64"));
    console.log(`${motifId} 分镜：`, data.plan.beats.map(b => `${b.time} ${b.title}`).join(" | "));
    console.log("saved", file);
}
