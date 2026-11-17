import { defineStore } from 'pinia'
import * as api from '@/api'
import type {
  CaptionResult,
  GenerateRequest,
  SseMessage,
  StructureCandidate,
  StructureContract,
  StructureMetrics,
  StructureReport,
  StructureSseMessage,
} from '@/types'

function normalizeCreationError(error: unknown) {
  const message = error instanceof Error ? error.message : '生成失败'
  const detail = typeof (error as { detail?: unknown })?.detail === 'string'
    ? String((error as { detail?: string }).detail)
    : ''
  const raw = `${message} ${detail}`

  if (/SILICONFLOW_API_KEY|API Key|api key|硅基流动 API Key/i.test(raw)) {
    return '硅基流动 API Key 未配置、为空或后端未重启，请检查 server/.env 并重启后端。'
  }
  if (/timeout|超时/i.test(raw)) {
    return '云端生成等待超时，请先用较简单的草图和提示词重试，或稍后再生成。'
  }
  if (/HTTP 401|unauthorized|invalid api/i.test(raw)) {
    return '硅基流动 API Key 无效或权限不足，请检查账号与模型权限。'
  }
  if (/HTTP 429|rate limit|too many/i.test(raw)) {
    return '硅基流动当前限流或排队拥堵，请稍后重试。'
  }
  if (/missing image output url|missing content|invalid JSON/i.test(raw)) {
    return '云端返回结果格式异常，请稍后重试或更换模型配置。'
  }

  return detail ? `${message}：${detail.slice(0, 180)}` : message
}

interface CreationState {
  sketch: string
  hasSketchMarks: boolean
  prompt: string
  content: string
  style: string
  negative: string
  sketchDraft: string
  sketchDraftSource: string
  generatedImage: string
  promptUsed: string
  caption: CaptionResult | null
  recognizedSketch: string
  captionPrompt: string
  previewLoading: boolean
  inputOverride: { prompt: string; negative: string; sketch: string; description: string; style: string; content: string; structured: boolean } | null
  progress: SseMessage[]
  status: 'idle' | 'captioning' | 'generating' | 'enhancing' | 'done' | 'error'
  error: string
  lastInput: '' | 'sketch' | 'image'
  sketchInkRatio: number
  previewOpen: boolean
  previewImage: string
  previewPrompt: string
  previewNegative: string
  structureEnabled: boolean
  quality: 'fast' | 'standard' | 'fine'
  structureReport: StructureReport | null
  structureMetrics: StructureMetrics | null
  structureContract: StructureContract | null
  contractSummary: string[]
  candidates: StructureCandidate[]
  lastSeed: number | null
}

