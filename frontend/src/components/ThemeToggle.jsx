import { ActionIcon, useMantineColorScheme } from '@mantine/core';
import { IconSun, IconMoon } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export default function ThemeToggle({ onToggle }) {
  const { colorScheme } = useMantineColorScheme();
  const dark = colorScheme === 'dark';
  const { t } = useTranslation();

  return (
    <ActionIcon
      variant="subtle"
      onClick={onToggle}
      title={dark ? t('nav.lightMode') : t('nav.darkMode')}
    >
      {dark ? <IconSun size={20} /> : <IconMoon size={20} />}
    </ActionIcon>
  );
}
