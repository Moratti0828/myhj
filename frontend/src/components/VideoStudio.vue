<template>
  <div class="animation-studio animation-studio-v2">
    <StudioHero kicker="墨韵成影" title="原作微动" description="让笔墨缓缓流转，让灯影轻轻摇曳。选一幅原作，以合适的镜头延展画中意境。" :steps="['首帧','运镜','生成','归档']" />

    <div class="animation-workbench-v2">
      <section class="animation-cinema-panel">
        <div class="animation-section-heading">
          <span><el-icon><Picture /></el-icon></span>
          <div>
            <h2>首帧画卷</h2>
            <p>使用创作页生成图，或上传一张清晰国风图作为视频第一帧。</p>
          </div>
        </div>

        <div class="animation-frame-stage animation-frame-stage-v2">
          <img v-if="video.firstFrame" :src="video.framePreview || video.firstFrame" alt="视频首帧" />
          <div v-else class="animation-empty-frame">
            <el-icon><Picture /></el-icon>
            <strong>等待首帧</strong>
            <span>上传图片，或从创作页生成作品后进入动画工坊。</span>
          </div>
        </div>

        <fieldset class="animation-source-row animation-source-v2" :disabled="video.status === 'generating'">
          <label class="animation-upload-btn">
            <input type="file" accept="image/png,image/jpeg,image/webp,image/bmp" @change="handleUpload" />
            <el-icon><UploadFilled /></el-icon>
            上传图片
          </label>
          <input v-model="frameUrl" type="text" placeholder="粘贴图片地址" />
          <button type="button" @click="useFrameUrl">载入</button>
          <button v-if="creation.generatedImage" type="button" @click="useCurrentCreation">使用当前创作</button>
        </fieldset>
        <p class="frame-fit-note">{{ video.imageSize === 'original' ? '沿用原作比例，完整保留画面。' : '以宣纸色留边适配画幅，完整保留原作。' }}</p>

        <div class="animation-output-preview">
          <div class="animation-section-heading compact">
            <span><el-icon><Film /></el-icon></span>
            <div>
              <h2>成片预览</h2>
              <p>{{ outputSubtitle }}</p>
            </div>
          </div>
          <div class="animation-result-stage animation-result-stage-v2">
            <video v-if="video.videoUrl" :src="video.videoUrl" controls playsinline preload="metadata"></video>
            <div v-else class="animation-empty-frame">
              <el-icon><Monitor /></el-icon>
              <strong>{{ statusText }}</strong>
              <span>{{ outputHint }}</span>
            </div>
          </div>
          <div class="video-result-actions video-result-actions-v2">
            <a v-if="video.videoUrl" :href="video.videoUrl" target="_blank" rel="noopener">
              <el-icon><Link /></el-icon>
              打开视频
            </a>
            <a v-if="video.videoUrl" :href="video.videoUrl" download="moyun-video.mp4">
              <el-icon><Download /></el-icon>
              下载 MP4
            </a>
            <button type="button" :disabled="!video.videoUrl" @click="saveVideo">
              <el-icon><Collection /></el-icon>
              保存记录
            </button>
          </div>
        </div>
      </section>

      <aside class="animation-director-panel-v2">
        <div class="animation-section-heading">
          <span><el-icon><MagicStick /></el-icon></span>
          <div>
            <h2>导演控制台</h2>
            <p>择一段动态，留住原作的形与神。</p>
          </div>
        </div>

        <fieldset class="director-controls" :disabled="video.status === 'generating'">
        <div class="quality-preset-grid quality-preset-v2">
          <button
            v-for="preset in qualityPresets"
            :key="preset.value"
            :class="{ active: video.qualityPreset === preset.value }"
            type="button"
            @click="video.applyQualityPreset(preset.value)"
          >
            <span>{{ preset.badge }}</span>
            <strong>{{ preset.label }}</strong>
            <em>{{ preset.meta }}</em>
          </button>
        </div>

        <div class="queue-advice" :class="{ active: video.status === 'generating' }">
          <div>
            <span>队列状态</span>
            <strong>{{ queueTitle }}</strong>
          </div>
          <p>{{ queueMessage }}</p>
        </div>

        <div class="video-field">
          <label for="video-scene">画中意境</label>
          <select id="video-scene" v-model="video.scene">
            <option v-for="scene in direction.scenes" :key="scene.value" :value="scene.value">{{ scene.label }}</option>
          </select>
          <p class="shot-scene-note">{{ selectedScene.summary }}</p>
        </div>
        <div class="motion-chip-panel motion-chip-panel-v2">
          <div class="panel-title sub-title"><span>镜</span> 镜头行止</div>
          <div class="video-preset-row">
            <button v-for="camera in direction.cameras" :key="camera.value" type="button"
              :class="{ active: video.camera === camera.value }" :aria-pressed="video.camera === camera.value"
              @click="video.camera = camera.value">{{ camera.label }}</button>
          </div>
        </div>
        <div class="video-field">
          <label for="video-motion-strength">动态幅度</label>
          <select id="video-motion-strength" v-model="video.motionStrength">
            <option v-for="strength in direction.strengths" :key="strength.value" :value="strength.value">{{ strength.label }}</option>
          </select>
        </div>
        <div class="shot-plan"><strong>此番画意</strong><p>{{ video.getShotSummary() }}</p></div>

        <div class="video-field">
          <label for="video-prompt">补充画意</label>
          <textarea id="video-prompt" v-model="video.prompt" maxlength="600" placeholder="可留空，也可补充：只让远处薄雾向右缓移，近处松石保持静止。"></textarea>
        </div>

        <div class="video-options-grid video-options-v2">
          <div class="video-field compact">
            <label for="video-mode">模式</label>
            <select id="video-mode" :value="video.videoMode" @change="handleVideoModeChange">
              <option value="short">短视频 5 秒</option>
              <option value="long">长视频 6–10 秒</option>
            </select>
          </div>
          <div class="video-field compact">
            <label for="video-duration">时长</label>
            <select id="video-duration" v-model.number="video.duration">
              <option v-for="duration in video.durationOptions" :key="duration" :value="duration">{{ duration }} 秒</option>
            </select>
          </div>
          <div class="video-field compact">
            <label for="video-resolution">清晰度</label>
            <select id="video-resolution" v-model="video.resolution">
              <option value="720P">720P</option>
              <option value="1080P">1080P</option>
            </select>
          </div>
          <div class="video-field compact">
            <label for="video-aspect">画幅</label>
            <select id="video-aspect" v-model="video.imageSize">
              <option value="original">原作比例</option>
              <option value="1280x720">横屏 16:9</option>
              <option value="960x960">方形 1:1</option>
              <option value="720x1280">竖屏 9:16</option>
            </select>
          </div>
        </div>
        <details class="video-advanced">
          <summary>进阶设置</summary>
        <div class="video-field">
          <label>反向词</label>
          <input v-model="video.negative" type="text" placeholder="希望避免的画面变化" />
        </div>

          <div class="video-field">
            <label for="video-seed">随机种子</label>
            <input id="video-seed" v-model="video.seed" type="number" min="0" max="2147483647" step="1" placeholder="留空为随机" />
          </div>
          <div class="animation-switches animation-switches-v2">
            <label><input v-model="video.promptExtend" type="checkbox" /> 丰富动态描述</label>
            <label><input v-model="video.watermark" type="checkbox" /> 添加生成标识</label>
          </div>
        </details>

        <button class="video-generate-btn video-generate-btn-v2" type="button" :disabled="video.status === 'generating' || !video.canGenerate" @click="video.generate()">
          <el-icon v-if="video.status === 'generating'" class="is-loading"><Refresh /></el-icon>
          <el-icon v-else><VideoCamera /></el-icon>
          {{ video.status === 'generating' ? '正在生成...' : video.canGenerate ? '生成 MP4' : '先载入首帧' }}
        </button>

        </fieldset>
        <div v-if="video.taskId" class="video-task-status" aria-live="polite">
          <span>任务 {{ video.taskId.slice(0, 8) }}</span>
          <button type="button" @click="video.pollTask(video.taskId)">刷新进度</button>
        </div>
        <p v-if="video.pollWarning" class="video-poll-warning" role="status">{{ video.pollWarning }}</p>
        <ProgressStream :items="video.progress" />
        <p v-if="video.error" class="error-text">{{ video.error }}</p>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElIcon } from 'element-plus'
