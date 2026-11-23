// Privacy + friendship rules, kept free of Express/Mongoose side effects so they can be unit-tested.

export const AUDIENCES = ['PRIVATE', 'FRIENDS', 'PUBLIC'];

// Photos only become visible to others once the CV check approved them (see checkPhoto in server.js).
const VISIBLE_PHOTO_STATES = ['none', 'approved'];

/**
 * One Friendship document exists per PAIR of users, whichever direction the request went.
 * Sorting the two ids makes (A,B) and (B,A) produce the same key, and a unique index on it
 * means Mongo itself refuses a duplicate or crossed request.
 */
export const pairKey = (a, b) => [String(a), String(b)].sort().join(':');

/**
 * Requirements "Conflict 1": accounts are PRIVATE by default and a user must switch on a public account on purpose.
 * A post's audience says who it is FOR; the account setting decides whether "public" is really open to strangers.
 *   PRIVATE  -> author only
 *   FRIENDS  -> author + accepted friends
 *   PUBLIC   -> author + accepted friends, and ANYONE if the author's account is public (`authorPublic`)
 * Photos still waiting for moderation stay author-only.
 *
 * scope 'friends'  (Home):     my posts + my friends' FRIENDS/PUBLIC posts
 * scope 'discover' (Discover): other people's public posts from public accounts
 * Between them they cover exactly what canViewPost() allows (checked in the unit tests).
 */
export function feedFilter(viewerId, friendIds = [], scope = 'friends') {
  if (scope === 'discover') {
    return {
      photoStatus: { $in: VISIBLE_PHOTO_STATES },
      audience: 'PUBLIC',
      authorPublic: true,
      authorId: { $ne: viewerId },
    };
  }
  return {
    $or: [
      { authorId: viewerId },
      {
        photoStatus: { $in: VISIBLE_PHOTO_STATES },
        audience: { $in: ['FRIENDS', 'PUBLIC'] },
        authorId: { $in: friendIds },
      },
    ],
  };
}

/** Single-post version (used by the photo endpoint). Must always agree with feedFilter. */
export function canViewPost(post, viewerId, isFriend) {
  if (String(post.authorId) === String(viewerId)) return true;
  if (!VISIBLE_PHOTO_STATES.includes(post.photoStatus)) return false;
  if (post.audience === 'PUBLIC' && post.authorPublic === true) return true;
  if ((post.audience === 'FRIENDS' || post.audience === 'PUBLIC') && isFriend) return true;
  return false; // PRIVATE (or anything unrecognised) -> author only
}

/** Escape user input before putting it in a RegExp (username search). */
export const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Profile photos are stored as small data URLs (the client shrinks them first). */
export const AVATAR_MAX_CHARS = 60000;
export const isValidAvatar = (v) =>
  typeof v === 'string' && v.length <= AVATAR_MAX_CHARS && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);