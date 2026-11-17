<template>
  <section class="create-stage creation-redesign">
    <StudioHero kicker="墨韵创作台" title="落笔成意，依画生境" description="导入参考图、手写作品，或亲手勾勒草图，让原作的笔意延展成画。" :steps="['草图','识图','确认','生成']" />

    <div class="creation-shell" :style="{ '--control-rail-height': `${controlRailHeight}px` }">
      <aside ref="controlRailRef" class="creation-control-rail">
        <div class="sidebar-block inspiration-card">
          <div class="block-header">
            <div class="block-title"><span>灵</span> 今日灵感</div>
            <span class="collapse-mark">▲</span>
          </div>
          <div class="block-content">
            <div class="inspiration-date">{{ today }}</div>
            <div class="daily-theme">
              <img class="daily-theme-image" :src="currentInspiration.image" :alt="currentInspiration.title" />
              <div class="daily-theme-copy">
                <strong>{{ currentInspiration.title }}</strong>
                <span>{{ currentInspiration.subtitle }}</span>
              </div>
            </div>
            <div class="prompt-tags">
              <button v-for="tag in inspirationTags" :key="tag" type="button" @click="appendPrompt(tag)">{{ tag }}</button>
            </div>
            <div class="row-actions">
              <button class="action-mini-btn dark" type="button" @click="useInspiration">使用此灵感</button>
              <button class="action-mini-btn" type="button" @click="shuffleInspiration">换一组</button>
            </div>
          </div>
        </div>

        <div class="sidebar-block">
          <div class="block-header">
            <div class="block-title"><span>笔</span> 笔墨调配</div>
          </div>
          <div class="block-content brush-panel">
            <div class="slider-field">
              <div class="slider-header">
                <span>笔刷粗细</span>
                <b>{{ brushSize }} px</b>
              </div>
              <input v-model.number="brushSize" type="range" min="1" max="34" />
              <div class="preset-row">
                <button v-for="preset in brushPresets" :key="preset.value" :class="{ active: brushSize === preset.value }" @click="brushSize = preset.value">
                  {{ preset.label }}
                </button>
              </div>
            </div>
            <div class="slider-field">
              <div class="slider-header">
                <span>墨深</span>
                <b>{{ Math.round(opacity * 100) }}%</b>
              </div>
              <input v-model.number="opacity" type="range" min="0.1" max="1" step="0.05" />
            </div>
            <div class="brush-style-group">
              <span class="field-label">国风五色墨</span>
              <div class="palette-swatches">
                <button
                  v-for="color in colors"
                  :key="color"
                  :class="{ active: brushColor === color }"
                  :style="{ background: color }"
                  type="button"
                  @click="brushColor = color"
                ></button>
              </div>
            </div>
            <div class="button-toggle-grid">
              <button :class="{ active: tool === 'brush' }" type="button" @click="tool = 'brush'">毫毛笔</button>
              <button :class="{ active: tool === 'eraser' }" type="button" @click="tool = 'eraser'">宣纸擦</button>
            </div>
          </div>
        </div>

        <div class="sidebar-block treasury-sidebar-block">
          <div class="block-header">
            <div class="block-title"><span>库</span> 丹青百宝箱</div>
          </div>
          <div class="block-content">
            <div class="treasury-tabs">
              <button :class="{ active: tab === 'style' }" @click="tab = 'style'">风格</button>
              <button :class="{ active: tab === 'content' }" @click="tab = 'content'">题材</button>
            </div>
            <div class="style-sidebar-grid">
              <button
                v-for="item in currentCards"
                :key="item.value"
                :class="{ active: (tab === 'style' ? creation.style : creation.content) === item.value }"
                class="style-card"
                type="button"
                @click="selectCard(item.value)"
              >
                <img :src="item.icon" :alt="item.label" />
                <span>{{ item.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="sidebar-block">
          <div class="block-header">
            <div class="block-title"><span>意</span> 意境描述</div>
          </div>
          <div class="block-content prompt-panel">
            <textarea v-model="creation.prompt" placeholder="补充描述：如意境、光影、细节、构图等..."></textarea>
            <input v-model="creation.negative" type="text" placeholder="反向词：不想出现的元素" />
            <div class="row-actions">
              <button class="action-mini-btn" type="button" @click="appendPrompt('金粉云纹，宣纸留白')">灵感补充</button>
              <button class="action-mini-btn" type="button" @click="creation.prompt = ''">清空补充</button>
            </div>
          </div>
        </div>

        <div class="sidebar-block structure-block">
          <div class="block-header">
            <div class="block-title"><span>骨</span> 构图守门</div>
            <label class="structure-switch">
              <input v-model="creation.structureEnabled" type="checkbox" />
              <span>{{ creation.structureEnabled ? '已开启' : '未开启' }}</span>
            </label>
          </div>
          <div v-if="creation.structureEnabled" class="block-content">
            <div v-if="creation.style !== 'calligraphy'" class="quality-row">
              <button
                v-for="option in qualityOptions"
                :key="option.value"
                type="button"
                :class="{ active: creation.quality === option.value }"
                @click="creation.quality = option.value"
              >
                {{ option.label }}
              </button>
            </div>
            <p class="structure-hint">{{ qualityHint }}</p>
          </div>
        </div>

      </aside>

      <section class="workspace-main-panel creation-canvas-panel">
        <div v-show="!stepThreeOpen" class="creation-step-deck" :class="{ 'is-expanded': stepTwoOpen }">
        <div class="panel-header-row source-step-card">
          <button v-if="stepTwoOpen" class="return-drawing" type="button" @click="stepTwoOpen = false">第一步 · 原作与草图 <span>返回绘制 ↑</span></button>
          <div>
            <span class="panel-eyebrow">第一步</span>
            <h3 class="panel-title-text">原作与草图</h3>
          </div>
          <div class="panel-action-group">
            <input ref="sketchInputRef" class="visually-hidden-file" type="file" accept="image/*" @change="handleSketchImport" />
            <button class="header-action-btn highlight" type="button" :disabled="creation.isBusy" @click="sketchInputRef?.click()" title="导入参考图或手写作品">导入作品</button>
            <button class="header-action-btn" type="button"  :disabled="creation.isBusy" @click="canvasRef?.undo()">撤销</button>
            <button class="header-action-btn" type="button"  :disabled="creation.isBusy" @click="canvasRef?.redo()">重做</button>
            <button class="header-action-btn danger" type="button"  :disabled="creation.isBusy" @click="canvasRef?.clear()">清空</button>
          </div>
        </div>
        <div class="creation-workflow" aria-label="生成步骤">
          <button v-if="creation.hasSource && !creation.canGenerate" type="button" :disabled="creation.isBusy || !creation.prompt.trim()" @click="creation.confirmManualDescription()">使用手填画意继续</button>
          <div v-show="stepTwoOpen" id="recognition-step-body" class="recognition-step">
            <div><strong>第二步 · 识图填词</strong><p>{{ creation.canGenerate ? '输入已就绪，可确认画意后生成。' : creation.hasSource ? '先识别原作，再确认画意与细节。' : '导入作品或落笔后，先识图再生成。' }}</p></div>
            <button type="button" :class="{ 'workflow-primary': !creation.canGenerate }" :disabled="creation.isBusy || !creation.hasSource" @click="creation.captionSketch()">
              {{ creation.status === 'captioning' ? '正在识图…' : creation.recognizedSketch ? '重新识图' : '识图填词' }}
            </button>
          </div>
          <button type="button" class="step-deck-handle" :aria-expanded="stepTwoOpen" aria-controls="recognition-step-body" @click="stepTwoOpen = !stepTwoOpen">
            <span>第二步 · {{ creation.canGenerate ? '输入已就绪' : '识图或手填画意' }}</span><span>{{ stepTwoOpen ? '收起 ↑' : '展开 ↓' }}</span>
          </button>
        </div>
        </div>
        <div v-if="stepThreeOpen" class="panel-header-row confirmation-step-card">
          <div><span class="panel-eyebrow">第三步</span><h3 class="panel-title-text">确认本次输入</h3></div>
          <div class="panel-action-group">
            <button class="header-action-btn highlight" type="button" :disabled="creation.isBusy || creation.previewLoading" @click="creation.previewInput('generate')">{{ creation.previewLoading ? '正在载入…' : '查看与修改输入' }}</button>
            <button class="previous-step-link" type="button" @click="stepThreeOpen = false; stepTwoOpen = true">返回上一步</button>
          </div>
        </div>
        <CanvasBoard
          ref="canvasRef"
          :brush-size="brushSize"
          :brush-color="brushColor"
          :opacity="opacity"
          :tool="tool"
          @tool="tool = $event"
          @changed="creation.setSketch"
        />
          <div v-if="!stepThreeOpen" class="drawing-complete-row">
            <button type="button" class="header-action-btn" :disabled="creation.isBusy || !creation.hasSource" @click="completeSketch">{{ completingSketch ? '正在补全…' : '补全草图（可选）' }}</button>
            <button type="button" class="header-action-btn highlight" :disabled="creation.isBusy || !creation.hasSource" @click="stepTwoOpen = true; stepThreeOpen = creation.canGenerate">绘制完成</button>
          </div>

        <p v-if="creation.hasSketchMarks && creation.sketchInkRatio > 0 && creation.sketchInkRatio < 0.005" class="sparse-hint">
          草图墨迹只占 {{ (creation.sketchInkRatio * 100).toFixed(2) }}%，模型容易自行补全。建议多画几笔，或导入一张参考图。
        </p>

      </section>

      <section class="workspace-result-panel creation-result-panel">
        <div class="panel-header-row">
          <div>
            <span class="panel-eyebrow">第四步</span>
            <h3 class="panel-title-text">传神大作</h3>
          </div>
          <button class="header-action-btn highlight" type="button" :disabled="creation.isBusy || !creation.canGenerate || creation.previewLoading" @click="creation.structureEnabled ? creation.runStructured() : creation.run('generate')">{{ creation.isBusy ? '处理中…' : '生成作品' }}</button>
          <div v-if="creation.generatedImage" class="panel-action-group">
            <button class="header-action-btn" type="button" :disabled="creation.isBusy || !creation.canGenerate" @click="creation.structureEnabled ? creation.runStructured() : creation.run('generate')">再来一张</button>
            <button class="header-action-btn highlight" type="button" @click="saveImage">归档</button>
          </div>
        </div>
        <div class="masterpiece-image-wrapper">
          <img
            v-if="creation.generatedImage"
            class="masterpiece-img"
            :src="creation.generatedImage"
            alt="生成结果"
            @error="creation.useImageProxyFallback()"
          />
          <div v-else class="result-placeholder-dark">
            <div class="palette-mark">画</div>
            <div class="placeholder-primary-text">在此展示您的传神大作</div>
            <div class="placeholder-secondary-text">导入或绘制原作，完成识图填词，确认输入后生成。</div>
          </div>
        </div>
        <div v-if="creation.structureReport" class="structure-panel">
          <div class="structure-score-row">
            <span class="structure-score">{{ Math.round((creation.structureReport.score || 0) * 100) }}</span>
            <div class="structure-score-copy">
              <strong>结构体检</strong>
              <span :class="['structure-verdict', creation.structureReport.verdict]">{{ verdictText }}</span>
            </div>
            <button
              v-if="creation.candidates.length > 1"
              class="structure-repro"
              type="button"
              :disabled="creation.isBusy"
              @click="creation.runStructured()"
            >
              复现此组
            </button>
          </div>
          <div class="structure-metrics">
            <div v-for="row in metricRows" :key="row.key" class="structure-metric">
              <span class="metric-name">{{ row.label }}</span>
              <div class="metric-track"><i :style="{ width: row.pct + '%' }"></i></div>
              <span class="metric-num">{{ row.pct }}</span>
            </div>
          </div>
          <ul v-if="creation.structureReport.defects.length" class="structure-defects">
            <li v-for="defect in creation.structureReport.defects" :key="defect.code">
              <span>{{ defect.message }}</span>
            </li>
          </ul>
          <div v-if="creation.candidates.length > 1" class="candidate-strip">
            <button
              v-for="(candidate, index) in creation.candidates"
              :key="index"
              type="button"
              :class="{ active: creation.generatedImage === candidate.image }"
              @click="creation.selectCandidate(index)"
            >
              <img :src="candidate.image" :alt="`候选 ${index + 1}`" />
              <span>{{ Math.round((candidate.report?.score || 0) * 100) }}</span>
            </button>
          </div>
          <details v-if="creation.contractSummary.length" class="contract-box">
            <summary>画意契约：AI 会守住什么</summary>
            <ul>
              <li v-for="line in creation.contractSummary" :key="line">{{ line }}</li>
            </ul>
          </details>
        </div>
        <div class="masterpiece-footer-actions creation-result-actions">

          <button
            class="enhance-main-btn sketch-edit-btn"
            type="button"
            :disabled="creation.isBusy || !creation.generatedImage || !creation.canGenerate"
            @click="creation.run('enhance', 'image')"
          >
            精修当前成图
          </button>
          <RouterLink class="enhance-main-btn video-workshop-link" to="/animation">前往 AIGC 动画工坊</RouterLink>
        </div>
        <p class="input-hint">精修以右侧当前成图为基础进行调整。</p>
        <p v-if="creation.lastInput" class="input-hint">
          上次生成使用的是：{{ creation.lastInput === 'image' ? '上一张成图（不是画布草图）' : '当前画布草图' }}
        </p>
        <ProgressStream :items="creation.progress" />
        <p v-if="creation.error" class="error-text">{{ creation.error }}</p>
      </section>
    </div>
    <Teleport to="body">
      <dialog ref="sketchDraftDialog" class="creation-input-dialog" aria-labelledby="sketch-draft-title" @cancel="discardSketchDraft" @close="creation.sketchDraft = ''">
        <header class="input-dialog-header"><div><h2 id="sketch-draft-title">确认补全草图</h2><p>采用后更新画布；放弃则保留原稿。</p></div><button type="button" :disabled="applyingSketch" @click="discardSketchDraft">关闭 ×</button></header>
        <div class="input-dialog-content sketch-comparison">
          <figure><figcaption>补全前</figcaption><img v-if="creation.sketchDraftSource" :src="creation.sketchDraftSource" alt="补全前的草图" /></figure>
          <figure><figcaption>补全后</figcaption><img v-if="creation.sketchDraft" :src="creation.sketchDraft" alt="补全后的草图" /></figure>
        </div>
        <footer class="input-dialog-footer"><button type="button" :disabled="applyingSketch" @click="discardSketchDraft">放弃补全</button><button type="button" class="save-input-btn" :disabled="applyingSketch" @click="adoptSketchDraft">{{ applyingSketch ? '正在载入…' : '采用并进入识图' }}</button></footer>
      </dialog>
      <dialog ref="inputDialog" class="creation-input-dialog" aria-labelledby="input-dialog-title" @close="creation.previewOpen = false" @cancel="creation.previewOpen = false" @click="closeInputBackdrop">
        <header class="input-dialog-header"><div><h2 id="input-dialog-title">查看并修改本次输入</h2><p>确认原作，修改创作提示词与反向词。</p></div><button type="button" aria-label="关闭本次输入" @click="creation.previewOpen = false">关闭 ×</button></header>
        <div class="input-dialog-content">
          <div class="input-image"><img v-if="creation.previewImage" :src="creation.previewImage" alt="本次输入的完整原作" /></div>
          <div class="input-edit-fields">
            <label for="input-positive">创作提示词</label><textarea id="input-positive" v-model="creation.previewPrompt" maxlength="12000"></textarea>
            <label for="input-negative">反向词 · 不希望出现的内容</label><textarea id="input-negative" v-model="creation.previewNegative" maxlength="12000" placeholder="可自行填写或清空"></textarea>
            <p v-if="creation.error" class="error-text">{{ creation.error }}</p>
          </div>
        </div>
        <footer class="input-dialog-footer"><button type="button" @click="creation.previewOpen = false">取消修改</button><button type="button" class="save-input-btn" @click="creation.savePreviewEdits()">保存修改</button></footer>
      </dialog>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import StudioHero from '@/components/StudioHero.vue'
import CanvasBoard from '@/components/CanvasBoard.vue'
import ProgressStream from '@/components/ProgressStream.vue'
import { useCreationStore } from '@/stores/creation'
import { useGalleryStore } from '@/stores/gallery'

type CanvasExpose = { clear: () => void; undo: () => void; redo: () => void; loadImage: (dataUrl: string) => Promise<void> }

const creation = useCreationStore()
const initialSketch = creation.sketch
const inputDialog = ref<HTMLDialogElement | null>(null)
const sketchDraftDialog = ref<HTMLDialogElement | null>(null)
const completingSketch = ref(false)
const applyingSketch = ref(false)
async function completeSketch() {
  completingSketch.value = true
  try {
    await creation.completeSketch()
    if (creation.sketchDraft) { await nextTick(); sketchDraftDialog.value?.showModal() }
  } finally { completingSketch.value = false }
}
function discardSketchDraft() { sketchDraftDialog.value?.close(); creation.sketchDraft = '' }
async function adoptSketchDraft() {
  applyingSketch.value = true
  try {
    const draft = creation.sketchDraft
    const url = draft.startsWith('data:') || draft.startsWith('/') ? draft : `/api/image-proxy?url=${encodeURIComponent(draft)}`
    const response = await fetch(url)
    if (!response.ok) throw new Error('补全图片读取失败，请重试。')
    const blob = await response.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    await canvasRef.value!.loadImage(dataUrl)
    stepThreeOpen.value = false
    stepTwoOpen.value = true
    discardSketchDraft()
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '草图载入失败') }
  finally { applyingSketch.value = false }
}
const controlRailRef = ref<HTMLElement | null>(null)
const controlRailHeight = ref(0)
const railObserver = new ResizeObserver(([entry]) => {
  controlRailHeight.value = entry.target.getBoundingClientRect().height
})
onMounted(async () => {
  railObserver.observe(controlRailRef.value!)
  if (!initialSketch) return
  await nextTick()
  try { await canvasRef.value?.loadImage(initialSketch) }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '原作恢复失败') }
})
onBeforeUnmount(() => railObserver.disconnect())
const stepTwoOpen = ref(false)
const stepThreeOpen = ref(creation.canGenerate)
watch(() => creation.canGenerate, ready => { stepThreeOpen.value = ready })

