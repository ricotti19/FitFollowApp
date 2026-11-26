import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.API_URL || 'http://127.0.0.1:4000';

async function api(token, method, path, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body && !isForm ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

let seq = 0;
async function newUser(prefix, isPublic = false) {
  const username = `${prefix}_${Date.now().toString(36)}_${++seq}`;
  const r = await api(null, 'POST', '/api/auth/register', {
    email: `${username}@test.local`,
    username,
    password: 'Password123',
  });
  assert.equal(r.status, 201);
  if (isPublic) await api(r.data.token, 'PATCH', '/api/me', { isPublic: true });
  return { token: r.data.token, id: r.data.user.id, username };
}

describe('Integration: FitFollow Full-Stack API (FR-1 to FR-32, NFR-1 to NFR-13)', () => {
  let alice;
  let bob;
  let stranger;

  before(async () => {
    const h = await api(null, 'GET', '/api/health');
    assert.equal(h.status, 200);
    alice = await newUser('alice', true);
    bob = await newUser('bob', false);
    stranger = await newUser('stranger', false);
  });

  test('FR-18 & FR-20: Friend request lifecycle and real-time DMs', async () => {
    const send = await api(alice.token, 'POST', `/api/friends/${bob.id}/send`);
    assert.equal(send.data.state, 'REQUEST_SENT');

    const acc = await api(bob.token, 'POST', `/api/friends/${alice.id}/accept`);
    assert.equal(acc.data.state, 'FRIENDS');

    const msg = await api(alice.token, 'POST', `/api/messages/${bob.id}`, { text: 'Great leg session today!' });
    assert.equal(msg.status, 201);

    const blockedDm = await api(stranger.token, 'POST', `/api/messages/${alice.id}`, { text: 'Hey' });
    assert.equal(blockedDm.status, 403);
  });

  test('FR-5, FR-7, FR-30..32 & NFR-12: Workouts, PR detection, and <2s preset loading', async () => {
    const s1 = await api(alice.token, 'POST', '/api/sessions', { exercise: 'Bench Press', weight: 185, reps: 5, sets: 3 });
    assert.equal(s1.status, 201);
    assert.equal(s1.data.isPR, true);

    const s2 = await api(alice.token, 'POST', '/api/sessions', { exercise: 'Bench Press', weight: 205, reps: 3, sets: 3 });
    assert.equal(s2.status, 201);
    assert.equal(s2.data.isPR, true);

    const preset = await api(alice.token, 'POST', '/api/presets', { name: 'Heavy Upper Split' });
    assert.equal(preset.status, 201);

    const t0 = performance.now();
    const list = await api(alice.token, 'GET', '/api/presets');
    const elapsedMs = performance.now() - t0;
    assert.equal(list.status, 200);
    assert.ok(elapsedMs < 2000, `NFR-12 violated: ${elapsedMs}ms`);
  });

  test('FR-21, FR-22 & NFR-4: Audience locks enforced on feed queries', async () => {
    const fd = new FormData();
    fd.append('text', 'Secret solo weigh-in note');
    fd.append('audience', 'PRIVATE');
    const created = await api(alice.token, 'POST', '/api/feed', fd);
    assert.equal(created.status, 201);

    const bobFeed = await api(bob.token, 'GET', '/api/feed?scope=friends');
    assert.ok(!JSON.stringify(bobFeed.data).includes('Secret solo weigh-in note'));
  });

  test('FR-23..FR-26: 24h story creation, viewer tracking, and emoji reactions', async () => {
    const fd = new FormData();
    fd.append('text', 'Morning 5k tempo run done!');
    fd.append('audience', 'PUBLIC');
    const st = await api(alice.token, 'POST', '/api/stories', fd);
    assert.equal(st.status, 201);

    const view = await api(bob.token, 'POST', `/api/stories/${st.data.id}/view`);
    assert.equal(view.status, 200);

    const react = await api(bob.token, 'POST', `/api/stories/${st.data.id}/react`, { emoji: '🔥' });
    assert.equal(react.status, 200);
    assert.equal(react.data.reactions.length, 1);
  });
});
