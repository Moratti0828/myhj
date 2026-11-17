import { buildImageEditPrompt } from './buildImageEditPrompt.js';
import { buildStructuredPrompt, buildStructuredNegative } from './buildStructuredPrompt.js';
import { analyzeImage } from '../vision/structure.js';
import { buildContract } from '../agent/compositionContract.js';

export function applyPromptEdits(built, options = {}) {
    for (const key of ['positive_prompt', 'negative_prompt']) {
        if (options[key] !== undefined && (typeof options[key] !== 'string' || options[key].length > 12000)) {
            const error = new Error('输入描述须为12000字以内的文本。'); error.status = 400; throw error;
        }
    }
    if (options.positive_prompt !== undefined && !options.positive_prompt.trim()) {
        const error = new Error('创作提示词不能为空。'); error.status = 400; throw error;
    }
    return { positivePrompt: options.positive_prompt ?? built.positivePrompt, negativePrompt: options.negative_prompt ?? built.negativePrompt };
}

export async function previewGenerationInput(input) {
    const { sketch, prompt = '', negative = '', style = 'ink', options = {} } = input;
    let built;
    if (options.structured) {
        const analysis = await analyzeImage(sketch);
        const contract = buildContract({ analysis, style, userText: prompt, options: { fidelity: options.fidelity } });
        built = { positivePrompt: buildStructuredPrompt({ contract, style, userPrompt: prompt }), negativePrompt: buildStructuredNegative(negative) };
    } else built = buildImageEditPrompt(input);
    return applyPromptEdits(built, options);
}