watch(() => creation.previewOpen, async open => {
  await nextTick()
  if (open && !inputDialog.value?.open) inputDialog.value?.showModal()
  if (!open && inputDialog.value?.open) inputDialog.value.close()
})
function closeInputBackdrop(event: MouseEvent) {
  if (event.target === inputDialog.value) creation.previewOpen = false
}

const gallery = useGalleryStore()
const canvasRef = ref<CanvasExpose | null>(null)
const sketchInputRef = ref<HTMLInputElement | null>(null)
const brushSize = ref(3)
const brushColor = ref('#111111')
const opacity = ref(1)
const tool = ref<'brush' | 'eraser'>('brush')
const tab = ref<'style' | 'content'>('style')
const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
const inspirationIndex = ref(0)
const inspirationThemes = [
  {
    badge: '龙',
    title: '腾龙驾云',
    subtitle: '龙腾盛世',
    content: 'dragon',
    image: '/assets/icons/content_dragon.png',
    tags: ['巨龙', '祥云', '波涛', '火焰', '鳞片', '腾飞'],
    prompt: '腾龙驾云，龙腾盛世，祥云翻涌，金粉点缀',
  },
  {
    badge: '山',
    title: '烟岚远山',
    subtitle: '云水入画',
    content: 'landscape',
    image: '/assets/icons/content_landscape.png',
    tags: ['远山', '云雾', '亭台', '江水', '松林', '留白'],
    prompt: '烟岚远山，云水入画，亭台隐现，宣纸留白',
  },
  {
    badge: '花',
    title: '春枝花鸟',
    subtitle: '一枝见春',
    content: 'birds',
    image: '/assets/icons/content_birds.png',
    tags: ['花枝', '飞鸟', '春风', '淡彩', '细线', '生机'],
    prompt: '春枝花鸟，一枝见春，淡彩晕染，飞鸟停栖',
  },
  {
    badge: '飞',
    title: '飞天流云',
    subtitle: '敦煌余韵',
    content: 'flying',
    image: '/assets/icons/content_flying.png',
    tags: ['飞天', '飘带', '流云', '矿物色', '壁画', '金粉'],
    prompt: '敦煌飞天，飘带流云，矿物色壁画质感，金粉微光',
  },
]
const currentInspiration = computed(() => inspirationThemes[inspirationIndex.value])
const inspirationTags = computed(() => currentInspiration.value.tags)
const brushPresets = [
  { label: '勾勒', value: 1 },
  { label: '细描', value: 3 },
  { label: '皴染', value: 8 },
  { label: '泼墨', value: 15 },
]
const colors = ['#000000', '#2b2b2b', '#4a4a4a', '#6b6b6b', '#8B4513', '#2E8B57']