import 'element-plus/es/components/icon/style/css'
import { computed, onMounted, ref, watch } from 'vue'
import direction from '../../../shared/videoDirection.json'
import { ElMessage } from 'element-plus'
import {
  Collection,
  Download,
  Film,
  Link,
  MagicStick,
  Monitor,
  Picture,
  Refresh,
  UploadFilled,
  VideoCamera,
} from '@element-plus/icons-vue'
import StudioHero from '@/components/StudioHero.vue'
import ProgressStream from '@/components/ProgressStream.vue'
import { useCreationStore } from '@/stores/creation'
import { useGalleryStore } from '@/stores/gallery'
import { useVideoStore } from '@/stores/video'

const creation = useCreationStore()
const gallery = useGalleryStore()
const video = useVideoStore()
const frameUrl = ref('')

const qualityPresets = [
  { value: 'balanced' as const, badge: '快', label: '快速预览', meta: '720P · 5 秒' },
  { value: 'premium' as const, badge: '清', label: '高清成片', meta: '1080P · 5 秒' },
  { value: 'cinematic' as const, badge: '长', label: '长镜叙事', meta: '1080P · 8 秒' },
]

const latestProgress = computed(() => video.progress[video.progress.length - 1])

const aspectLabel = computed(() => {
  if (video.imageSize === '720x1280') return '竖屏 9:16'
  if (video.imageSize === '960x960') return '方形 1:1'
  if (video.imageSize === 'original') return '原作比例'
  return '横屏 16:9'
})

