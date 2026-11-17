/**
 * 构图守门智能体的编排层。
 *
 * Plan（立骨）→ Generate（赋色）→ Observe（体检）→ Decide（择优/返修）。
 * 决策是确定性代码，不是模型：预算、重试次数、接受阈值都可审计。
 */
import { applyPromptEdits } from "../prompt/generationInput.js";
import { analyzeImage, compareStructure } from "../vision/structure.js";
import { buildContract, describeContract } from "./compositionContract.js";
import { evaluateCandidate, buildRepairInstruction } from "./structureCritic.js";
import { buildStructuredPrompt, buildStructuredNegative } from "../prompt/buildStructuredPrompt.js";
import { composeCalligraphy } from "../pipeline/calligraphyPreserve.js";

const MAX_CANDIDATES = 3;

function now() {
    return Date.now();
}

export async function runStructurePipeline({
    sketch,
    prompt = "",
    content = "",
    style = "ink",
    negative = "",
    options = {},
    onProgress = null,
    generate,
    repair = null,
    background = "",
    caption = null
}) {
    const trace = [];
    const emit = (stage, extra = {}) => {
        try {
            onProgress?.({ stage, ...extra });
        } catch (_) {
            /* 进度推送失败不应影响生成 */
        }
    };
    const mark = (step, extra = {}) => {
        trace.push({ step, at: new Date().toISOString(), ...extra });
    };

    if (!sketch) {
        const err = new Error("缺少原作图片");
        err.status = 400;
        throw err;
    }
    if (typeof generate !== "function") {
        throw new Error("runStructurePipeline 需要注入 generate 函数");
    }

    const t0 = now();
    emit("analyze", { message: "正在立骨：提取草图结构…" });
    const analysis = await analyzeImage(sketch);
    const contract = buildContract({
        caption,
        analysis,
        style,
        userText: prompt,
        options: { fidelity: options.fidelity, maxSubjects: options.maxSubjects }
    });
    mark("plan", {
        reason_code: "CONTRACT_BUILT",
        subjects: contract.subjects.length,
        fidelity: contract.fidelity.structure,
        ms: now() - t0
    });
    emit("contract", {
        contract,
        summary: describeContract(contract),
        metrics: { subjects: contract.subjects.length, components: analysis.components.length }
    });

    const { positivePrompt: builtPrompt, negativePrompt } = applyPromptEdits({
        positivePrompt: buildStructuredPrompt({ contract, style, userPrompt: prompt }),
        negativePrompt: buildStructuredNegative(negative)
    }, options);

    // 书法走分层保真：不重写字形，结构由构造保证。
    const layered = style === "calligraphy" && options.layered !== false;
    if (layered) {
        const t1 = now();
        emit("layered", { message: "正在分层保真：保留原墨迹，只换纸与墨韵…" });
        const composed = await composeCalligraphy({
            sketch,
            background: background || options.background || "",
            inkStrength: options.inkStrength,
            bleed: options.bleed
        });
        const metrics = await compareStructure(analysis, composed.image);
        const report = evaluateCandidate({ metrics, style, contract });
        mark("layered", { reason_code: "CALLIGRAPHY_PRESERVED", score: report.score, ms: now() - t1 });
        emit("checking", { index: 0, report, metrics });
        const chosen = { image: composed.image, metrics, report, source: "layered" };
        emit("done", {
            chosen,
            report,
            metrics,
            candidates: [chosen],
            contract,
            summary: describeContract(contract),
            trace,
            prompt_used: builtPrompt,
            mode: "layered"
        });
        return {
            chosen,
            candidates: [chosen],
            contract,
            report,
            metrics,
            trace,
            promptUsed: builtPrompt,
            mode: "layered"
        };
    }

    const requested = Number(options.candidates);
    const candidateCount = Math.max(1, Math.min(MAX_CANDIDATES, Number.isFinite(requested) ? requested : 2));
    const maxCalls = Math.max(candidateCount, Number(options.maxCalls) || candidateCount + 1);
    let calls = 0;

    const candidates = [];
    for (let index = 0; index < candidateCount; index++) {
        if (calls >= maxCalls) break;
        calls++;
        const seed = Number.isFinite(Number(options.seed)) && Number(options.seed) > 0
            ? Math.floor(Number(options.seed)) + index * 7919
            : undefined;
        const t = now();
        emit("generating", { index, total: candidateCount, seed });
        const out = await generate({
            prompt: builtPrompt,
            negative: negativePrompt,
            seed,
            index,
            contract,
            analysis
        });
        const metrics = await compareStructure(analysis, out.image);
        const report = evaluateCandidate({ metrics, style, contract });
        const item = { image: out.image, image_url: out.imageUrl || null, seed, metrics, report, source: "generated" };
        candidates.push(item);
        mark("observe", {
            reason_code: report.verdict === "accept" ? "CANDIDATE_ACCEPT" : "CANDIDATE_REPAIR",
            index,
            score: report.score,
            defects: report.defects.map(d => d.code),
            ms: now() - t
        });
        emit("checking", { index, total: candidateCount, report, metrics });
    }

    candidates.sort((a, b) => Number(b.report.verdict === "accept") - Number(a.report.verdict === "accept") || b.report.score - a.report.score);
    let chosen = candidates[0];

    const allowRepair = options.repair !== false && typeof repair === "function" && calls < maxCalls;
    if (allowRepair && chosen && chosen.report.verdict === "repair") {
        const instruction = buildRepairInstruction(chosen.report.defects, contract);
        emit("repairing", {
            attempt: 1,
            instruction,
            defects: chosen.report.defects
        });
        const t = now();
        calls++;
        try {
            const fixed = await repair({
                image: chosen.image,
                instruction,
                contract,
                defects: chosen.report.defects
            });
            const metrics = await compareStructure(analysis, fixed.image);
            const report = evaluateCandidate({ metrics, style, contract });
            mark("repair", {
                reason_code: "TARGETED_REPAIR",
                score_before: chosen.report.score,
                score_after: report.score,
                ms: now() - t
            });
            if ((report.verdict === "accept" && chosen.report.verdict !== "accept") || (report.verdict === chosen.report.verdict && report.score >= chosen.report.score)) {
                chosen = { image: fixed.image, image_url: fixed.imageUrl || null, seed: chosen.seed, metrics, report, source: "repaired" };
                candidates.unshift(chosen);
            }
            emit("checking", { index: 0, total: candidates.length, report, metrics, repaired: true });
        } catch (err) {
            mark("repair", { reason_code: "REPAIR_FAILED", error: String(err?.message || err).slice(0, 160), ms: now() - t });
        }
    }

    mark("decide", {
        reason_code: chosen?.report?.verdict === "accept" ? "ACCEPT" : "ACCEPT_WITH_LIMITS",
        chosen_score: chosen?.report?.score ?? 0,
        candidates: candidates.length,
        calls,
        ms: now() - t0
    });

    const result = {
        chosen,
        candidates: candidates.map(c => ({
            image: c.image,
            image_url: c.image_url,
            seed: c.seed,
            report: c.report,
            source: c.source
        })),
        contract,
        summary: describeContract(contract),
        report: chosen?.report || null,
        metrics: chosen?.metrics || null,
        trace,
        prompt_used: builtPrompt,
        mode: "structured",
        calls
    };
    emit("done", result);
    return result;
}
