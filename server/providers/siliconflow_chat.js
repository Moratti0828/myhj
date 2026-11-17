import fetch from "node-fetch";
import { getSiliconFlowEndpoint, getSiliconFlowHeaders } from "./siliconflow_config.js";

const DEFAULT_SILICONFLOW_MODEL = "Qwen/Qwen2.5-72B-Instruct";

function getSiliconFlowConfig() {
    return {
        endpoint: getSiliconFlowEndpoint("/chat/completions"),
        model: process.env.SILICONFLOW_CHAT_MODEL || DEFAULT_SILICONFLOW_MODEL
    };
}

function envNumber(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err?.name === "AbortError") {
            const timeoutErr = new Error(`硅基流动 AI 书童调用超时（${timeoutMs}ms）`);
            timeoutErr.status = 504;
            timeoutErr.detail = "聊天模型长时间未返回，请稍后重试。";
            throw timeoutErr;
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

const CULTURE_SYSTEM_PROMPT = `你是一位温文尔雅、知识扎实的“非遗 AI 书童”。

回答规则：
1. 只用简洁、自然的中文回答，不要输出英文提示词。
2. 不要输出 [DRAW]，不要主动生成绘画提示词。
3. 优先讲清：历史源流、工艺特征、审美寓意、可用于创作的关键词。
4. 回答控制在 350 字以内，不要重复，不要堆砌。`;

const DRAW_SYSTEM_PROMPT = `你是一位“非遗 AI 书童”和国风绘画提示词助手。

回答规则：
1. 先用中文 2-3 句说明画意。
2. 最后一行必须且只能输出一个 [DRAW: ...]。
3. [DRAW: ...] 用英文，包含主体、场景、构图、风格、材质，并写入 no text, no watermark, no logo。
4. 避免现代摄影感，强调 traditional Chinese painting、ink wash、gongbi、blue-and-white porcelain、Dunhuang mural 等清晰风格差异。`;

export async function chatWithSiliconFlow({ messages, drawRequested = false }) {
    const { endpoint, model } = getSiliconFlowConfig();

    const formattedMessages = [
        { role: "system", content: drawRequested ? DRAW_SYSTEM_PROMPT : CULTURE_SYSTEM_PROMPT },
        ...messages
    ];

    try {
        const timeoutMs = envNumber("SILICONFLOW_CHAT_TIMEOUT_MS", 25000);
        const resp = await fetchWithTimeout(
            endpoint,
            {
                method: "POST",
                headers: getSiliconFlowHeaders("AI agent chat"),
                body: JSON.stringify({
                    model,
                    messages: formattedMessages,
                    temperature: drawRequested ? 0.5 : 0.28,
                    max_tokens: drawRequested ? 700 : 650
                })
            },
            timeoutMs
        );

        const raw = await resp.text();
        if (!resp.ok) {
            throw new Error(`硅基流动 AI 书童调用失败 (HTTP ${resp.status}): ${raw}`);
        }

        const data = JSON.parse(raw);
        const reply = data?.choices?.[0]?.message?.content || "";
        return {
            success: true,
            reply: reply.trim(),
            model_used: model,
            is_fallback: false
        };
    } catch (err) {
        console.error("[agent] error in SiliconFlow chat:", err?.message || err);
        throw err;
    }
}