const selectedScene = computed(() => direction.scenes.find(scene => scene.value === video.scene) || direction.scenes[0])


const statusText = computed(() => {
  if (video.status === 'generating') return /PENDING|QUEUED/i.test(String(latestProgress.value?.status || '')) ? '正在排队' : '正在铺展动画'
  if (video.status === 'error') return '生成失败，请看右侧原因'
  if (video.status === 'done') return '成片已完成'
  return '等待生成'
})

const outputHint = computed(() => {
  if (video.status === 'error') return video.error || '请调整首帧、参数或 API 配置后重试。'
  if (video.status === 'generating') return latestProgress.value?.message || '任务已提交，正在等待模型返回。'
  return video.canGenerate ? '首帧已就绪，可以开始生成。' : '先载入一张首帧画作。'
})

const outputSubtitle = computed(() => {
  if (video.videoUrl) return '视频已生成，建议及时下载保存。'
  if (video.status === 'generating') return latestProgress.value?.message || '正在等待模型返回成片。'
  return '生成完成后会在这里直接预览。'
})

const queueTitle = computed(() => {
  if (video.status === 'done') return '成片已就绪'
  if (video.status === 'error') return '等待调整'
  if (video.status !== 'generating') return '静候开画'
  const elapsed = latestProgress.value?.elapsed
  if (typeof elapsed === 'number' && elapsed > 0) return `已等待 ${elapsed}s`
  return '任务已提交'
})

const queueMessage = computed(() => {
  if (video.status === 'done') return '可以预览、下载，或保存到画廊。'
  if (video.status !== 'generating') return '选好首帧与镜头，即可让画意流转。'
  if (/PENDING|QUEUED/i.test(String(latestProgress.value?.status || ''))) return '画卷正在候场，提交后会持续更新进度。'
  if (latestProgress.value?.stage === 'running') return '正在依原作铺展动态，可稍候再来看成片。'
  return latestProgress.value?.message || '正在提交视频任务。'
})