const styles = [
  { label: '水墨', value: 'ink', icon: '/assets/icons/style_ink.png' },
  { label: '青花瓷', value: 'bluewhite', icon: '/assets/icons/style_bluewhite.png' },
  { label: '敦煌', value: 'dunhuang', icon: '/assets/icons/style_dunhuang.png' },
  { label: '工笔', value: 'gongbi', icon: '/assets/icons/style_gongbi.png' },
  { label: '宋画', value: 'song', icon: '/assets/icons/style_song.png' },
  { label: '宫廷', value: 'court', icon: '/assets/icons/style_court.png' },
  { label: '现代', value: 'modern', icon: '/assets/icons/style_modern.png' },
  { label: '书法', value: 'calligraphy', icon: '/assets/icons/style_calligraphy.png' },
  { label: '明式', value: 'ming', icon: '/assets/icons/style_ming.png' },
]

const contents = [
  { label: '山水', value: 'landscape', icon: '/assets/icons/content_landscape.png' },
  { label: '花鸟', value: 'birds', icon: '/assets/icons/content_birds.png' },
  { label: '人物', value: 'figure', icon: '/assets/icons/content_figure.png' },
  { label: '花卉', value: 'flowers', icon: '/assets/icons/content_flowers.png' },
  { label: '鱼虫', value: 'fish', icon: '/assets/icons/content_fish.png' },
  { label: '建筑', value: 'architecture', icon: '/assets/icons/content_architecture.png' },
  { label: '云雾', value: 'cloud', icon: '/assets/icons/content_clouds.png' },
  { label: '飞天', value: 'flying', icon: '/assets/icons/content_flying.png' },
  { label: '龙凤', value: 'dragon', icon: '/assets/icons/content_dragon.png' },
]

