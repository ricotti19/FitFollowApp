// FitFollow automated backend tests 
// Run only against a TEST backend and TEST database.
// API paths and response fields neet to be matched to the actual backend.

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

const ROUTES = {
  register: '/api/auth/register',
  login: '/api/auth/login',
  workouts: '/api/workouts',
  foods: '/api/foods',
  calorieGoal: '/api/calorie-goal',
  steps: '/api/steps',
  bodyWeight: '/api/body-records',
  friendRequest: (id) => `/api/friends/${id}/request`,
  acceptFriend: (id) => `/api/friends/${id}/accept`,
  posts: '/api/posts',
  getPost: (id) => `/api/posts/${id}`,
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

const runId = Date.now();
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
    const response = await api('PUT', ROUTES.calorieGoal, { goal: -500 }, owner.token);
    expect([400, 422]).toContain(response.status);
  });

  test('rejects an unrealistic daily calorie goal', async () => {
    const response = await api('PUT', ROUTES.calorieGoal, { goal: 100000 }, owner.token);
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

    // Verify post ID fields against the backend.
    const privatePost = await api('POST', ROUTES.posts, {
      text: 'Private test post', audience: 'private',
    }, owner.token);
    expect([200, 201]).toContain(privatePost.status);
    privatePostId = privatePost.data.id;

    const friendsPost = await api('POST', ROUTES.posts, {
      text: 'Friends test post', audience: 'friends',
    }, owner.token);
    expect([200, 201]).toContain(friendsPost.status);
    friendsPostId = friendsPost.data.id;

    if (!privatePostId || !friendsPostId) throw new Error('Post creation did not return post IDs');
  });

  test('friend cannot view PRIVATE post', async () => {
    const response = await api('GET', ROUTES.getPost(privatePostId), undefined, friend.token);
    expect([403, 404]).toContain(response.status);
    expect(JSON.stringify(response.data)).not.toContain('Private test post');
  });

  test('stranger cannot view PRIVATE post', async () => {
    const response = await api('GET', ROUTES.getPost(privatePostId), undefined, stranger.token);
    expect([403, 404]).toContain(response.status);
    expect(JSON.stringify(response.data)).not.toContain('Private test post');
  });

  test('friend can view FRIENDS post', async () => {
    const response = await api('GET', ROUTES.getPost(friendsPostId), undefined, friend.token);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.data)).toContain('Friends test post');
  });

  test('stranger cannot view FRIENDS post', async () => {
    const response = await api('GET', ROUTES.getPost(friendsPostId), undefined, stranger.token);
    expect([403, 404]).toContain(response.status);
    expect(JSON.stringify(response.data)).not.toContain('Friends test post');
  });

  test('owner can view own PRIVATE post', async () => {
    const response = await api('GET', ROUTES.getPost(privatePostId), undefined, owner.token);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.data)).toContain('Private test post');
  });

  test('unauthenticated user cannot view PRIVATE or FRIENDS posts', async () => {
    const privateResponse = await api('GET', ROUTES.getPost(privatePostId), undefined);
    expect([401, 403, 404]).toContain(privateResponse.status);
    expect(JSON.stringify(privateResponse.data)).not.toContain('Private test post');

    const friendsResponse = await api('GET', ROUTES.getPost(friendsPostId), undefined);
    expect([401, 403, 404]).toContain(friendsResponse.status);
    expect(JSON.stringify(friendsResponse.data)).not.toContain('Friends test post');
  });
});
