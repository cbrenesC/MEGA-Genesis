/**
 * Asset warmup for Space Mission. Files are fetched and fully downloaded
 * before the title is shown; Cache Storage is only written after consent.
 * Object URLs let video/audio use the bytes that have already been fetched.
 */
import { hasStorageConsent } from './consent.js';

const CACHE_NAME = 'space-mission-media-v1';
const ASSETS = [
  { path: '/title-background.mp4', expected: 7691806, label: 'Cargando video de inicio' },
  { path: '/title-music.mp3', expected: 5054718, label: 'Preparando música de inicio' },
  { path: '/game-music.mp3', expected: 4560938, label: 'Preparando música de la misión' },
  { path: '/logo-intro.mp4', expected: 991972, label: 'Cargando introducción' },
  { path: '/preloader.svg', expected: 50996, label: 'Preparando animaciones' },
  { path: '/favicon.svg', expected: 670, label: 'Preparando identidad visual' },
];
const memory = new Map();
let loading = null;

export function assetUrl(path) {
  return memory.get(path)?.url || path;
}

async function getFromCache(path) {
  if (!hasStorageConsent() || !('caches' in window)) return null;
  try { return (await caches.open(CACHE_NAME)).match(path); }
  catch { return null; }
}

function getBlobUrl(path, blob) {
  const current = memory.get(path);
  if (current) return current.url;
  const url = URL.createObjectURL(blob);
  memory.set(path, { blob, url });
  return url;
}

async function fetchOne(asset, onBytes) {
  const cached = await getFromCache(asset.path);
  if (cached) {
    const blob = await cached.blob();
    onBytes(blob.size, blob.size);
    getBlobUrl(asset.path, blob);
    return { path: asset.path, ok: true, cached: true };
  }
  const response = await fetch(asset.path, { cache: 'force-cache', signal: AbortSignal.timeout?.(18000) });
  if (!response.ok) throw Error(`${asset.path}: HTTP ${response.status}`);
  const expected = Number(response.headers.get('content-length')) || 0;
  if (!response.body) {
    const blob = await response.blob();
    onBytes(blob.size, expected || blob.size);
    getBlobUrl(asset.path, blob);
    return { path: asset.path, ok: true };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    bytes += value.byteLength;
    onBytes(bytes, expected || Math.max(bytes, 1));
  }
  const blob = new Blob(chunks, { type: response.headers.get('content-type') || '' });
  getBlobUrl(asset.path, blob);
  return { path: asset.path, ok: true };
}

/** Returns true only when the browser has successfully decoded the preview. */
function waitForMediaReady(path, timeoutMs = 4500) {
  return new Promise(resolve => {
    const media = document.createElement(/\.mp4$/i.test(path) ? 'video' : 'audio');
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      media.removeAttribute('src');
      media.load();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    media.addEventListener('loadedmetadata', () => { clearTimeout(timer); finish(true); }, { once: true });
    media.addEventListener('error', () => { clearTimeout(timer); finish(false); }, { once: true });
    media.preload = 'metadata';
    media.src = assetUrl(path);
    media.load();
  });
}

async function prepareGraphics() {
  const paths = ['/preloader.svg', '/favicon.svg'];
  await Promise.all(paths.map(path => new Promise(resolve => {
    const img = new Image();
    img.onload = async () => {
      try { await img.decode?.(); } catch {}
      resolve();
    };
    img.onerror = resolve;
    img.src = assetUrl(path);
  })));
}

export function preloadAssets(onProgress = () => {}) {
  if (loading) return loading;
  loading = (async () => {
    const progress = ASSETS.map(asset => ({ loaded: 0, expected: asset.expected || 1 }));
    const emit = (phase, detail) => {
      const total = progress.reduce((n, p) => n + Math.max(p.expected, p.loaded), 0);
      const loaded = progress.reduce((n, p) => n + p.loaded, 0);
      onProgress({
        phase, detail, downloaded: loaded, total,
        ratio: total ? Math.min(1, loaded / total) : 0,
      });
    };
    emit('download', 'Conectando con el centro de datos');
    const results = await Promise.allSettled(ASSETS.map((asset, i) => fetchOne(asset, (loaded, expected) => {
      progress[i] = { loaded, expected: Math.max(loaded, expected) };
      emit('download', asset.label);
    })));
    const failures = results.filter(x => x.status === 'rejected');
    if (failures.length) console.warn('Algunos recursos no se pudieron precargar:', failures);
    emit('decode', 'Procesando recursos audiovisuales');
    await Promise.all([
      ...ASSETS.filter(x => /\.(mp3|mp4)$/.test(x.path) && memory.has(x.path))
        .map(x => waitForMediaReady(x.path)),
      prepareGraphics(),
      document.fonts?.ready ?? Promise.resolve(),
    ]);
    emit('render', 'Finalizando preparación gráfica');
    // Ensures the interface has an opportunity to paint before unlocking.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    emit('ready', failures.length ? 'Preparación completada con algunos recursos pendientes' : 'Sistemas listos');
    return { assets: results.length, failures: failures.length };
  })();
  return loading;
}

export async function persistAssetCache() {
  if (!hasStorageConsent() || !('caches' in window)) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all([...memory].map(async ([path, entry]) => {
      const type = entry.blob.type || (path.endsWith('.mp4') ? 'video/mp4' : path.endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream');
      await cache.put(path, new Response(entry.blob, { headers: { 'Content-Type': type } }));
    }));
    return true;
  } catch (error) {
    console.warn('No se pudo conservar la caché de recursos', error);
    return false;
  }
}