const currentCards = computed(() => (tab.value === 'style' ? styles : contents))

const qualityOptions = [
  { value: 'fast' as const, label: '快速 1 张' },
  { value: 'standard' as const, label: '标准 2 张' },
  { value: 'fine' as const, label: '精绘 3 张' },
]

const qualityHint = computed(() => {
  if (creation.style === 'calligraphy') return '本地分层保留墨迹，无需识图或在线模型，生成一张作品。'
  if (creation.quality === 'fast') return '单张生成，不做择优；适合快速试笔。'
  if (creation.quality === 'fine') return '生成 3 张择优，不达标会自动定向返修；耗时与调用最多。'
  return '生成 2 张择优，默认开启一次定向返修。'
})

const verdictText = computed(() => {
  const report = creation.structureReport
  if (!report) return ''
  if (creation.structureMetrics?.glyphIoU && creation.structureMetrics.glyphIoU > 0.95 && creation.structureContract?.style === 'calligraphy') {
    return '字形保持通过'
  }
  return report.verdict === 'accept' ? '结构通过' : '仍有结构缺陷，请检查'
})

const metricRows = computed(() => {
  const metrics = creation.structureMetrics
  if (!metrics) return []
  const rows = [
    { key: 'lineFollow', label: '线跟随', pct: Math.round((metrics.lineFollow || 0) * 100) },
    { key: 'whitespace', label: '留白保持', pct: Math.round((metrics.whitespace || 0) * 100) },
    { key: 'layoutSim', label: '布局相似', pct: Math.round((metrics.layoutSim || 0) * 100) },
  ]
  if (creation.structureContract?.style === 'calligraphy') {
    rows.push({ key: 'glyphIoU', label: '字形保真', pct: Math.round((metrics.glyphIoU || 0) * 100) })
  } else {
    rows.push({
      key: 'drift',
      label: '重心稳定',
      pct: Math.round((1 - Math.min(1, (metrics.drift || 0) / 0.15)) * 100),
    })
  }
  return rows
})

