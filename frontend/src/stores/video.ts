import { defineStore } from 'pinia'
import * as api from '@/api'
import { ApiError } from '@/api/http'
import direction from '../../../shared/videoDirection.json'
import { prepareVideoFrame, type VideoAspect } from '@/utils/videoFrame'
import { readVideoDraft, saveVideoDraft } from '@/utils/videoDraft'
import type { SseMessage, VideoMotif, VideoStoryPlan, VideoTask } from '@/types'

export const DEFAULT_VIDEO_PROMPT = ''

const QUALITY_PRESETS = {
  balanced: {
    label: '快速预览',
    hint: '720P · 5 秒，适合先看画面动态。',
    videoMode: 'short' as const,
    duration: 5,
    resolution: '720P' as const,
  },
  premium: {
    label: '高清成片',
    hint: '1080P · 5 秒，适合细赏画面。',
    videoMode: 'short' as const,
    duration: 5,
    resolution: '1080P' as const,
  },
  cinematic: {
    label: '长镜叙事',
    hint: '1080P · 8 秒，适合徐徐展开一段画意。',
    videoMode: 'long' as const,
    duration: 8,
    resolution: '1080P' as const,
  },
}

type QualityPreset = keyof typeof QUALITY_PRESETS
type VideoMode = 'short' | 'long'

const VIDEO_MODE_CONFIG = {
  short: {
    label: '短视频',
    hint: '5 秒，适合一个动作与一个反应。',
    durations: [5],
    fallback: 5,
  },
  long: {
    label: '长视频',
    hint: '6–10 秒，适合从容展开画面。',
    durations: [6, 7, 8, 9, 10],
    fallback: 8,
  },
}

let pollTimer: ReturnType<typeof setTimeout> | null = null

function normalizeVideoError(error: unknown) {
  const message = error instanceof Error ? error.message : '视频生成失败'
  const detail = typeof (error as { detail?: unknown })?.detail === 'string'
    ? String((error as { detail?: string }).detail)
    : ''
  const raw = `${message} ${detail}`

  if (/DASHSCOPE_API_KEY|MISSING_DASHSCOPE_API_KEY|api key/i.test(raw)) {
    return '阿里云百炼 API Key 未配置或为空，请补齐 server/.env.local 中的 DASHSCOPE_API_KEY 并重启后端。'
  }
  if (/Invalid video first frame image|data:image|first frame/i.test(raw)) {
    return '首帧格式不支持：请上传本地图片，或粘贴 http(s) 公网图片 / data:image;base64 地址。'
  }
  if (/HTTP 401|InvalidApiKey|Invalid API-key|unauthorized/i.test(raw)) {
    return '阿里云百炼 API Key 无效或无权限，请检查 Key、模型权限和账号状态。'
  }
  if (/Quota|balance|insufficient|余额|欠费/i.test(raw)) {
    return '阿里云百炼账号余额或额度不足，请充值或开通对应模型后重试。'
  }
  if (/AccessDenied|Forbidden|permission|权限|模型无权限/i.test(raw)) {
    return '阿里云百炼模型权限不足，当前账号可能未开通 wan2.6-i2v-flash。'
  }
  if (/timeout|排队|队列/i.test(raw)) {
    return '视频任务仍在排队或生成中。已改为异步轮询，请保持页面打开等待结果。'
  }
  if (/watermark|logo|text|copyright|safety|policy|risk/i.test(raw)) {
    return '视频任务被拒绝：首帧里可能有明显水印、文字或版权标记。请换成无水印、主体清晰的图片后重试。'
  }
  return detail ? `${message}：${detail.slice(0, 180)}` : message
}

function taskToProgress(task: VideoTask): SseMessage {
  const elapsed = task.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(task.createdAt).getTime()) / 1000)) : undefined
  const label = task.status === 'queued'
    ? '画卷正候场'
    : task.status === 'running'
      ? '画意正在流转'
      : task.status === 'succeeded'
        ? '视频生成完成'
        : task.status === 'canceled'
          ? '任务已取消'
          : '视频生成失败'
  return {
    stage: task.stage || task.status,
    status: task.providerStatus || task.status,
    task_id: task.taskId,
    video_url: task.videoUrl || undefined,
    prompt_used: task.promptUsed,
    elapsed,
    message: task.stage === 'download_retry' ? '成片已完成，正在重新获取文件' : task.stage === 'query_retry' ? '正在重新查询进度' : task.error || label,
  }
}

interface VideoState {
  firstFrame: string
  framePreview: string
  scene: string
  camera: string
  motionStrength: string
  pollWarning: string
  restored: boolean
  prompt: string
  negative: string
  videoUrl: string
  taskId: string
  providerTaskId: string
  videoMode: VideoMode
  duration: number
  resolution: '720P' | '1080P'
  imageSize: VideoAspect
  qualityPreset: QualityPreset
  promptExtend: boolean
  watermark: boolean
  seed: string
  progress: SseMessage[]
  status: 'idle' | 'generating' | 'done' | 'error'
  error: string
  storyMode: boolean
  motifId: string
  motifs: VideoMotif[]
  storyPlan: VideoStoryPlan | null
  storyDuration: number
  storyWish: string
  storyboardImage: string
  storyboardLoading: boolean
}

