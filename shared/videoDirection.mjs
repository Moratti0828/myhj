import direction from './videoDirection.json' with { type: 'json' };

export function buildVideoDirection({ prompt = '', scene = 'still', camera = 'fixed', motion_strength = 'subtle', duration = 5 } = {}) {
    const sceneGuide = direction.scenes.find(item => item.value === scene) || direction.scenes[0];
    const cameraGuide = direction.cameras.find(item => item.value === camera) || direction.cameras[0];
    const strengthGuide = direction.strengths.find(item => item.value === motion_strength) || direction.strengths[0];
    return [
        '以输入首帧为唯一视觉依据，制作连续单镜头的传统艺术短片。保持原作主体、构图、配色、材质、笔触与留白。',
        sceneGuide.prompt,
        cameraGuide.prompt,
        strengthGuide.prompt,
        duration >= 6 ? '开头短暂停驻，中段平稳展开所选动态，结尾自然放缓；全程不切换场景。' : '从首帧自然起动，运动连续，结尾平稳收住。',
        String(prompt).trim() ? `补充要求：${String(prompt).trim().slice(0, 600)}` : '',
        '原图文字、印章、人物身份和纹样始终一致。不要新增文字、物件或人物，不改变艺术媒介，不出现突变、闪烁或跳切。'
    ].filter(Boolean).join('\n');
}
