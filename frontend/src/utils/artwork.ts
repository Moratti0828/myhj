import type { Artwork, LegacyArtwork } from '@/types'

export function normalizeArtwork(item: LegacyArtwork): Artwork {
  const imageUrl = item.image_url || item.image || undefined
  const videoUrl = item.video_url || undefined
  const hasVideo = Boolean(videoUrl || item.video_prompt)
  const hasImage = Boolean(imageUrl)

  return {
    id: String(item.id),
    imageUrl,
    videoUrl,
    prompt: item.prompt || '',
    videoPrompt: item.video_prompt,
    content: item.content_type || item.content || 'unknown',
    style: item.style || 'unknown',
    type: hasImage && hasVideo ? 'image_video' : hasVideo ? 'video' : 'image',
    createdAt: item.created_at || item.date || new Date().toISOString(),
  }
}

export function formatDate(value?: string) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