export const useCreationStore = defineStore('creation', {
  state: (): CreationState => ({
    sketch: '',
    hasSketchMarks: false,
    prompt: '',
    content: 'landscape',
    style: 'ink',
    negative: '低清晰度，畸形，现代塑料感，过度饱和，额外标志',
    sketchDraft: '',
    sketchDraftSource: '',
    generatedImage: '',
    promptUsed: '',
    caption: null,
    recognizedSketch: '',
    captionPrompt: '',
    previewLoading: false,
    inputOverride: null,
    progress: [],
    status: 'idle',
    error: '',
    lastInput: '',
    sketchInkRatio: 0,
    previewOpen: false,
    previewImage: '',
    previewPrompt: '',
    previewNegative: '',
    structureEnabled: false,
    quality: 'standard',
    structureReport: null,
    structureMetrics: null,
    structureContract: null,
    contractSummary: [],
    candidates: [],
    lastSeed: null,
  }),
  getters: {
    hasSource: (state) => Boolean(state.sketch && state.hasSketchMarks),
    canGenerate: (state) => Boolean(state.sketch && state.hasSketchMarks && (state.recognizedSketch === state.sketch || (state.structureEnabled && state.style === 'calligraphy'))),
    isBusy: (state) => ['captioning', 'generating', 'enhancing'].includes(state.status),
    latestMessage: (state) => state.progress[state.progress.length - 1]?.message || '',
  },
  actions: {
    setSketch(dataUrl: string, hasMarks = true, inkRatio = 0) {
      if (this.sketch !== dataUrl) {
        this.recognizedSketch = ''
        this.caption = null
        this.inputOverride = null
      }
      this.sketch = dataUrl
      this.hasSketchMarks = hasMarks
      this.sketchInkRatio = inkRatio
      if (hasMarks) this.error = ''
      if (hasMarks && this.status === 'error') this.status = 'idle'
    },
    confirmManualDescription() {
      if (this.isBusy || !this.hasSource || !this.prompt.trim()) return
      this.recognizedSketch = this.sketch
      this.caption = null
      this.error = ''
      this.status = 'idle'
    },
    setDrawPrompt(prompt: string) {
      this.prompt = prompt
    },
    useImageProxyFallback() {
      if (/^https?:\/\//i.test(this.generatedImage)) {
        this.generatedImage = `/api/image-proxy?url=${encodeURIComponent(this.generatedImage)}`
      }
    },
    buildRequest(mode: 'generate' | 'enhance' = 'generate'): GenerateRequest {
      const edit = this.inputOverride
      const useEdit = mode === 'generate' && edit && edit.sketch === this.sketch && edit.description === this.prompt && edit.style === this.style && edit.content === this.content && edit.structured === this.structureEnabled && edit.negative === this.negative
      return {
        sketch: this.sketch,
        prompt: this.prompt,
        content: this.content,
        style: this.style,
        negative: this.negative,
        options: useEdit ? { positive_prompt: edit.prompt, negative_prompt: edit.negative } : {},
      }
    },
    async captionSketch() {
      if (this.isBusy) return
      if (!this.sketch) {
        this.error = '请先在画布上留下草图，再进行识别。'
        return
      }
      const source = this.sketch
      this.status = 'captioning'
      this.error = ''
      try {
        const res = await api.caption(source)
        if (source !== this.sketch) return
        if (!res.caption?.subject) throw new Error('未能识别画面主体，请重新识图。')
        this.caption = res.caption || null
        if (res.caption?.subject) {
          const description = [res.caption.subject, res.caption.scene].filter(Boolean).join('，')
          if (!this.prompt.trim() || this.prompt === this.captionPrompt) this.prompt = description
          this.captionPrompt = description
          this.recognizedSketch = source
          this.inputOverride = null
        }
      } catch (error) {
        this.error = normalizeCreationError(error)
      } finally {
        this.status = this.error ? 'error' : 'idle'
      }
    },
    async completeSketch() {
      if (this.isBusy || !this.hasSource) return
      this.status = 'enhancing'
      this.error = ''
      this.sketchDraft = ''
      this.sketchDraftSource = this.sketch
      const request = this.buildRequest('enhance')
      request.prompt = '补齐草图中断开的轮廓、缺失的局部形体，整理杂乱线条。保持主体身份、姿态、位置、比例和原有配色。输出清晰的草图线稿，保留纸面留白，不渲染成成品画，不新增人物或场景。' + (this.prompt ? `用户补充：${this.prompt}` : '')
      request.options = { ...request.options, positive_prompt: request.prompt, negative_prompt: this.negative }
      try {
        await api.streamEnhance(request, message => {
          if (message.image) this.sketchDraft = message.image
        })
        if (!this.sketchDraft) throw new Error('补全结束但没有返回草图，请稍后重试。')
        this.status = 'done'
      } catch (error) {
        this.sketchDraft = ''
        this.status = 'error'
        this.error = normalizeCreationError(error)
      }
    },
    async run(mode: 'generate' | 'enhance' = 'generate', target: 'sketch' | 'image' = 'sketch') {
      if (this.isBusy) return
      if (!this.sketch) {
        this.error = '请导入参考图、手写作品，或在画布上落笔后再生成。'
        return
      }
      if (!this.canGenerate) { this.error = '请先完成识图填词，再确认输入并生成。'; return }
      this.status = mode === 'generate' ? 'generating' : 'enhancing'
      this.error = ''
      this.progress = []
      const previousImage = this.generatedImage
      const request = this.buildRequest(mode)
      const usePreviousImage = mode === 'enhance' && target === 'image' && Boolean(previousImage)
      this.lastInput = usePreviousImage ? 'image' : 'sketch'
      if (usePreviousImage) {
        request.sketch = previousImage.startsWith('/api/image-proxy?')
          ? new URLSearchParams(previousImage.split('?')[1]).get('url')!
          : previousImage
      }
      let receivedImage = false
      const onMessage = (message: SseMessage) => {
        this.progress.push(message)
        if (message.image) {
          this.generatedImage = message.image
          receivedImage = true
        }
        if (message.prompt_used) this.promptUsed = message.prompt_used
        if (message.caption) this.caption = message.caption
      }
      try {
        if (mode === 'generate') await api.streamGenerate(request, onMessage)
        else await api.streamEnhance(request, onMessage)
        if (!receivedImage) throw new Error('生成结束但没有返回图片，请稍后重试。')
        this.status = 'done'
      } catch (error) {
        this.status = 'error'
        this.error = normalizeCreationError(error)
      }
    },
    async previewInput(mode: 'generate' | 'enhance' = 'generate', target: 'sketch' | 'image' = 'sketch') {
      if (!this.sketch) {
        this.error = '请先在画布上落笔，或导入参考图。'
        return
      }
      if (this.previewLoading || this.isBusy) return
      this.previewLoading = true
      const request = this.buildRequest(mode)
      request.options = { ...request.options, structured: this.structureEnabled }
      if (mode === 'enhance' && target === 'image' && this.generatedImage) {
        request.sketch = this.generatedImage.startsWith('/api/image-proxy?')
          ? new URLSearchParams(this.generatedImage.split('?')[1]).get('url')!
          : this.generatedImage
      }
      try {
        const res = await api.previewGeneration({ ...request, mode })
        this.previewImage = res.input_image
        this.previewPrompt = res.prompt
        this.previewNegative = res.negative
        this.previewOpen = true
      } catch (error) {
        this.error = normalizeCreationError(error)
      } finally { this.previewLoading = false }
    },
    savePreviewEdits() {
      if (!this.previewPrompt.trim()) { this.error = '创作提示词不能为空。'; return }
      this.negative = this.previewNegative
      this.inputOverride = {
        prompt: this.previewPrompt, negative: this.previewNegative, sketch: this.sketch,
        description: this.prompt, style: this.style, content: this.content, structured: this.structureEnabled
      }
      this.previewOpen = false
      this.error = ''
    },
    selectCandidate(index: number) {
      const candidate = this.candidates[index]
      if (!candidate?.image) return
      this.generatedImage = candidate.image
      if (candidate.report) this.structureReport = candidate.report
      if (candidate.seed) this.lastSeed = candidate.seed
    },
    async runStructured() {
      if (this.isBusy) return
      if (!this.sketch) {
        this.error = '请导入参考图、手写作品，或在画布上落笔后再生成。'
        return
      }
      if (!this.canGenerate) { this.error = '请先完成识图填词，再确认输入并生成。'; return }
      this.status = 'generating'
      this.error = ''
      this.progress = []
      this.candidates = []
      this.structureReport = null
      this.structureMetrics = null
      this.structureContract = null
      this.contractSummary = []

      const request = this.buildRequest()
      request.options = {
        ...request.options,
        candidates: this.quality === 'fast' ? 1 : this.quality === 'fine' ? 3 : 2,
        repair: this.quality !== 'fast',
        seed: this.lastSeed ?? undefined,
      }

      let receivedImage = false
      const onMessage = (message: StructureSseMessage) => {
        if (message.message) {
          this.progress.push({ stage: message.stage, message: message.message })
        }
        if (message.stage === 'contract') {
          this.structureContract = message.contract || null
          this.contractSummary = message.summary || []
        }
        if (message.stage === 'checking' && message.report) {
          this.structureReport = message.report
        }
        if (message.stage === 'done') {
          this.candidates = message.candidates || []
          this.structureReport = message.report || null
          this.structureMetrics = message.metrics || null
          if (message.prompt_used) this.promptUsed = message.prompt_used
          const chosen = message.chosen
          if (chosen?.image) {
            this.generatedImage = chosen.image
            receivedImage = true
            if (chosen.seed) this.lastSeed = chosen.seed
          }
        }
      }

      try {
        await api.streamGenerateStructure(request, onMessage)
        if (!receivedImage && this.candidates[0]?.image) {
          this.generatedImage = this.candidates[0].image
          receivedImage = true
        }
        if (!receivedImage) throw new Error('生成结束但没有返回图片，请稍后重试。')
        this.status = 'done'
      } catch (error) {
        this.status = 'error'
        this.error = normalizeCreationError(error)
      }
    },
  },
})