watch(() => [video.firstFrame, video.imageSize], () => { void video.updateFramePreview() })
onMounted(async () => {
  await video.restoreTask()
  if (!video.firstFrame && creation.generatedImage) useCurrentCreation()
  video.storyMode = false
})

function useCurrentCreation() {
  video.setFirstFrame(creation.generatedImage)
  video.scene = creation.style === 'calligraphy' ? 'calligraphy'
    : creation.content === 'landscape' ? 'landscape'
    : ['flowers', 'birds'].includes(creation.content) ? 'floral'
    : creation.content === 'figure' ? 'figure' : 'still'
}

function handleStoryDurationInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  video.setStoryDuration(value)
}

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.warning('请选择 20MB 以内的图片')
    input.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      video.setFirstFrame(reader.result)
      ElMessage.success('首帧已载入')
    }
  }
  reader.onerror = () => ElMessage.error('图片读取失败，请重新选择')
  reader.readAsDataURL(file)
  input.value = ''
}

function useFrameUrl() {
  const value = frameUrl.value.trim()
  if (!value) {
    ElMessage.warning('请先粘贴图片 URL 或 data:image 内容')
    return
  }
  if (!value.startsWith('data:image') && !/^https?:\/\//i.test(value)) {
    ElMessage.warning('首帧地址格式不正确，请使用 http(s) 公网地址或 data:image')
    return
  }
  video.setFirstFrame(value)
  ElMessage.success('首帧已载入')
}

function handleVideoModeChange(event: Event) {
  const mode = (event.target as HTMLSelectElement).value === 'long' ? 'long' : 'short'
  video.applyVideoMode(mode)
}

async function saveVideo() {
  if (!video.videoUrl || !video.firstFrame) {
    ElMessage.warning('请先生成视频')
    return
  }
  try {
    await gallery.save({
      image: video.framePreview || video.firstFrame,
      content: creation.content || 'landscape',
      style: creation.style || 'ink',
      prompt: video.prompt,
      video_url: video.videoUrl,
      video_prompt: video.prompt,
    })
    ElMessage.success('已保存视频记录到画廊')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败，请先确认已登录')
  }
}
</script>

