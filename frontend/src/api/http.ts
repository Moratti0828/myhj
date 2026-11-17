import type { SseMessage } from '@/types'

type JsonBody = object | Array<unknown>

export class ApiError extends Error {
  status?: number
  detail?: string

  constructor(message: string, status?: number, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!text) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    return { error: text.slice(0, 500) } as T
  }
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  const payload = await parseJson<Record<string, unknown>>(response)
  if (!response.ok || payload.success === false) {
    throw new ApiError(
      String(payload.error || payload.message || `请求失败：${response.status}`),
      response.status,
      payload.detail ? String(payload.detail) : undefined,
    )
  }
  return payload as T
}

export function postJson<T>(url: string, body: JsonBody): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function streamPost(
  url: string,
  body: JsonBody,
  onMessage: (message: SseMessage) => void,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const payload = await parseJson<Record<string, unknown>>(response)
    throw new ApiError(
      String(payload.error || payload.message || `流式请求失败：${response.status}`),
      response.status,
      payload.detail ? String(payload.detail) : undefined,
    )
  }
  if (!response.body) throw new ApiError('当前浏览器不支持流式响应')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const flush = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''))
      .join('\n')
      .trim()
    if (!data) return
    let parsed: SseMessage
    try {
      parsed = JSON.parse(data) as SseMessage
    } catch {
      throw new ApiError('流式响应解析失败', undefined, data.slice(0, 500))
    }
    onMessage(parsed)
    if (parsed.stage === 'error') {
      throw new ApiError(parsed.error || '生成失败', undefined, parsed.detail)
    }
  }

  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>
    try {
      chunk = await reader.read()
    } catch (error) {
      throw new ApiError(error instanceof Error ? error.message : '流式连接中断')
    }
    const { done, value } = chunk
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    for (const block of blocks) flush(block)
  }
  buffer += decoder.decode()
  if (buffer.trim()) flush(buffer)
}
