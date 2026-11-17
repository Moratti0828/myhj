import { defineStore } from 'pinia'
import * as api from '@/api'
import type { AgentMessage } from '@/types'

type AgentDrawStatus = NonNullable<AgentMessage['drawStatus']>

interface AgentState {
  messages: AgentMessage[]
  drawingPrompt: string
  loading: boolean
  error: string
}

const drawPollers = new Map<string, ReturnType<typeof setInterval>>()
const drawPollAttempts = new Map<string, number>()
const MAX_DRAW_POLL_ATTEMPTS = 120

function isTerminalDrawStatus(status?: AgentDrawStatus) {
  return status === 'succeeded' || status === 'failed'
}

export const useAgentStore = defineStore('agent', {
  state: (): AgentState => ({
    messages: [
      {
        role: 'assistant',
        content: '小生在此。可问非遗典故，也可说“帮我画一幅青花瓷月下山水”。',
        createdAt: new Date().toISOString(),
      },
    ],
    drawingPrompt: '',
    loading: false,
    error: '',
  }),
  actions: {
    async send(content: string) {
      const text = content.trim()
      if (!text || this.loading) return null
      this.messages.push({ role: 'user', content: text, createdAt: new Date().toISOString() })
      this.loading = true
      this.error = ''

      const drawMatch = text.match(/\[DRAW:\s*(.*?)\s*\]/i)
      if (drawMatch?.[1]) this.drawingPrompt = drawMatch[1].trim()

      try {
        const history = this.messages.filter((m) => m.role !== 'assistant' || m.content).slice(-12)
        const res = await api.agentChat(api.toChatPayload(history))
        const message: AgentMessage = {
          role: 'assistant',
          content: res.text || '书童暂未作答。',
          answerSource: res.model_used === 'local-heritage-knowledge' ? '本地文化知识' : res.model_used === 'local-fallback' ? '本地备用回答（在线服务暂不可用）' : res.model_used === 'local-draw-prompt' ? '本地画意整理' : 'AI 生成回答',
          image: res.image || undefined,
          promptUsed: res.prompt_used || undefined,
          drawTaskId: res.draw_task_id || undefined,
          drawStatus: res.draw_status || undefined,
          createdAt: new Date().toISOString(),
        }
        this.messages.push(message)
        if (res.prompt_used) this.drawingPrompt = res.prompt_used
        if (message.drawTaskId) this.startDrawPolling(message.drawTaskId)
        return message
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'AI 书童暂不可用'
        throw error
      } finally {
        this.loading = false
      }
    },
    consumeDrawPrompt() {
      const prompt = this.drawingPrompt
      this.drawingPrompt = ''
      return prompt
    },
    stopDrawPolling(taskId: string) {
      const timer = drawPollers.get(taskId)
      if (timer) clearInterval(timer)
      drawPollers.delete(taskId)
      drawPollAttempts.delete(taskId)
    },
    startDrawPolling(taskId: string) {
      if (!taskId || drawPollers.has(taskId)) return
      drawPollAttempts.set(taskId, 0)
      const run = () => {
        this.pollDrawTask(taskId)
      }
      run()
      drawPollers.set(taskId, setInterval(run, 2500))
    },
    async pollDrawTask(taskId: string) {
      const message = this.messages.find((item) => item.drawTaskId === taskId)
      if (!message) {
        this.stopDrawPolling(taskId)
        return
      }

      const attempts = (drawPollAttempts.get(taskId) || 0) + 1
      drawPollAttempts.set(taskId, attempts)
      if (attempts > MAX_DRAW_POLL_ATTEMPTS) {
        message.drawStatus = 'failed'
        message.drawError = '书童作画等待时间过长，请稍后重新发送。'
        this.stopDrawPolling(taskId)
        return
      }

      try {
        const res = await api.getAgentDrawTask(taskId)
        const task = res.task
        message.drawStatus = task.status
        message.promptUsed = task.prompt_used || message.promptUsed
        if (task.image || task.image_url) {
          message.image = task.image || task.image_url || undefined
        }
        if (task.error) {
          message.drawError = task.error
        }
        if (isTerminalDrawStatus(task.status)) {
          this.stopDrawPolling(taskId)
          if (task.status === 'succeeded') {
            if (message.image) {
              message.content = `${message.content}\n\n画作已完成，可直接品鉴或保存至画廊。`
            } else {
              message.drawStatus = 'failed'
              message.drawError = '生成完成但没有返回有效图片，请稍后重试。'
            }
          }
        }
      } catch (error) {
        message.drawStatus = 'failed'
        message.drawError = error instanceof Error ? error.message : '书童作画状态查询失败'
        this.stopDrawPolling(taskId)
      }
    },
  },
})
