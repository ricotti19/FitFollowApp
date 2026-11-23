// Tiny fetch wrapper for the Express API. In dev, Vite proxies /api to http://localhost:4000.
const BASE = import.meta.env?.VITE_API_URL || '';

let token = null;
try {
  token = localStorage.getItem('ff_token');
} catch {
  /* storage blocked (private mode): the user simply stays signed in for this tab only */
}

export const getToken = () => token;
export function setToken(t) {
  token = t || null;
  try {
    if (t) localStorage.setItem('ff_token', t);
    else localStorage.removeItem('ff_token');
  } catch {
    /* ignore */
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(method, url, body) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !isForm) headers['content-type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}/api${url}`, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check that the API is running.");
  }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && token && !url.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(res.status, data?.error || res.statusText || 'Request failed', data);
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b),
  put: (u, b) => request('PUT', u, b),
  patch: (u, b) => request('PATCH', u, b),
  del: (u, b) => request('DELETE', u, b),
};

// ---- photos: they sit behind the privacy filter, so <img src> can't send our token. Fetch them as blobs. ----
const blobCache = new Map();
export async function photoUrl(path) {
  if (blobCache.has(path)) return blobCache.get(path);
  const p = (async () => {
    const res = await fetch(`${BASE}/api${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, 'photo unavailable');
    return URL.createObjectURL(await res.blob());
  })();
  blobCache.set(path, p);
  p.catch(() => blobCache.delete(path));
  return p;
}
export function forgetPhoto(path) {
  const p = blobCache.get(path);
  blobCache.delete(path);
  p?.then((u) => URL.revokeObjectURL(u)).catch(() => {});
}
export function clearPhotoCache() {
  for (const k of [...blobCache.keys()]) forgetPhoto(k);
}

// ---- tiny cache for reference data (Deliverable 2, NFR-1: "lightweight client-side cache") ----
const refCache = new Map();
export async function cachedGet(url, ttlMs = 5 * 60 * 1000) {
  const hit = refCache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const data = await api.get(url);
  refCache.set(url, { at: Date.now(), data });
  return data;
}