import { Avatar } from '@mantine/core';

const DICEBEAR_BASE = 'https://api.dicebear.com/7.x/bottts/svg';

export default function PlayerAvatar({ nickname, size = 'md', ...props }) {
  const seed = encodeURIComponent(nickname || 'default');
  const url = `${DICEBEAR_BASE}?seed=${seed}`;

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
