import fetch from 'node-fetch';
import { getSiliconFlowEndpoint, getSiliconFlowHeaders } from './siliconflow_config.js';

export function buildStoryMessages({ image, idea = '', meaning = '', preserve = '', changes = '', ending = '' }) {
    return [
        { role: 'system', content: `你是传统视觉艺术短片的编剧与分镜导演。先观察用户原图的主体、形态、笔触、色彩和空间，再围绕用户意图创作故事。原图是故事起点，不是只能微动的终点。
用户没有指定情节时，提出三种不同的故事；用户已有想法时，提供三种不同的叙事发展，不擅自替换主题。不套用固定题材模板，不默认鱼跃龙门、古树吟诗或任何预设故事。
每个故事要有可见的铺垫、因果转折与回应，不以堆砌特效代替叙事。可以引入人物、场景和有意义的变化，但要遵守用户的保留项和允许变化项。不能把设想的新内容说成原图已经存在。保留项优先于创意扩展。
三份提案应在事件、冲突或结局上有实质差别，不只是换标题、运镜或季节。使用自然中文，不谈模型、算法或生成流程。创作有寓意但不说教，不写空泛的“震撼、唯美”。
只输出合法JSON，不加Markdown。结构如下：
{"observation":"仅描述原图可见内容，80字以内","proposals":[{"title":"片名","logline":"一句话故事","meaning":"表达的情感或寓意","synopsis":"有开场、转折和结尾的具体故事，150字以内","shots":[{"title":"镜头名","visual":"此镜头的静态关键画面，明确保留特征与新增元素","action":"此镜头发生的具体动作与变化","camera":"一种明确的运镜","transition":"与下一镜头的衔接，最后一镜写收尾","duration":5}]}]}
proposals必须恰好3份，每份恰好3个镜头。每镜头4至6秒的整数，总长12至18秒。复杂变化应拆成前后关键状态并以镜头衔接，避免要求一个镜头同时完成多次变形。` },
        { role: 'user', content: [
            { type: 'image_url', image_url: { url: image } },
            { type: 'text', text: JSON.stringify({
                故事想法: idea || '请根据原图自由构思三种不同故事，不指定主题',
                想表达的感受: meaning || '由故事自然体现',
                必须保留: preserve || '原作主体的主要识别特征与艺术风格',
                允许变化: changes || '可以新增角色、场景与情节；主体的演变应有叙事原因',
                结尾意向: ending || '自由构思，回应前文的铺垫'
            }) }
        ] }
    ];
}

export function validateStoryboards(result) {
    const issues = [];
    const fields = { observation: '原图观察', title: '标题', logline: '一句话故事', meaning: '寓意', synopsis: '故事梗概', visual: '画面', action: '动作', camera: '运镜', transition: '衔接' };
    const checkText = (object, keys, path) => {
        for (const key of keys) {
            if (typeof object?.[key] !== 'string' || !object[key].trim()) issues.push(`${path}缺少${fields[key]}`);
        }
    };
    checkText(result, ['observation'], '');
    if (!Array.isArray(result?.proposals) || result.proposals.length !== 3) issues.push('需要返回3个故事提案');
    for (const [i, proposal] of (Array.isArray(result?.proposals) ? result.proposals : []).entries()) {
        const path = `第${i + 1}个故事`;
        checkText(proposal, ['title', 'logline', 'meaning', 'synopsis'], path);
        if (!Array.isArray(proposal?.shots) || proposal.shots.length !== 3) issues.push(`${path}需要3个镜头`);
        for (const [j, shot] of (Array.isArray(proposal?.shots) ? proposal.shots : []).entries()) {
            const shotPath = `${path}的第${j + 1}镜`;
            checkText(shot, ['title', 'visual', 'action', 'camera', 'transition'], shotPath);
            // 接受数字字符串，但不猜测或填造缺失的镜头时长。
            if (typeof shot?.duration === 'string' && /^[4-6]$/.test(shot.duration.trim())) shot.duration = Number(shot.duration);
            if (!Number.isInteger(shot?.duration) || shot.duration < 4 || shot.duration > 6) issues.push(`${shotPath}时长应为4至6秒的整数`);
        }
    }
    if (issues.length) {
        const error = new Error(`故事内容尚未补全：${issues.slice(0, 5).join('；')}。你的描述已收到，无需添加母题。`);
        error.status = 502;
        throw error;
    }
    return result;
}

export function parseStoryboards(content, finishReason) {
    if (finishReason === 'length') {
        const error = new Error('故事回复达到长度上限，需要缩短并补全。'); error.status = 502; throw error;
    }
    let result;
    try { result = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
    catch { const error = new Error('故事回复的JSON格式不完整，需要补全。'); error.status = 502; throw error; }
    return validateStoryboards(result);
}

export async function createStoryboards(input) {
    if (!/^data:image\/(png|jpeg|webp);base64,/i.test(String(input.image || ''))) {
        const error = new Error('请先载入一张原作图片。'); error.status = 400; throw error;
    }
    for (const key of ['idea', 'meaning', 'preserve', 'changes', 'ending']) {
        if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > 1500)) {
            const error = new Error('每项创作描述请控制在1500字以内。'); error.status = 400; throw error;
        }
    }
    const messages = buildStoryMessages(input);
    let failure;
    for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch(getSiliconFlowEndpoint('/chat/completions'), {
            method: 'POST', headers: getSiliconFlowHeaders('storyboard'),
            signal: AbortSignal.timeout(90000),
            body: JSON.stringify({
                model: process.env.SILICONFLOW_STORY_MODEL || process.env.SILICONFLOW_CAPTION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct',
                messages, temperature: attempt === 0 ? 0.75 : 0.3, max_tokens: 7000
            })
        });
        if (!response.ok) {
            const error = new Error(`故事构思服务暂不可用（${response.status}），请稍后重试。`);
            error.status = response.status; throw error;
        }
        const data = await response.json();
        const choice = data?.choices?.[0];
        const content = String(choice?.message?.content || '');
        try { return parseStoryboards(content, choice?.finish_reason); }
        catch (error) {
            failure = error;
            if (attempt === 0) {
                messages.push({ role: 'assistant', content });
                messages.push({ role: 'user', content: `请修复上一份回复：${error.message} 保留用户的故事想法、原作特征以及已有的完整内容，只补齐缺项或修复格式。返回完整JSON，必须包含3个提案、每案3个镜头，所有字段齐全。每个字段简洁具体，画面和动作各不超过60字，不添加解释。` });
            }
        }
    }
    throw failure;
}
