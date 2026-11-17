export type VideoAspect = 'original' | '1280x720' | '720x1280' | '960x960'

export async function loadVideoImage(source: string): Promise<HTMLImageElement> {
  const image = new Image()
  if (/^https?:/i.test(source) && new URL(source).origin !== location.origin) image.crossOrigin = 'anonymous'
  const ready = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片无法读取，请上传本地图片，或检查图片地址。'))
  })
  image.src = source
  return ready
}

export async function prepareVideoFrame(source: string, aspect: VideoAspect): Promise<string> {
  // 远程图由后端下载代理读取，避免跨域图片污染画布。
  const readableSource = /^https?:/i.test(source) && new URL(source).origin !== location.origin
    ? `/api/image-proxy?url=${encodeURIComponent(source)}` : source
  const image = await loadVideoImage(readableSource)
  const ratio = aspect === 'original'
    ? Math.max(1 / 4, Math.min(4, image.naturalWidth / image.naturalHeight))
    : aspect === '1280x720' ? 16 / 9 : aspect === '720x1280' ? 9 / 16 : 1
  const longEdge = Math.min(1920, Math.max(960, image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(ratio >= 1 ? longEdge : longEdge * ratio)
  canvas.height = Math.round(ratio >= 1 ? longEdge / ratio : longEdge)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#faf8f4'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
  return canvas.toDataURL('image/jpeg', 0.96)
}
