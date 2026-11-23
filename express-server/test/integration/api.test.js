// Full-stack tests against a REAL in-memory MongoDB (mongodb-memory-server downloads a mongod binary
// the first time it runs, ~100 MB, so this needs internet once).   Run:  npm run test:integration
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-uploads-'));
process.env.MONGODB_URI = mongod.getUri('fitfollow_test');
process.env.JWT_SECRET = 'test-secret';
process.env.UPLOAD_DIR = uploads;
process.env.CV_ENABLED = 'true';
process.env.CV_SERVICE_URL = 'http://127.0.0.1:1'; // nothing listens here -> CV service is "down"
process.env.CV_TIMEOUT_MS = '800';

const { createApp } = await import('../../src/app.js');
const { Content } = await import('../../src/models/Content.js');
const { User } = await import('../../src/models/User.js');
const { Session } = await import('../../src/models/Workout.js');
const { seedFoods } = await import('../../src/services/seedFoods.js');

let server;
let base;
before(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await seedFoods();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await mongoose.disconnect();
  await mongod.stop();
  fs.rmSync(uploads, { recursive: true, force: true });
});

// ---------- helpers ----------
async function api(token, method, url, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(base + url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : null;
  return { status: res.status, data, res };
}

let n = 0;
async function newUser(name, { isPublic = false } = {}) {
  const username = `${name}${++n}`;
  const r = await api(null, 'POST', '/api/auth/register', { email: `${username}@t.co`, username, password: 'password123' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const token = r.data.token;
  if (isPublic) await api(token, 'PATCH', '/api/me', { isPublic: true });
  return { token, id: r.data.user.id, username };
}

async function befriend(a, b) {
  assert.equal((await api(a.token, 'POST', `/api/friends/${b.id}/send`)).status, 200);
  assert.equal((await api(b.token, 'POST', `/api/friends/${a.id}/accept`)).data.state, 'FRIENDS');
}

const jpeg = () => sharp({ create: { width: 64, height: 64, channels: 3, background: '#778899' } }).jpeg().toBuffer();

async function postContent(u, fields, withPhoto = false) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);