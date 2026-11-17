import "../env.js";

const DEFAULT_BASE_ENDPOINT = "https://api.siliconflow.cn/v1";

export function getSiliconFlowBaseEndpoint() {
    return (process.env.SILICONFLOW_ENDPOINT || DEFAULT_BASE_ENDPOINT).replace(/\/+$/, "");
}

export function getSiliconFlowEndpoint(pathname) {
    const path = String(pathname || "").replace(/^\/+/, "");
    return `${getSiliconFlowBaseEndpoint()}/${path}`;
}

export function getSiliconFlowApiKey(serviceName = "SiliconFlow") {
    const apiKey = String(process.env.SILICONFLOW_API_KEY || "").trim();
    if (!apiKey) {
        const err = new Error("硅基流动 API Key 未配置");
        err.status = 500;
        err.detail = `请在 server/.env 中填写 SILICONFLOW_API_KEY 后重启后端。当前服务：${serviceName}`;
        throw err;
    }
    return apiKey;
}

export function getSiliconFlowHeaders(serviceName) {
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getSiliconFlowApiKey(serviceName)}`
    };
}