export const useVideoStore = defineStore('video', {
  state: (): VideoState => ({
    firstFrame: '',
    framePreview: '',
    scene: 'still',
    camera: 'fixed',
    motionStrength: 'subtle',
    pollWarning: '',
    restored: false,
    prompt: DEFAULT_VIDEO_PROMPT,
    negative:
      '画面抖动，频闪，主体变形，字形扭曲，纹样漂移，新增字幕，额外标志',
    videoUrl: '',
    taskId: '',
    providerTaskId: '',
    videoMode: QUALITY_PRESETS.balanced.videoMode,
    duration: QUALITY_PRESETS.balanced.duration,
    resolution: QUALITY_PRESETS.balanced.resolution,
    imageSize: 'original',
    qualityPreset: 'balanced',
    promptExtend: false,
    watermark: false,
    seed: '',
    progress: [],
    status: 'idle',
    error: '',
    storyMode: false,
    motifId: 'moon_chrysanthemum',
    motifs: [],
    storyPlan: null,
    storyDuration: 8,
    storyWish: '',
    storyboardImage: '',
    storyboardLoading: false,
  }),
  getters: {
    canGenerate: (state) => Boolean(state.firstFrame),
    qualityLabel: (state) => state.duration === QUALITY_PRESETS[state.qualityPreset].duration && state.resolution === QUALITY_PRESETS[state.qualityPreset].resolution ? QUALITY_PRESETS[state.qualityPreset].label : '自定镜头',
    profileHint: (state) => `${state.resolution} · ${state.duration} 秒，保留原作笔意。`,
    videoModeLabel: (state) => VIDEO_MODE_CONFIG[state.videoMode].label,
    videoModeHint: (state) => VIDEO_MODE_CONFIG[state.videoMode].hint,
    durationOptions: (state) => VIDEO_MODE_CONFIG[state.videoMode].durations,
  },
  actions: {
    setFirstFrame(image: string) {
      if (this.status === 'generating') return
      this.framePreview = ''
      this.firstFrame = image
      this.status = 'idle'
      this.progress = []
      this.videoUrl = ''
      this.taskId = ''
      this.providerTaskId = '' 
      this.error = ''
    },
    applyQualityPreset(preset: QualityPreset) {
      const config = QUALITY_PRESETS[preset]
      this.qualityPreset = preset
      this.videoMode = config.videoMode
      this.duration = config.duration
      this.resolution = config.resolution
      if (this.status === 'error') this.status = 'idle'
      this.error = ''
    },
    applyVideoMode(mode: VideoMode) {
      this.videoMode = mode
      const config = VIDEO_MODE_CONFIG[mode]
      if (!config.durations.includes(this.duration)) {
        this.duration = config.fallback
      }
      if (this.status === 'error') this.status = 'idle'
      this.error = ''
    },
    async updateFramePreview() {
      const source = this.firstFrame
      const aspect = this.imageSize
      if (!source) return
      try {
        const preview = await prepareVideoFrame(source, aspect)
        if (this.firstFrame === source && this.imageSize === aspect) {
          this.framePreview = preview
          this.error = ''
        }
      } catch (error) { this.error = normalizeVideoError(error) }
    },
    stopPolling() {
      if (pollTimer) clearTimeout(pollTimer)
      pollTimer = null
    },
    startPolling(taskId: string) {
      this.stopPolling()
      const run = async () => {
        await this.pollTask(taskId)
        if (this.taskId === taskId && this.status === 'generating') {
          pollTimer = setTimeout(run, 15000)
        }
      }
      void run()
    },
    async restoreTask() {
      if (this.restored) return
      this.restored = true
      try {
        const draft = await readVideoDraft<Partial<VideoState>>()
        if (!draft?.taskId) return
        this.$patch(state => Object.assign(state, draft))
        this.status = 'generating'
        this.startPolling(draft.taskId)
      } catch {
        this.pollWarning = '当前浏览器暂时无法读取上次的任务。'
      }
    },
    getShotSummary() {
      return [direction.scenes.find(item => item.value === this.scene)?.summary,
        direction.cameras.find(item => item.value === this.camera)?.label,
        direction.strengths.find(item => item.value === this.motionStrength)?.label].join(' · ')
    },
    applyTask(task: VideoTask) {
      this.taskId = task.taskId
      this.providerTaskId = task.providerTaskId || ''
      const message = taskToProgress(task)
      const last = this.progress[this.progress.length - 1]
      if (last?.stage === message.stage && last?.status === message.status && last?.message === message.message) {
        this.progress[this.progress.length - 1] = message
      } else this.progress = [...this.progress.slice(-11), message]
      this.pollWarning = '' 
      if (task.videoUrl) this.videoUrl = task.videoUrl

      if (task.status === 'succeeded') {
        this.status = 'done'
        this.error = ''
        this.stopPolling()
        return
      }
      if (task.status === 'failed' || task.status === 'canceled') {
        this.status = 'error'
        this.error = normalizeVideoError(task.error || task.errorCode || '视频生成失败')
        this.stopPolling()
        return
      }
      this.status = 'generating'
    },
    async pollTask(taskId: string) {
      try {
        const res = await api.getWanVideoTask(taskId)
        this.applyTask(res.task)
      } catch (error) {
        if (error instanceof ApiError && [403, 404].includes(error.status || 0)) {
          this.status = 'error'
          this.error = normalizeVideoError(error)
          this.stopPolling()
        } else {
          this.pollWarning = '暂时未能查到最新进度，正在继续查询，请勿重复提交。'
        }
      }
    },
    async loadMotifs() {
      if (this.motifs.length) return
      try {
        const res = await api.getVideoMotifs()
        this.motifs = res.motifs || []
      } catch (error) {
        this.error = normalizeVideoError(error)
      }
    },
    async planStory(motifId?: string) {
      const id = motifId || this.motifId
      this.motifId = id
      try {
        const res = await api.planVideoStory({ motif_id: id, duration: this.storyDuration, wish: this.storyWish || undefined })
        this.storyPlan = res.plan
        this.storyDuration = res.plan.duration
        this.storyboardImage = ''
      } catch (error) {
        this.error = normalizeVideoError(error)
      }
    },
    async renderStoryboard() {
      if (!this.firstFrame || this.storyboardLoading) return
      this.storyboardLoading = true
      try {
        const frame = await prepareVideoFrame(this.firstFrame, this.imageSize)
        const res = await api.renderVideoStoryboard({
          image: frame,
          motif_id: this.motifId,
          duration: this.storyDuration,
        })
        this.storyboardImage = res.image
        this.storyPlan = res.plan
      } catch (error) {
        this.error = normalizeVideoError(error)
      } finally {
        this.storyboardLoading = false
      }
    },
    setStoryDuration(value: number) {
      this.storyDuration = Math.max(5, Math.min(10, Math.round(value)))
      void this.planStory()
    },
    toggleStoryMode(enabled: boolean) {
      this.storyMode = enabled
      if (enabled && !this.storyPlan) void this.planStory()
    },
    async generate() {
      if (this.status === 'generating') return
      if (!this.firstFrame) {
        this.error = '请先加载一张国风作品作为视频首帧。'
        return
      }
      const seedValue = this.seed ? Number(this.seed) : undefined
      if (seedValue !== undefined && (!Number.isInteger(seedValue) || seedValue < 0 || seedValue > 2147483647)) {
        this.error = '随机种子须为 0 到 2147483647 的整数。'
        return
      }
      this.stopPolling()
      this.status = 'generating'
      this.error = ''
      this.pollWarning = ''
      this.progress = []
      this.videoUrl = ''
      this.taskId = ''
      this.providerTaskId = ''
      try {
        const frame = await prepareVideoFrame(this.firstFrame, this.imageSize)
        this.framePreview = frame
        const story = this.storyMode && this.motifId
          ? { motif_id: this.motifId, duration: this.storyDuration, wish: this.storyWish || undefined }
          : undefined
        const res = await api.createWanVideoTask({
          image: frame,
          prompt: story ? '' : this.prompt,
          negative: story ? '' : this.negative,
          story,
          options: {
            video_mode: story ? (this.storyDuration > 5 ? 'long' : 'short') : this.videoMode,
            profile: this.qualityPreset,
            duration: story ? this.storyDuration : this.duration,
            resolution: this.resolution,
            scene: story ? 'story' : this.scene,
            camera: story ? 'story' : this.camera,
            motion_strength: story ? 'gentle' : this.motionStrength,
            prompt_extend: this.promptExtend,
            audio: Boolean(story),
            watermark: this.watermark,
            shot_type: 'single',
            seed: seedValue,
          },
        })
        this.applyTask(res.task)
        await saveVideoDraft({
          taskId: this.taskId, firstFrame: this.firstFrame, framePreview: frame,
          prompt: this.prompt, negative: this.negative, scene: this.scene,
          camera: this.camera, motionStrength: this.motionStrength,
          duration: this.duration, resolution: this.resolution, imageSize: this.imageSize,
          qualityPreset: this.qualityPreset, videoMode: this.videoMode, seed: this.seed,
          promptExtend: this.promptExtend, watermark: this.watermark,
          storyMode: this.storyMode, motifId: this.motifId, storyDuration: this.storyDuration
        }).catch(() => { this.pollWarning = '任务已提交，但当前浏览器未能保存续查记录，请保留此页面。' })
        if (res.task.status === 'queued' || res.task.status === 'running') {
          this.startPolling(res.task.taskId)
        }
      } catch (error) {
        this.status = 'error'
        this.error = normalizeVideoError(error)
        this.stopPolling()
      }
    },
  },
})