function selectCard(value: string) {
  if (tab.value === 'style') creation.style = value
  else creation.content = value
}

function appendPrompt(text: string) {
  creation.prompt = creation.prompt ? `${creation.prompt}，${text}` : text
}

function useInspiration() {
  creation.content = currentInspiration.value.content
  appendPrompt(currentInspiration.value.prompt)
}

function shuffleInspiration() {
  inspirationIndex.value = (inspirationIndex.value + 1) % inspirationThemes.length
  creation.content = currentInspiration.value.content
}

async function saveImage() {
  if (!creation.generatedImage) return ElMessage.warning('请先生成一张作品')
  try {
    await gallery.save({
      image: creation.generatedImage,
      content: creation.content,
      style: creation.style,
      prompt: creation.promptUsed || creation.prompt,
    })
    ElMessage.success('已归档到我的画廊')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败，请先确认已登录')
  }
}

function handleSketchImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    ElMessage.warning('请选择 PNG、JPG 等图片格式的作品')
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = async () => {
    try {
      await canvasRef.value?.loadImage(String(reader.result || ''))
      creation.prompt = ''
      creation.caption = null
      creation.generatedImage = ''
      creation.promptUsed = ''
      creation.progress = []
      if (creation.status === 'error' || creation.status === 'done') creation.status = 'idle'
      creation.error = ''
      ElMessage.success('原作已导入，可直接选择风格生成')
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '导入作品失败')
    } finally {
      input.value = ''
    }
  }
  reader.onerror = () => {
    ElMessage.error('读取作品文件失败')
    input.value = ''
  }
  reader.readAsDataURL(file)
}
</script>

