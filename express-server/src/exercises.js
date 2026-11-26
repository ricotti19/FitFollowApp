// express-server/src/exercises.js
import { moderateComment } from './moderation.js';

const CV_URL = (process.env.CV_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
const WEIGHTED_EQUIPMENT = new Set(['barbell', 'dumbbell', 'kettlebell', 'cable', 'machine', 'e-z curl bar', 'exercise ball', 'medicine ball']);

const searchCache = new Map();
const infoCache = new Map();
const videoCache = new Map();
let catalogPromise = null;

async function getCatalog() {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const u = new URL('/yuhonas/free-exercise-db/main/dist/exercises.json', 'https://' + 'raw.' + 'githubusercontent.com');
        const res = await fetch(u.toString(), { signal: controller.signal });
        if (!res.ok) return [];
        const list = await res.json();
        return (Array.isArray(list) ? list : [])
          .map((ex) => {
            const name = String(ex.name || '').trim();
            const equipment = String(ex.equipment || 'body only').trim().toLowerCase();
            const category = String(ex.category || 'Strength').trim();
            const requiresWeight = WEIGHTED_EQUIPMENT.has(equipment);
            const catLow = category.toLowerCase();
            const mode = catLow === 'cardio' ? 'cardio_speed' : catLow === 'stretching' ? 'movement_duration' : requiresWeight ? 'weighted_strength' : 'bodyweight_strength';
            return { name, category, equipment, requiresWeight, mode };
          })
          .filter((ex) => ex.name);
      } catch {
        return [];
      } finally {
        clearTimeout(timer);
      }
    })();
  }
  const items = await catalogPromise;
  if (items.length === 0) catalogPromise = null;
  return items;
}

void getCatalog();

export async function searchWgerExercises(query) {
  const q = String(query || '').trim();
  if (q.length < 2 || q.length > 60) return [];
  if (!moderateComment(q).allowed) return [];

  const key = q.toLowerCase();
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.items;

  const catalog = await getCatalog();
  const matches = catalog
    .filter((ex) => ex.name.toLowerCase().includes(key))
    .slice(0, 8);
  searchCache.set(key, { at: Date.now(), items: matches });
  return matches;
}

export async function inspectExercise(rawName) {
  const clean = String(rawName || '').trim();
  if (clean.length < 2 || clean.length > 60 || !moderateComment(clean).allowed) {
    return { valid: false, requiresWeight: false };
  }
  const key = clean.toLowerCase();
  const hit = infoCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.info;

  const catalog = await getCatalog();
  const exact = catalog.find((ex) => ex.name.toLowerCase() === key)
    || catalog.find((ex) => ex.name.toLowerCase().includes(key) || key.includes(ex.name.toLowerCase()));
  if (exact) {
    const info = { valid: true, requiresWeight: exact.requiresWeight, mode: exact.mode, equipment: exact.equipment };
    infoCache.set(key, { at: Date.now(), info });
    return info;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${CV_URL}/classify-exercise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise: clean }),
      signal: controller.signal,
    });
    if (res.ok) {
      const d = await res.json();
      const info = { valid: Boolean(d.valid), requiresWeight: Boolean(d.requiresWeight), mode: d.mode || 'movement_duration' };
      infoCache.set(key, { at: Date.now(), info });
      return info;
    }
  } catch {
    // Fail open if Flask CV service is offline
  } finally {
    clearTimeout(timer);
  }
  return { valid: true, requiresWeight: false };
}

export async function isValidWgerExercise(rawName) {
  const info = await inspectExercise(rawName);
  return info.valid;
}

export async function searchFormVideos(exercise, focusQuery = 'proper form tutorial') {
  const q = `${exercise} ${focusQuery}`.trim();
  const key = q.toLowerCase();
  const hit = videoCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit;

  const searchUrl = new URL('/results', 'https://' + 'www.' + 'youtube.com');
  searchUrl.searchParams.set('search_query', q);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(searchUrl.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    const html = await res.text();
    const videos = [];
    const seenIds = new Set();
    const rx = /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"\}\]/g;
    let m;
    while ((m = rx.exec(html)) !== null && videos.length < 3) {
      const id = m.at(1);
      const rawTitle = m.at(2);
      if (!id || !rawTitle || seenIds.has(id)) continue;
      seenIds.add(id);
      const watchUrl = new URL('/watch', 'https://' + 'www.' + 'youtube.com');
      watchUrl.searchParams.set('v', id);
      const thumbUrl = new URL(`/vi/${id}/hqdefault.jpg`, 'https://' + 'i.' + 'ytimg.com');
      videos.push({
        id,
        title: rawTitle.replace(/\\u0026/g, '&').replace(/\\"/g, '"'),
        url: watchUrl.toString(),
        thumbnail: thumbUrl.toString(),
      });
    }
    const out = { videos, searchUrl: searchUrl.toString() };
    videoCache.set(key, { at: Date.now(), ...out });
    return out;
  } catch {
    return { videos: [], searchUrl: searchUrl.toString() };
  } finally {
    clearTimeout(timer);
  }
}
