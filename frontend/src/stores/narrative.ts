import { defineStore } from 'pinia'
import { postJson } from '@/api/http'
import { prepareVideoFrame } from '@/utils/videoFrame'
import { readVideoDraft, saveVideoDraft } from '@/utils/videoDraft'

export interface StoryShot { title: string; visual: string; action: string; camera: string; transition: string; duration: number }
export interface StoryProposal { title: string; logline: string; meaning: string; synopsis: string; shots: StoryShot[] }
interface NarrativeDraft {
  image: string; idea: string; meaning: string; preserve: string; changes: string; ending: string
  observation: string; proposals: StoryProposal[]; selectedIndex: number; dirty: boolean
}
interface NarrativeState extends NarrativeDraft { busy: boolean; error: string; initialized: boolean }

export const useNarrativeStore = defineStore('narrative', {
  state: (): NarrativeState => ({
    image: '', idea: '', meaning: '', preserve: '原作主体的主要识别特征与艺术风格',
    changes: '可以新增角色、场景与情节；主体的演变应有叙事原因', ending: '',
    observation: '', proposals: [], selectedIndex: 0, busy: false, error: '', dirty: false, initialized: false
  }),
  getters: {
    selected: state => state.proposals[state.selectedIndex],
    totalDuration: state => state.proposals[state.selectedIndex]?.shots.reduce((total, shot) => total + Number(shot.duration), 0) || 0
  },
  actions: {
    setImage(image: string) {
      this.image = image
      this.dirty = this.proposals.length > 0
      this.error = ''
    },
    async restore() {
      if (this.initialized) return
      this.initialized = true
      const draft = await readVideoDraft<NarrativeDraft>('narrative')
      if (draft) this.$patch(state => Object.assign(state, draft))
    },
    save() {
      return saveVideoDraft({
        image: this.image, idea: this.idea, meaning: this.meaning,
        preserve: this.preserve, changes: this.changes, ending: this.ending,
        observation: this.observation, proposals: this.proposals.map(proposal => ({ ...proposal, shots: proposal.shots.map(shot => ({ ...shot })) })),
        selectedIndex: this.selectedIndex, dirty: this.dirty
      }, 'narrative')
    },
    async generate() {
      if (this.busy) return
      if (!this.image) { this.error = '请先载入一幅原作。'; return }
      this.busy = true
      this.error = ''
      try {
        const image = await prepareVideoFrame(this.image, 'original')
        const result = await postJson<{ success: boolean; observation: string; proposals: StoryProposal[] }>('/api/videos/storyboards', {
          image, idea: this.idea, meaning: this.meaning, preserve: this.preserve, changes: this.changes, ending: this.ending
        })
        this.observation = result.observation
        this.proposals = result.proposals
        this.selectedIndex = 0
        this.dirty = false
        await this.save().catch(() => { this.error = '故事已生成，但草稿暂未保存，请导出脚本留存。' })
      } catch (error) {
        this.error = error instanceof Error ? error.message : '故事构思暂未完成，请重试。'
      } finally { this.busy = false }
    },
    addShot() {
      if (!this.selected || this.selected.shots.length >= 6) return
      this.selected.shots.push({ title: '新镜头', visual: '', action: '', camera: '固定镜头', transition: '', duration: 5 })
    },
    moveShot(index: number, direction: number) {
      const shots = this.selected.shots
      const target = index + direction
      if (target < 0 || target >= shots.length) return
      const [shot] = shots.splice(index, 1)
      shots.splice(target, 0, shot)
    },
    removeShot(index: number) {
      if (this.selected.shots.length > 1) this.selected.shots.splice(index, 1)
    },
    exportScript(format: 'md' | 'json') {
      if (!this.selected) return
      const story = this.selected
      const text = format === 'json' ? JSON.stringify({
        ...story, totalDuration: this.totalDuration,
        intention: { idea: this.idea, meaning: this.meaning, preserve: this.preserve, changes: this.changes, ending: this.ending }
      }, null, 2) : [
        `# ${story.title}`, story.logline, `表达：${story.meaning}`, story.synopsis,
        `保留：${this.preserve}`, `允许变化：${this.changes}`, `总时长：${this.totalDuration} 秒`,
        ...story.shots.map((shot, index) => `## 镜头 ${index + 1} · ${shot.title}（${shot.duration} 秒）\n\n画面：${shot.visual}\n\n动作：${shot.action}\n\n运镜：${shot.camera}\n\n衔接：${shot.transition}`)
      ].join('\n\n')
      const url = URL.createObjectURL(new Blob([text], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${story.title.replace(/[\\/:*?"<>|]/g, '') || '叙事短片'}.${format}`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
})