<style scoped lang="scss">
.creation-redesign {
  .creation-hero-strip {
    padding: 20px 26px;
    gap: 20px;

    > div:first-child { min-width: 0; }
    h1 { font-size: var(--page-heading-size); line-height: var(--page-heading-line-height); overflow-wrap: anywhere; }
    p { font-size: 14px; line-height: 1.7; }
  }

  .creation-kicker { margin-bottom: 6px; font-size: 14px; }
  .creation-shell > * { min-width: 0; }

  .palette-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 5px;

    button { flex: 0 0 32px; width: 32px; height: 32px; padding: 0; box-sizing: border-box; }
  }

  .prompt-tags { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .prompt-tags button { min-width: 0; min-height: 36px; padding: 6px 8px; line-height: 1.5; }
  .row-actions { gap: 10px; margin-top: 14px; }
  .action-mini-btn { line-height: 1.5; }

  .creation-result-panel {
    height: auto;
    min-height: 0;
    align-self: start;
    overflow: visible;
  }

  .creation-result-panel .panel-header-row { flex: 0 0 auto; flex-wrap: wrap; gap: 12px; }

  .masterpiece-image-wrapper {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    padding: 12px;
    box-sizing: border-box;
  }

  .masterpiece-img {
    display: block;
    width: 100%;
    height: auto;
    max-width: 100%;
    max-height: none;
    box-sizing: border-box;
    object-fit: contain;
  }

  .result-placeholder-dark { box-sizing: border-box; margin: 24px 0; }
  .creation-result-actions { flex: 0 0 auto; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-top: 16px; }
  .creation-result-actions .sketch-edit-btn { border: 1px solid #a3341f; background: transparent; color: #a3341f; }
  .input-hint { margin: 10px 0 0; font-size: 12px; line-height: 1.6; color: #8a7a62; }
  .creation-result-actions > * { min-width: 0; box-sizing: border-box; padding: 10px 12px; line-height: 1.5; }
  :deep(.progress-stream) { flex: 0 0 auto; min-width: 0; margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(139, 115, 85, .18); }
  :deep(.stream-line) { align-items: flex-start; line-height: 1.7; }
  :deep(.stream-line > span:last-child) { min-width: 0; overflow-wrap: anywhere; }
  :deep(.stream-dot) { flex: 0 0 8px; margin-top: 7px; }

  .sparse-hint {
    margin: 10px 0 0;
    padding: 8px 10px;
    border-left: 3px solid #a3341f;
    background: #f9efe9;
    color: #8a4a35;
    font-size: 12px;
    line-height: 1.7;
  }

  .structure-switch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #7a6a52;

    input { accent-color: #a3341f; }
  }

  .quality-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;

    button {
      min-height: 34px;
      padding: 6px 4px;
      border: 1px solid rgba(139, 115, 85, .28);
      border-radius: 6px;
      background: rgba(255, 255, 255, .55);
      color: #4a4034;
      font-size: 12px;
      cursor: pointer;

      &.active {
        border-color: #a3341f;
        background: rgba(163, 52, 31, .1);
        color: #a3341f;
        font-weight: 600;
      }
    }
  }

  .structure-hint {
    margin: 10px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: #8a7a62;
  }

  .structure-panel {
    margin-top: 14px;
    padding: 14px;
    border: 1px solid rgba(139, 115, 85, .22);
    border-radius: 10px;
    background: rgba(255, 255, 255, .6);
    color: #3a3226;

    .structure-score-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .structure-score {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: #a3341f;
      color: #fdf8ee;
      font-size: 18px;
      font-weight: 700;
    }

    .structure-score-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;

      strong { font-size: 14px; }
    }

    .structure-verdict {
      font-size: 12px;
      color: #7a6a52;

      &.accept { color: #3f7a4a; }
      &.repair { color: #a3341f; }
    }

    .structure-repro {
      margin-left: auto;
      padding: 6px 12px;
      border: 1px solid rgba(139, 115, 85, .3);
      border-radius: 6px;
      background: transparent;
      color: #6b5b44;
      font-size: 12px;
      cursor: pointer;
    }

    .structure-metrics {
      display: grid;
      gap: 6px;
      margin-top: 12px;
    }

    .structure-metric {
      display: grid;
      grid-template-columns: 62px 1fr 30px;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }

    .metric-name { color: #7a6a52; }

    .metric-track {
      height: 6px;
      border-radius: 3px;
      background: rgba(139, 115, 85, .16);
      overflow: hidden;

      i {
        display: block;
        height: 100%;
        border-radius: 3px;
        background: linear-gradient(90deg, #b08a4a, #a3341f);
      }
    }

    .metric-num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: #6b5b44;
    }

    .structure-defects {
      margin: 10px 0 0;
      padding-left: 18px;
      font-size: 12px;
      line-height: 1.7;
      color: #9b3d28;
    }

    .candidate-strip {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      overflow-x: auto;

      button {
        position: relative;
        flex: 0 0 auto;
        width: 76px;
        padding: 0;
        border: 2px solid transparent;
        border-radius: 8px;
        overflow: hidden;
        background: #f4efe4;
        cursor: pointer;

        &.active { border-color: #a3341f; }

        img {
          display: block;
          width: 100%;
          height: 76px;
          object-fit: cover;
        }

        span {
          position: absolute;
          right: 4px;
          bottom: 4px;
          padding: 1px 5px;
          border-radius: 4px;
          background: rgba(20, 16, 12, .72);
          color: #fdf8ee;
          font-size: 11px;
          font-variant-numeric: tabular-nums;
        }
      }
    }

    .contract-box {
      margin-top: 12px;
      font-size: 12px;
      color: #6b5b44;

      summary { cursor: pointer; color: #8a6a3a; }

      ul {
        margin: 8px 0 0;
        padding-left: 18px;
        line-height: 1.8;
      }
    }
  }
}
</style>
<style scoped>
.creation-redesign .creation-canvas-panel { height: auto; overflow: visible; align-self: start; }
.creation-canvas-panel .panel-header-row { flex-wrap: wrap; gap: 14px; }
.creation-workflow { margin: 0 0 20px; padding: 18px; border: 1px solid #d9cdb5; border-radius: 14px; background: #f6f0e4; }
.recognition-step { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.recognition-step strong { font-size: 16px; color: #55452f; }
.recognition-step p { margin: 6px 0 0; color: #857154; font-size: 13px; line-height: 1.8; }
.creation-workflow button { font: inherit; font-size: 14px; padding: 11px 16px; border: 1px solid #cbbd9e; border-radius: 9px; color: #685335; background: #fffcf5; cursor: pointer; }
.creation-workflow button:disabled { opacity: .45; cursor: default; }
.creation-workflow .workflow-primary, .save-input-btn { color: #fff0cc; background: #302b21; border-color: #302b21; }
.generation-step { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 16px; padding-top: 14px; border-top: 1px solid #e0d5bf; }
.creation-input-dialog { width: min(1040px,94vw); max-width: 94vw; max-height: 90dvh; box-sizing: border-box; padding: 0; border: 1px solid #cdbd9f; border-radius: 16px; background: #fffdf7; color: #3a3126; overflow: auto; }
.creation-input-dialog::backdrop { background: #18150fbb; }
.input-dialog-header { position: sticky; top: 0; z-index: 2; display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; padding: 20px 24px; background: #fffdf7; border-bottom: 1px solid #e2d8c6; }
.input-dialog-header h2 { font-size: 23px; margin: 0 0 8px; }
.input-dialog-header p { margin: 0; font-size: 13px; color: #8a7556; }
.creation-input-dialog button { padding: 10px 18px; font: inherit; font-size: 14px; border: 1px solid #ccbea4; border-radius: 9px; color: #6d5738; background: #f9f3e8; cursor: pointer; }
.input-dialog-header button { white-space: nowrap; }
.input-dialog-content { display: grid; grid-template-columns: minmax(0,.8fr) minmax(0,1.2fr); gap: 24px; padding: 24px; }
.input-image { min-width: 0; display: flex; align-items: flex-start; justify-content: center; background: #f2ede2; border-radius: 10px; }
.input-image img { display: block; width: 100%; max-height: 56dvh; object-fit: contain; }
.input-edit-fields label { display: block; font-size: 15px; margin-bottom: 10px; color: #6c5739; }
.input-edit-fields textarea { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #d3c6ae; border-radius: 9px; background: #fffdf8; color: #42372a; font: inherit; font-size: 14px; line-height: 1.8; resize: vertical; }
#input-positive { min-height: 240px; margin-bottom: 18px; }
#input-negative { min-height: 110px; }
.input-dialog-footer { position: sticky; bottom: 0; display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; background: #fffdf7; border-top: 1px solid #e2d8c6; }
.creation-input-dialog .save-input-btn { background: #302b21; color: #fff0cc; }
@media(max-width: 700px) { .input-dialog-content { grid-template-columns: 1fr; } .input-image img { max-height: 32dvh; } .recognition-step { align-items: flex-start; flex-direction: column; } }
</style>

<style scoped>
.creation-redesign { --creation-preview-height: clamp(320px, 45vh, 460px); }
.creation-step-deck { margin-bottom: 20px; }
.creation-step-deck .source-step-card { position: relative; z-index: 2; margin: 0; }
.creation-step-deck .creation-workflow { position: relative; z-index: 1; margin: -22px 12px 0; padding: 22px 16px 0; border-radius: 0 0 14px 14px; background: #eee5d2; box-shadow: 0 7px 14px #51432c12; }
.creation-step-deck.is-expanded .creation-workflow { padding-top: 38px; }
.creation-step-deck .recognition-step { padding-bottom: 12px; }
.creation-workflow .step-deck-handle { width: 100%; display: flex; justify-content: space-between; align-items: center; border: 0; padding: 9px 0; border-radius: 0; background: transparent; font-size: 12px; color: #806b49; }
.creation-step-deck.is-expanded .step-deck-handle { border-top: 1px solid #d8c9aa; }
.creation-canvas-panel :deep(.sketch-canvas-wrapper) { flex: none; height: auto; min-height: 0; }
.creation-redesign .masterpiece-image-wrapper { height: var(--creation-preview-height); min-height: 0; }
.creation-redesign .masterpiece-img { width: 100%; height: 100%; max-height: 100%; object-fit: contain; }
.creation-redesign .result-placeholder-dark { margin: 0; max-height: 100%; overflow: auto; }
.creation-canvas-panel > .generation-step { margin-top: 16px; }
@media(max-width: 1480px) and (min-width: 901px) { .creation-redesign .creation-shell { grid-template-columns: 240px minmax(0,1fr) minmax(0,1fr); } .creation-redesign .creation-shell > * { min-width: 0; } }
@media(max-width: 900px) { .creation-redesign .creation-shell { grid-template-columns: minmax(0,1fr); } }
</style>

<style scoped>
.creation-step-deck .source-step-card { padding: 16px 18px; gap: 12px; }
.source-step-card .panel-action-group { gap: 8px; }
.source-step-card .header-action-btn { font-size: 13px; padding: 8px 12px; }
@media(max-width: 1480px) and (min-width: 901px) {
  .creation-redesign .daily-theme { display: grid; grid-template-columns: 80px minmax(0,1fr); gap: 10px; }
  .creation-redesign .daily-theme-image { width: 80px; height: 80px; min-width: 0; }
  .creation-redesign .daily-theme-copy { min-width: 0; }
  .creation-redesign .daily-theme-copy strong { font-size: 22px; line-height: 1.35; }
  .creation-redesign .daily-theme-copy span { font-size: 13px; line-height: 1.5; }
}
/* 桌面端由左栏实际高度决定中间面板高度，画布占满剩余空间。 */
@media (min-width: 901px) {
  .creation-redesign .creation-control-rail { align-self: start; }
  .creation-redesign .creation-canvas-panel { display: flex; flex-direction: column; box-sizing: border-box; height: var(--control-rail-height); min-height: 600px; }
  .creation-canvas-panel :deep(.sketch-canvas-wrapper) { flex: 1; min-height: 200px; }
  .creation-canvas-panel :deep(.canvas-scroll-frame-dark) { flex: 1; height: 0; min-height: 160px; }
  .creation-canvas-panel .creation-step-deck,
  .creation-canvas-panel .generation-step,
  .creation-canvas-panel .sparse-hint { flex-shrink: 0; }
}

.drawing-complete-row { display: flex; justify-content: flex-end; padding-top: 12px; flex-shrink: 0; }
.creation-step-deck { display: flex; flex-direction: column; }
.creation-step-deck.is-expanded .creation-workflow { order: 0; z-index: 2; margin: 0; padding: 18px; border-radius: 16px; }
.creation-step-deck.is-expanded .source-step-card { order: 1; z-index: 1; margin: -16px 12px 0; padding: 24px 16px 10px; }
.creation-step-deck.is-expanded .source-step-card > div { display: none; }
.return-drawing { display: flex; justify-content: space-between; gap: 16px; width: 100%; background: transparent; border: 0; color: #d8c58c; font-size: 12px; cursor: pointer; padding: 0; }
.creation-step-deck.is-expanded .step-deck-handle { display: none; }

.confirmation-step-card { flex-shrink: 0; margin-bottom: 20px; flex-wrap: wrap; gap: 14px; }
.previous-step-link { background: transparent; border: 0; padding: 8px 0; color: #d8c58c; text-decoration: underline; text-underline-offset: 4px; cursor: pointer; font-size: 13px; }

.drawing-complete-row { gap: 10px; flex-wrap: wrap; }
.sketch-comparison figure { margin: 0; min-width: 0; }
.sketch-comparison figcaption { margin-bottom: 10px; color: #806b49; }
.sketch-comparison img { display: block; width: 100%; height: 45vh; object-fit: contain; background: #faf8f4; }
</style>

