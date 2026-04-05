import { Avatar } from '@mantine/core';
import { createAvatar } from '@dicebear/core';
import { bottts } from '@dicebear/collection';

// Module-level cache: same nickname -> same data URI, generated once per session.
const avatarCache = new Map();

function getAvatarDataUri(nickname) {
  const seed = nickname || 'default';
  const cached = avatarCache.get(seed);
  if (cached) return cached;
  const svg = createAvatar(bottts, { seed }).toString();
  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  avatarCache.set(seed, dataUri);
  return dataUri;
}

export default function PlayerAvatar({ nickname, size = 'md', ...props }) {
  const url = getAvatarDataUri(nickname);

  return (
    <Avatar
      src={url}
      alt={nickname}
      size={size}
      radius="xl"
      {...props}
    />
  );
}
