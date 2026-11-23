import React, { useState } from 'react';
import { avatarColor, initial } from '../lib/format';

/** Profile photo, or a coloured initial when there is none (or it fails to load). `user` needs username/displayName/avatarUrl. */
export default function Avatar({ user, size = 36 }) {
  const [broken, setBroken] = useState(false);
  const name = user?.displayName || user?.username || '?';
  const box = { width: size, height: size };
  if (user?.avatarUrl && !broken) {
    return <img className="avatar-img" src={user.avatarUrl} alt="" loading="lazy" style={box} onError={() => setBroken(true)} />;
  }
  return (
    <span className="avatar-fallback" aria-hidden="true" style={{ ...box, fontSize: Math.round(size * 0.42), background: avatarColor(user?.username) }}>
      {initial(name)}
    </span>
  );
}