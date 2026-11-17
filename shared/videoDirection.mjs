import direction from './videoDirection.json' with { type: 'json' };

export function buildVideoDirection({ prompt = '', scene = 'still', camera = 'fixed', motion_strength = 'subtle', duration = 5 } = {}) {
    const sceneGuide = direction.scenes.find(item => item.value === scene) || direction.scenes[0];
    const cameraGuide = direction.cameras.find(item => item.value === camera) || direction.cameras[0];
    const strengthGuide = direction.strengths.find(item => item.value === motion_strength) || direction.strengths[0];
    return [
        'Animate the supplied image with minimal motion. The input image is the complete visual reference. Keep every existing object, its shape, count, position, color, texture and the empty background unchanged.',
        sceneGuide.prompt,
        cameraGuide.prompt,
        strengthGuide.prompt,
        duration >= 6 ? '开头短暂停驻，中段只展开所选动态，结尾平稳；保持单一场景。' : '全程连续单镜头，动作缓慢平稳。',
        String(prompt).trim() ? `动作要求（在所选场景允许范围内）：${String(prompt).trim().slice(0, 600)}` : '',
        'Preserve the original medium and composition exactly. Move only the existing elements explicitly allowed above. Keep all other pixels visually stable.'
    ].filter(Boolean).join('\n');
}
