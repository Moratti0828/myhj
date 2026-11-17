import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom' });
try {
  setActivePinia(createPinia());
  const { useCreationStore } = await server.ssrLoadModule('/src/stores/creation.ts');
  const store = useCreationStore();
  store.setSketch('data:image/png;base64,test', true);
  assert.equal(store.canGenerate, false);
  store.style = 'calligraphy'; store.structureEnabled = true;
  assert.equal(store.canGenerate, true);
  store.style = 'ink'; assert.equal(store.canGenerate, false);
  store.prompt = '山水'; store.confirmManualDescription(); assert.equal(store.canGenerate, true);
  store.setSketch('data:image/png;base64,changed', true); assert.equal(store.canGenerate, false);
  const { normalizeArtwork } = await server.ssrLoadModule('/src/utils/artwork.ts');
  assert.equal(normalizeArtwork({ id: 1, image: '/first.png', video_url: '/video.mp4' }).type, 'image_video');
  assert.equal(normalizeArtwork({ id: 2, image: '/first.png' }).type, 'image');
  console.log('PASS frontend: free calligraphy, manual confirmation, invalidation, video classification');
} finally { await server.close(); }
