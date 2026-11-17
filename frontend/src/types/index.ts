export type ArtworkType = 'image' | 'video' | 'image_video'

export interface User {
  id?: string | number
  username: string
  email?: string
  role?: 'user' | 'admin'
  created_at?: string
}

export interface Artwork {
  id: string
  imageUrl?: string
  videoUrl?: string
  prompt?: string
  videoPrompt?: string
  content?: string
  style?: string
  type: ArtworkType
  createdAt: string
}

export interface LegacyArtwork {
  id: string | number
  image?: string
  image_url?: string
  video_url?: string
  content?: string
  content_type?: string
  style?: string
  prompt?: string
  video_prompt?: string
  date?: string
  created_at?: string
}

export interface CaptionResult {
  subject: string
  scene?: string
  composition?: string
  silhouette?: string
  spatial_layout?: string
  line_density?: string
  style_hint?: string
  keywords?: string[]
  negative?: string[]
}

export interface GenerateRequest {
  sketch: string
  prompt: string
  content: string
  style: string
  negative?: string
  options?: {
    positive_prompt?: string
    negative_prompt?: string
    structured?: boolean
    size?: string
    ratio?: string
    guidance?: number
    seed?: number
    candidates?: number
    fidelity?: number
    layered?: boolean
    repair?: boolean
  }
}

export interface StructureDefect {
  code: string
  message: string
  value: number
  threshold: number
  severity: 'hard' | 'soft'
}

export interface StructureReport {
  score: number
  verdict: 'accept' | 'repair'
  defects: StructureDefect[]
  breakdown: Record<string, number>
}

export interface StructureMetrics {
  lineFollow: number
  lineResidue?: number
  edgeIoU: number
  layoutSim: number
  drift: number
  whitespace: number
  aspectDelta: number
  glyphIoU: number
}

export interface StructureSubject {
  id: string
  name: string
  count: number
  bbox: number[]
  anchor?: number[]
  scale?: number
}

export interface StructureContract {
  style?: string
  style_name?: string
  canvas?: { width: number; height: number; aspect?: number; orientation?: string }
  subjects: StructureSubject[]
  negative_space: Array<{ region: string; ratio: number; keep_empty: boolean }>
  fidelity: { structure: number; style: number }
  forbid: string[]
}

export interface StructureCandidate {
  image: string
  image_url?: string | null
  seed?: number
  source?: string
  report?: StructureReport
}

export interface StructureSseMessage extends SseMessage {
  contract?: StructureContract
  summary?: string[]
  report?: StructureReport
  metrics?: StructureMetrics
  candidates?: StructureCandidate[]
  chosen?: StructureCandidate
  mode?: string
  index?: number
  total?: number
  trace?: Array<Record<string, unknown>>
}


export interface GenerateResponse {
  success: boolean
  image?: string
  image_url?: string
  image_materialized?: boolean
  image_warning?: string
  prompt_used?: string
  caption?: CaptionResult
  error?: string
  detail?: string
}

export interface VideoGenerateRequest {
  image: string
  prompt: string
  negative?: string
  story?: {
    motif_id: string
    duration?: number
    wish?: string
    caption?: CaptionResult
  }
  options?: {
    video_mode?: 'short' | 'long'
    profile?: 'balanced' | 'premium' | 'cinematic'
    duration?: number
    resolution?: '720P' | '1080P'
    image_size?: '1280x720' | '720x1280' | '960x960'
    scene?: string
    camera?: string
    motion_strength?: string
    prompt_extend?: boolean
    audio?: boolean
    watermark?: boolean
    shot_type?: 'single' | 'multi'
    seed?: number
  }
}

export interface VideoMotif {
  id: string
  label: string
  meaning: string
  summary: string
  suitable: string[]
  default_duration: number
  beats: Array<{ title: string; line: string }>
  audio: string[]
}

export interface VideoStoryBeat {
  index: number
  start: number
  end: number
  title: string
  line: string
  time: string
}

export interface VideoStoryPlan {
  motif_id: string
  label: string
  meaning: string
  summary: string
  duration: number
  beats: VideoStoryBeat[]
  prompt: string
  negative: string
  audio: string[]
  risk_notes?: string[]
  camera: string
}

export interface VideoGenerateResponse {
  stage: 'done'
  task_id: string
  video_url: string
  prompt_used?: string
  usage?: Record<string, unknown>
}

export interface VideoTask {
  taskId: string
  provider: 'dashscope'
  model: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  stage?: string
  progress?: number
  providerTaskId?: string
  providerStatus?: string
  requestId?: string | null
  videoUrl?: string | null
  remoteVideoUrl?: string | null
  error?: string | null
  errorCode?: string | null
  promptUsed?: string
  parameters?: Record<string, unknown>
  story?: {
    motif_id: string
    label: string
    meaning: string
    duration: number
    beats: VideoStoryBeat[]
    audio?: string[]
  } | null
  createdAt?: string
  updatedAt?: string
}

export interface AgentMessage {
  answerSource?: string
  role: 'user' | 'assistant'
  content: string
  image?: string
  promptUsed?: string
  drawTaskId?: string
  drawStatus?: 'queued' | 'running' | 'succeeded' | 'failed'
  drawError?: string
  createdAt: string
}

export interface SseMessage {
  stage: string
  message?: string
  image?: string
  image_url?: string
  image_materialized?: boolean
  image_warning?: string
  video_url?: string
  task_id?: string
  prompt_used?: string
  caption?: CaptionResult
  error?: string
  detail?: string
  elapsed?: number
  status?: string
  usage?: Record<string, unknown>
}

export interface AdminOverview {
  summary: {
    total_users: number
    total_artworks: number
    active_users: number
    total_type_rows: number
  }
  users: Array<User & { artwork_count: number; last_artwork_at?: string | null }>
  type_counts: Array<{
    user_id: string | number
    username: string
    content_type: string
    count: number
    updated_at?: string | null
  }>
}

export interface CreationOption {
  label: string
  value: string
  description?: string
}

export interface ApiResult<T> {
  success?: boolean
  error?: string
  detail?: string
  message?: string
  data?: T
}
