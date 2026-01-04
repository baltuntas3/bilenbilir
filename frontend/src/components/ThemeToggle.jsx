import { ActionIcon, useMantineColorScheme } from '@mantine/core';
import { IconSun, IconMoon } from '@tabler/icons-react';

export default function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const dark = colorScheme === 'dark';

  return (
    <ActionIcon
      variant="subtle"
      onClick={() => toggleColorScheme()}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <IconSun size={20} /> : <IconMoon size={20} />}
    </ActionIcon>
  );
}