<style scoped>
.director-controls, .animation-source-row { border: 0; margin: 0; padding: 0; min-width: 0; }
.director-controls { display: grid; gap: 18px; }
.director-controls:disabled { opacity: .72; }
.animation-source-row { flex-wrap: wrap; }
.animation-source-row > input { min-width: 120px; flex: 1; }
.animation-studio-v2 .animation-workbench-v2 { grid-template-columns: minmax(0, 1.4fr) minmax(340px, 1fr); align-items: start; }
.animation-studio-v2 .animation-cinema-panel { display: flex; flex-direction: column; gap: 18px; }
.animation-studio-v2 .animation-cinema-panel, .animation-studio-v2 .animation-director-panel-v2 { height: auto; min-width: 0; overflow: visible; }
.animation-studio-v2 .animation-output-preview { display: flex; width: 100%; min-width: 0; }
.animation-studio-v2 .animation-frame-stage-v2, .animation-studio-v2 .animation-result-stage-v2 { width: 100%; box-sizing: border-box; height: clamp(260px, 32vw, 450px); min-height: 0; margin: 0; background: #faf8f4; flex-shrink: 0; }
.animation-studio-v2 .animation-frame-stage-v2 img, .animation-studio-v2 .animation-result-stage-v2 video { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: contain; }
.animation-studio-v2 .animation-source-v2 { display: flex; flex-wrap: wrap; width: 100%; box-sizing: border-box; }
.animation-studio-v2 .video-result-actions-v2 { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
@media(max-width: 1000px) { .animation-studio-v2 .animation-workbench-v2 { grid-template-columns: 1fr; } }
.frame-fit-note, .shot-scene-note { margin: 10px 0 0; color: #786b57; font-size: 13px; line-height: 1.8; }
.video-preset-row button.active { background: #332f27; color: #f4e7c3; border-color: #8e794b; }
.shot-plan { padding: 14px 16px; background: #f3ede1; border-radius: 12px; }
.shot-plan strong { color: #655134; font-size: 14px; }
.shot-plan p { margin: 8px 0 0; font-size: 13px; line-height: 1.8; color: #76664e; }
.video-advanced { padding: 14px; border: 1px solid #dfd6c4; border-radius: 10px; }
.video-advanced summary { cursor: pointer; color: #655134; }
.video-advanced .video-field { margin-top: 16px; }
.video-task-status { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; font-size: 13px; color: #786b57; }
.video-task-status button { font: inherit; border: 1px solid #dfd6c4; border-radius: 8px; padding: 8px 12px; background: #faf8f4; color: #655134; cursor: pointer; }
.video-poll-warning { color: #956d26; font-size: 13px; line-height: 1.8; }
.video-field select, .video-field input, .video-field textarea { max-width: 100%; box-sizing: border-box; }
@media(max-width: 760px) { .animation-source-row > input { flex-basis: 100%; } }

.video-mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 4px; background: #efe7d8; border-radius: 10px; }
.video-mode-switch button { border: 0; border-radius: 8px; padding: 10px 8px; background: transparent; color: #6b5b44; font: inherit; font-size: 13px; cursor: pointer; }
.video-mode-switch button.active { background: #332f27; color: #f4e7c3; }
.story-director { display: grid; gap: 14px; }
.story-motif-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.story-motif-grid button { text-align: left; padding: 10px 12px; border: 1px solid #dfd6c4; border-radius: 10px; background: #faf8f4; cursor: pointer; display: grid; gap: 4px; font: inherit; }
.story-motif-grid button strong { font-size: 14px; color: #3a3226; }
.story-motif-grid button em { font-style: normal; font-size: 11px; color: #8a7a62; line-height: 1.5; }
.story-motif-grid button.active { border-color: #a3341f; background: #f7e9e2; }
.story-wish { display: grid; gap: 6px; }
.story-wish label { font-size: 12px; color: #655134; }
.story-wish input { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid #dfd6c4; border-radius: 8px; background: #faf8f4; font: inherit; font-size: 13px; color: #3a3226; }
.story-duration { padding: 12px 14px; background: #f3ede1; border-radius: 10px; }
.story-duration-head { display: flex; justify-content: space-between; font-size: 13px; color: #655134; }
.story-duration input { width: 100%; margin: 10px 0 6px; accent-color: #a3341f; }
.story-duration p { margin: 0; font-size: 12px; color: #8a7a62; line-height: 1.6; }
.story-beats { padding: 14px; border: 1px solid #e3d9c7; border-radius: 12px; background: #fffdf8; }
.story-title { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.story-title strong { font-size: 15px; color: #3a3226; }
.story-title span { font-size: 12px; color: #8a6a3a; }
.story-summary { margin: 8px 0 10px; font-size: 12px; line-height: 1.7; color: #786b57; }
.story-beats ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.story-beats li { display: grid; grid-template-columns: 78px 1fr; gap: 10px; }
.beat-time { font-size: 11px; color: #a3341f; font-variant-numeric: tabular-nums; padding-top: 2px; }
.story-beats li strong { font-size: 13px; color: #4a4034; }
.story-beats li p { margin: 3px 0 0; font-size: 12px; line-height: 1.6; color: #786b57; }
.story-audio { margin: 12px 0 0; font-size: 12px; color: #8a7a62; }
.story-risk { margin: 10px 0 0; padding: 8px 10px; border-left: 3px solid #a3341f; background: #f9efe9; font-size: 12px; line-height: 1.7; color: #8a4a35; }
.story-preview-btn { margin-top: 12px; width: 100%; padding: 10px; border: 1px solid #a3341f; border-radius: 8px; background: transparent; color: #a3341f; font: inherit; font-size: 13px; cursor: pointer; }
.story-preview-btn:disabled { opacity: .5; cursor: not-allowed; }
.story-preview-img { margin-top: 12px; width: 100%; border-radius: 8px; border: 1px solid #e3d9c7; display: block; }
</style>

<style scoped>
</style>
