import { defineStore } from 'pinia'
import * as api from '@/api'
import type { Artwork } from '@/types'
import { normalizeArtwork } from '@/utils/artwork'

interface GalleryState {
  artworks: Artwork[]
  stats: Record<string, number>
  loading: boolean
  error: string
}

export const useGalleryStore = defineStore('gallery', {
  state: (): GalleryState => ({
    artworks: [],
    stats: {},
    loading: false,
    error: '',
  }),
  actions: {
    async refresh() {
      this.loading = true
      this.error = ''
      try {
        const res = await api.getGallery()
        this.artworks = res.artworks.map(normalizeArtwork)
        this.stats = res.stats || {}
      } catch (error) {
        this.error = error instanceof Error ? error.message : '画廊加载失败'
      } finally {
        this.loading = false
      }
    },
    async save(payload: { image: string; content?: string; style?: string; prompt?: string; video_url?: string; video_prompt?: string }) {
      const res = await api.saveArtwork(payload)
      this.artworks.unshift(normalizeArtwork(res.artwork))
      this.stats.total = (this.stats.total || 0) + 1
      return res.artwork
    },
    async remove(id: string) {
      await api.deleteArtwork(id)
      this.artworks = this.artworks.filter((item) => item.id !== id)
      this.stats.total = Math.max((this.stats.total || 1) - 1, 0)
    },
  },
})
