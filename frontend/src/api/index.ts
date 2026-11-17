import { postJson, request, streamPost } from './http'
import type {
  AdminOverview,
  AgentMessage,
  GenerateRequest,
  GenerateResponse,
  LegacyArtwork,
  SseMessage,
  StructureSseMessage,
  User,
  VideoGenerateRequest,
  VideoMotif,
  VideoStoryPlan,
  VideoTask,
} from '@/types'

export interface LoginState {
  logged_in: boolean
  username?: string
  role?: 'user' | 'admin'
  is_admin?: boolean
}

export function checkLogin() {
  return request<LoginState>('/api/check_login')
}

export function register(payload: { username: string; password: string; email?: string }) {
  return postJson<{ success: boolean; message?: string }>('/api/register', payload)
}

export function login(payload: { username: string; password: string }) {
  return postJson<{ success: boolean; username?: string; role?: User['role']; is_admin?: boolean }>('/api/login', payload)
}

export function logout() {
  return postJson<{ success: boolean }>('/api/logout', {})
}

export function getGallery() {
  return request<{ artworks: LegacyArtwork[]; stats?: Record<string, number> }>('/api/gallery')
}

export function saveArtwork(payload: { image: string; content?: string; style?: string; prompt?: string; video_url?: string; video_prompt?: string }) {
  return postJson<{ success: boolean; artwork: LegacyArtwork }>('/api/gallery', payload)
}

export function deleteArtwork(id: string) {
  return request<{ success: boolean }>(`/api/gallery/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function getAdminOverview() {
  return request<{ success: boolean } & AdminOverview>('/api/admin/overview')
}

export function caption(sketch: string) {
  return postJson<{ success: boolean; caption: GenerateResponse['caption'] }>('/api/caption', { sketch })
}

export function generate(payload: GenerateRequest) {
  return postJson<GenerateResponse>('/api/generate', payload)
}

export function enhance(payload: GenerateRequest) {
  return postJson<GenerateResponse>('/api/enhance', payload)
}

export function streamGenerate(payload: GenerateRequest, onMessage: (message: SseMessage) => void) {
  return streamPost('/api/generate/stream', payload, onMessage)
}

export function previewGeneration(payload: GenerateRequest & { mode?: 'generate' | 'enhance' }) {
  return postJson<{
    success: boolean
    input_image: string
    prompt: string
    negative: string
    model: string
    mode: string
    content: string
    style: string
  }>('/api/generate/preview', payload)
}

export function streamEnhance(payload: GenerateRequest, onMessage: (message: SseMessage) => void) {
  return streamPost('/api/enhance/stream', payload, onMessage)
}

export function streamGenerateStructure(
  payload: GenerateRequest,
  onMessage: (message: StructureSseMessage) => void,
) {
  return streamPost('/api/generate/structure/stream', payload, (message) =>
    onMessage(message as StructureSseMessage),
  )
}

export function streamVideo(payload: VideoGenerateRequest, onMessage: (message: SseMessage) => void) {
  return streamPost('/api/video/generate/stream', payload, onMessage)
}

export function createWanVideoTask(payload: VideoGenerateRequest) {
  return postJson<{ success: boolean; duplicate?: boolean; task: VideoTask }>('/api/videos/image-to-video', payload)
}

export function getVideoMotifs() {
  return request<{ success: boolean; motifs: VideoMotif[] }>('/api/videos/motifs')
}

export function planVideoStory(payload: { motif_id: string; duration?: number; wish?: string }) {
  return postJson<{ success: boolean; plan: VideoStoryPlan }>('/api/videos/story/plan', payload)
}

export function renderVideoStoryboard(payload: { image: string; motif_id: string; duration?: number }) {
  return postJson<{ success: boolean; plan: VideoStoryPlan; image: string }>(
    '/api/videos/story/storyboard',
    payload,
  )
}

export function getWanVideoTask(taskId: string) {
  return request<{ success: boolean; task: VideoTask }>(`/api/videos/tasks/${encodeURIComponent(taskId)}`)
}

export function agentChat(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  return postJson<{
    success: boolean
    text: string
    image?: string
    prompt_used?: string
    draw_task_id?: string | null
    draw_status?: 'queued' | 'running' | 'succeeded' | 'failed' | null
    model_used?: string
    is_fallback?: boolean
  }>('/api/agent/chat', { messages })
}

export function getAgentDrawTask(taskId: string) {
  return request<{
    success: boolean
    task: {
      task_id: string
      status: 'queued' | 'running' | 'succeeded' | 'failed'
      stage?: string
      image?: string | null
      image_url?: string | null
      prompt_used?: string
      error?: string | null
      created_at?: string
      updated_at?: string
    }
  }>(`/api/agent/draw/${encodeURIComponent(taskId)}`)
}

export function toChatPayload(messages: AgentMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))
}
