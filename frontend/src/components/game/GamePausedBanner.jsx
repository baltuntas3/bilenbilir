import { Center, Paper, Stack, Text, Box } from '@mantine/core';
import { IconPlayerPause } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export default function GamePausedBanner({ message }) {
  const { t } = useTranslation();

  return (
    <Center>
      <Paper
        p="xl"
        radius="md"
        className="anim-pulse"
        style={{
          background: 'var(--theme-surface)',
          border: '1px solid var(--theme-warning)',
          boxShadow: 'var(--theme-glow-warning)',
        }}
      >
        <Stack align="center" gap="md">
          <Box
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--theme-warning)',
              boxShadow: 'var(--theme-glow-warning)',
              background: 'rgba(255, 230, 0, 0.05)',
            }}
          >
            <IconPlayerPause size={32} style={{ color: 'var(--theme-warning)' }} />
          </Box>
          <Text
            fw={700}
            style={{
              fontFamily: 'var(--theme-font-display)',
              fontSize: '0.7rem',
              color: 'var(--theme-warning)',
              textShadow: 'var(--theme-glow-warning)',
            }}
          >
            {t('game.gamePaused')}
          </Text>
          <Text style={{ color: 'var(--theme-text-dim)' }}>{message || t('game.gamePausedMsg')}</Text>
        </Stack>
      </Paper>
    </Center>
  );
}
