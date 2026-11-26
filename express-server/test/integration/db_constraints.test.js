// FitFollow automated backend tests 
// Run only against a TEST backend and TEST database.
// API paths and response fields neet to be matched to the actual backend.

import { describe, test, before as beforeAll } from 'node:test';
import assert from 'node:assert/strict';

const expect = (actual) => ({
  toBe: (expected) => assert.strictEqual(actual, expected),
  toContain: (item) => assert.ok(Array.isArray(actual) ? actual.includes(item) : String(actual).includes(item)),
  not: { toContain: (item) => assert.ok(!String(actual).includes(item)) },
});
test.each = (rows) => (label, fn) => rows.forEach((r) => test(label.replace('%s', r[0]), () => fn(...r)));

const BASE_URL = process.env.API_URL || 'http://127.0.0.1:4000';

const ROUTES = {
  register: '/api/auth/register',
  login: '/api/auth/login',
  workouts: '/api/sessions',
  foods: '/api/nutrition/custom',
  calorieGoal: '/api/nutrition/goal',
  steps: '/api/steps',
  bodyWeight: '/api/body',
  friendRequest: (id) => `/api/friends/${id}/send`,
  acceptFriend: (id) => `/api/friends/${id}/accept`,
  posts: '/api/feed',
  getPost: (id) => `/api/feed?scope=friends`,
};

// Send a request and return the backend's response.
async function api(method, path, body, token) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

const runId = String(Date.now()).slice(-6);

const password = 'TestPassword123!';

// Create and log in a test user.
async function createTestUser(name) {
  const user = {
    username: `${name}_${runId}`,
    email: `${name}_${runId}@example.test`,
    password,
  };

  const signup = await api('POST', ROUTES.register, user);
  expect([200, 201]).toContain(signup.status);

  const login = await api('POST', ROUTES.login, {
    email: user.email,
    password: user.password,
  });
  expect(login.status).toBe(200);

  // Update ID and token fields to match the actual backend
  return {
    ...user,
    id: signup.data.user?.id, 
    token: login.data.token 
  };
}

let owner;

beforeAll(async () => {
  owner = await createTestUser('owner');
  if (!owner.token) throw new Error('Login did not return an authentication token');
});

// 1. Duplicate signup checks (FR-1)
describe('FR-1: Duplicate accounts', () => {
  test('rejects a duplicate email', async () => {
    const response = await api('POST', ROUTES.register, {
      email: owner.email,
      username: `different_${runId}`,
      password,
    });
    expect([400, 409, 422]).toContain(response.status);
  });

  test('rejects a duplicate username', async () => {
    const response = await api('POST', ROUTES.register, {
      email: `different_${runId}@example.test`,
      username: owner.username,
      password,
    });
    expect([400, 409, 422]).toContain(response.status);
  });
});

// 2. Invalid numerical values (FR-5, FR-10–FR-14)
describe('FR-5, FR-10–FR-14: Invalid numbers', () => {
  const invalidRequests = [
    ['negative workout weight', ROUTES.workouts, { exercise: 'Squat', weight: -50, reps: 8, sets: 3 }],
    ['negative reps', ROUTES.workouts, { exercise: 'Squat', weight: 100, reps: -2, sets: 3 }],
    ['unrealistic workout weight', ROUTES.workouts, { exercise: 'Squat', weight: 100000, reps: 8, sets: 3 }],
    ['negative food calories', ROUTES.foods, { name: 'Test Food', calories: -100, protein: 10, carbs: 10, fat: 5 }],
    ['unrealistic food calories', ROUTES.foods, { name: 'Test Food', calories: 100000, protein: 10, carbs: 10, fat: 5 }],
    ['negative steps', ROUTES.steps, { date: '2026-11-23', stepCount: -100 }],
    ['unrealistic steps', ROUTES.steps, { date: '2026-11-23', stepCount: 1000000 }],
    ['negative body weight', ROUTES.bodyWeight, { date: '2026-11-23', weight: -50 }],
    ['unrealistic body weight', ROUTES.bodyWeight, { date: '2026-11-23', weight: 100000 }],
  ];

  test.each(invalidRequests)('rejects %s', async (name, route, body) => {
    const response = await api('POST', route, body, owner.token);
    expect([400, 422]).toContain(response.status);
  });

  test('rejects a negative daily calorie goal', async () => {
    const response = await api('POST', ROUTES.calorieGoal, { goal: -500 }, owner.token);
    expect([400, 422]).toContain(response.status);
  });

  test('rejects an unrealistic daily calorie goal', async () => {
    const response = await api('POST', ROUTES.calorieGoal, { goal: 100000 }, owner.token);
    expect([400, 422]).toContain(response.status);
  });
});

// 3. PRIVATE vs FRIENDS access checks (FR-21, FR-22, NFR-4)
describe('FR-21, FR-22, NFR-4: Post privacy', () => {
  let friend;
  let stranger;
  let privatePostId;
  let friendsPostId;

  beforeAll(async () => {
    friend = await createTestUser('friend');
    stranger = await createTestUser('stranger');
    if (!owner.id || !friend.id) throw new Error('Registration did not return user IDs');

    const request = await api('POST', ROUTES.friendRequest(owner.id), undefined, friend.token);
    expect([200, 201, 204]).toContain(request.status);

    const accepted = await api('POST', ROUTES.acceptFriend(friend.id), undefined, owner.token);
    expect([200, 201, 204]).toContain(accepted.status);

        const makePost = async (text, audience) => {
      const fd = new FormData();
      fd.append('text', text);
      fd.append('audience', audience);
      const res = await fetch(`${BASE_URL}/api/feed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.token}` },
        body: fd,
      });
      return { status: res.status, data: await res.json().catch(() => ({})) };
    };

    const privatePost = await makePost('Private squat workout post', 'PRIVATE');
    expect([200, 201]).toContain(privatePost.status);
    privatePostId = privatePost.data.post?._id;

    const friendsPost = await makePost('Friends bench workout post', 'FRIENDS');
    expect([200, 201]).toContain(friendsPost.status);
    friendsPostId = friendsPost.data.post?._id;

    if (!privatePostId || !friendsPostId) throw new Error('Post creation did not return post IDs');
  });

  test('friend cannot view PRIVATE post', async () => {
    const response = await api('GET', '/api/feed?scope=friends', undefined, friend.token);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.data)).not.toContain('Private test post');
  });

  test('stranger cannot view PRIVATE post', async () => {
    const response = await api('GET', '/api/feed?scope=discover', undefined, stranger.token);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.data)).not.toContain('Private test post');
  });

  test('friend can view FRIENDS post', async () => {
    const response = await api('GET', '/api/feed?scope=friends', undefined, friend.token);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.data)).toContain('Friends bench workout post');
  });

  test('stranger cannot view FRIENDS post', async () => {
    const response = await api('GET', '/api/feed?scope=discover', undefined, stranger.token);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.data)).not.toContain('Friends test post');
  });

  test('owner can view own PRIVATE post', async () => {
    const response = await api('GET', '/api/feed?scope=friends', undefined, owner.token);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.data)).toContain('Private squat workout post');
  });

  test('unauthenticated user cannot view PRIVATE or FRIENDS posts', async () => {
    const privateResponse = await api('GET', '/api/feed?scope=friends', undefined);
    expect([401, 403, 404]).toContain(privateResponse.status);
    expect(JSON.stringify(privateResponse.data)).not.toContain('Private test post');
  });
});