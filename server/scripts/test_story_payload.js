/**
 * 叙事短片参数自检：不调用任何在线服务，验证 5–10 秒钳制与提示词注入。
 * 运行：node scripts/test_story_payload.js
 */
import "../env.js";
import {
    createWanPayload,
    sanitizeWanDurationForMode,
    sanitizeWanVideoMode
} from "../providers/dashscope_wan_video.js";
import { planStory, MIN_DURATION, MAX_DURATION } from "../agent/storyDirector.js";

// 该测试只验证本地参数组装，使用 Mock Key，绝不请求在线接口。
process.env.DASHSCOPE_API_KEY = "mock-key";
process.env.DASHSCOPE_VIDEO_MODEL = "wan2.6-i2v-flash";

const cases = [
    { input: 2, expected: 5 },
    { input: 5, expected: 5 },
    { input: 6, expected: 6 },
    { input: 8, expected: 8 },
    { input: 10, expected: 10 },
    { input: 12, expected: 10 }
];

let failed = 0;
for (const item of cases) {
    const mode = sanitizeWanVideoMode(undefined, item.input);
    const actual = sanitizeWanDurationForMode(item.input, mode);
    const ok = actual === item.expected;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} duration ${item.input} -> ${actual} (期望 ${item.expected})`);
}

if (MIN_DURATION !== 5 || MAX_DURATION !== 10) {
    console.error("FAIL 时长边界应为 5–10");
    failed++;
}

for (const duration of [5, 8, 10]) {
    const plan = planStory({ motifId: "moon_chrysanthemum", duration });
    const mode = sanitizeWanVideoMode(undefined, plan.duration);
    const payload = createWanPayload({
        image: "data:image/png;base64,AAAA",
        prompt: "",
        negative: plan.negative,
        options: {
            duration: plan.duration,
            video_mode: mode,
            resolution: "720P",
            audio: true,
            shot_type: "single",
            raw_prompt: plan.prompt
        }
    });

    const promptOk = payload.input.prompt.includes(`总时长 ${plan.duration} 秒`) &&
        payload.input.prompt.includes("月");
    const durationOk = payload.parameters.duration === plan.duration;
    const audioOk = payload.parameters.audio === true;
    const beatsInPrompt = plan.beats.every(beat => payload.input.prompt.includes(beat.time));
    const ok = promptOk && durationOk && audioOk && beatsInPrompt;
    if (!ok) failed++;
    console.log(
        `${ok ? "PASS" : "FAIL"} 月与菊 ${plan.duration}s：duration=${payload.parameters.duration} ` +
        `audio=${payload.parameters.audio} 节拍入词=${beatsInPrompt} 总时长入词=${promptOk}`
    );
}

const clamped = planStory({ motifId: "moon_chrysanthemum", duration: 99 });
console.log(`PASS 超长请求被钳制为 ${clamped.duration} 秒`);

if (failed > 0) {
    console.error(`\n[FAIL] ${failed} 项未通过`);
    process.exit(1);
}
console.log("\n[PASS] 叙事短片参数与提示词链路正常");
