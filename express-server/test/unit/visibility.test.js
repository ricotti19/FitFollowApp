// Runs the REAL feed filters through sift (Mongo-style matching, ships with mongoose) - no database needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import sift from 'sift';
import { feedFilter, canViewPost, pairKey, escapeRegExp, isValidAvatar } from '../../src/visibility.js';

const ME = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const FRIEND = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const STRANGER = 'cccccccccccccccccccccccc';
const friendIds = [FRIEND];

const post = (authorId, audience, { photoStatus = 'none', authorPublic = false } = {}) => ({ authorId, audience, photoStatus, authorPublic });
const inHome = (p) => sift(feedFilter(ME, friendIds, 'friends'))(p);
const inDiscover = (p) => sift(feedFilter(ME, friendIds, 'discover'))(p);
const sees = (p) => inHome(p) || inDiscover(p);

test('PRIVATE: only the author sees it', () => {
  assert.equal(sees(post(ME, 'PRIVATE')), true);
  assert.equal(sees(post(FRIEND, 'PRIVATE')), false);
  assert.equal(sees(post(STRANGER, 'PRIVATE', { authorPublic: true })), false);
});

test('FRIENDS: author + accepted friends only (even if the account is public)', () => {
  assert.equal(sees(post(ME, 'FRIENDS')), true);
  assert.equal(sees(post(FRIEND, 'FRIENDS')), true);
  assert.equal(sees(post(STRANGER, 'FRIENDS')), false);
  assert.equal(sees(post(STRANGER, 'FRIENDS', { authorPublic: true })), false);
});

test('PUBLIC from a PUBLIC account: strangers see it in Discover', () => {
  const p = post(STRANGER, 'PUBLIC', { authorPublic: true });
  assert.equal(inDiscover(p), true);
  assert.equal(inHome(p), false); // not a friend, so not on Home
});

test('PUBLIC from a PRIVATE account is NOT open to strangers (Conflict 1) but friends still see it', () => {
  assert.equal(sees(post(STRANGER, 'PUBLIC', { authorPublic: false })), false);
  assert.equal(sees(post(FRIEND, 'PUBLIC', { authorPublic: false })), true);
});

test('Discover never shows my own posts (they are on Home)', () => {
  assert.equal(inDiscover(post(ME, 'PUBLIC', { authorPublic: true })), false);
  assert.equal(inHome(post(ME, 'PUBLIC', { authorPublic: true })), true);
});

test('photo awaiting moderation is visible to its author only, whatever the audience', () => {
  for (const audience of ['PRIVATE', 'FRIENDS', 'PUBLIC']) {
    assert.equal(sees(post(ME, audience, { photoStatus: 'review', authorPublic: true })), true, `author, ${audience}`);
    assert.equal(sees(post(FRIEND, audience, { photoStatus: 'review', authorPublic: true })), false, `friend, ${audience}`);
    assert.equal(sees(post(STRANGER, audience, { photoStatus: 'review', authorPublic: true })), false, `stranger, ${audience}`);
  }
});

test('legacy / malformed posts fail closed', () => {
  assert.equal(sees({ audience: 'FRIENDS', photoStatus: 'none' }), false);              // no authorId
  assert.equal(sees({ audience: 'PUBLIC', photoStatus: 'none' }), false);               // no authorPublic, no authorId
  assert.equal(sees(post(STRANGER, 'SOMETHING_ELSE', { authorPublic: true })), false);
  assert.equal(sees(post(STRANGER, undefined, { authorPublic: true })), false);
});

test('Home + Discover together always equal the single-post check (photo endpoint)', () => {
  for (const author of [ME, FRIEND, STRANGER])
    for (const audience of ['PRIVATE', 'FRIENDS', 'PUBLIC', 'junk', undefined])
      for (const photoStatus of ['none', 'approved', 'review'])
        for (const authorPublic of [true, false, undefined])
          for (const filterIds of [[], [FRIEND]]) {
            const p = { authorId: author, audience, photoStatus, authorPublic };
            const viaFeeds = sift(feedFilter(ME, filterIds, 'friends'))(p) || sift(feedFilter(ME, filterIds, 'discover'))(p);
            const viaCheck = canViewPost(p, ME, filterIds.includes(author));
            assert.equal(viaFeeds, viaCheck, JSON.stringify({ author, audience, photoStatus, authorPublic, filterIds }));
          }
});

test('pairKey is the same for (a,b) and (b,a)', () => {
  assert.equal(pairKey(ME, FRIEND), pairKey(FRIEND, ME));
  assert.notEqual(pairKey(ME, FRIEND), pairKey(ME, STRANGER));
});

test('username search input is escaped (no regex injection)', () => {
  const rx = new RegExp(escapeRegExp('a.*(b'), 'i');
  assert.equal(rx.test('a.*(b'), true);
  assert.equal(rx.test('aXXXXb'), false);
});

test('profile photo validation', () => {
  assert.equal(isValidAvatar('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
  assert.equal(isValidAvatar('data:image/svg+xml;base64,PHN2Zz4='), false); // SVG can carry scripts
  assert.equal(isValidAvatar('https://evil.example/x.jpg'), false);
  assert.equal(isValidAvatar('data:image/jpeg;base64,' + 'A'.repeat(60000)), false); // too big
  assert.equal(isValidAvatar(null), false);
});