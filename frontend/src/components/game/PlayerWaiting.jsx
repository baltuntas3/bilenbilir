import { useState, useEffect } from 'react';
import { Stack, Text, Title, Paper, Center, Badge, Group, Box, Progress } from '@mantine/core';
import { IconUser } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import PlayerAvatar from './PlayerAvatar';

export default function PlayerWaiting({ nickname, playerCount }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 0;
        return prev + 2;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <Center style={{ minHeight: '50vh' }} className="crt-on">
      <Paper
        p="xl"
        radius="md"
        style={{
          maxWidth: 420,
          width: '100%',
          background: 'var(--theme-surface)',
          border: '1px solid var(--theme-primary)',
          boxShadow: 'var(--theme-glow-primary)',
        }}
      >
        <Stack align="center" gap="lg">
          <Box
            style={{
              border: '2px solid var(--theme-primary)',
              borderRadius: '50%',
              padding: 4,
              boxShadow: 'var(--theme-glow-primary)',
            }}
          >
            <PlayerAvatar nickname={nickname} size="xl" />
          </Box>

          {/* Loading bar */}
          <Box style={{ width: '100%' }}>
            <Progress
              value={progress}
              size="xs"
              
              style={{
                background: 'var(--theme-bg)',
                boxShadow: 'var(--theme-glow-primary)',
              }}
            />
          </Box>

          <Stack align="center" gap="xs">
            <Title
              order={3}
              ta="center"
              className="display-font display-font-sm"
              style={{ color: 'var(--theme-text)' }}
            >
              {t('game.waitingForHost')}
            </Title>
            <Text ta="center" style={{ color: 'var(--theme-text-dim)' }}>
              {t('game.hostWillStart')}
            </Text>
          </Stack>

          <Paper
            p="md"
            radius="md"
            style={{
              width: '100%',
              background: 'var(--theme-bg)',
              border: '1px solid var(--theme-border)',
            }}
          >
            <Stack gap="sm">
              <Group justify="space-between">
                <Text style={{ color: 'var(--theme-text-dim)' }}>{t('game.player')}:</Text>
                <Text
                  fw={700}
                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.65rem',
                    color: 'var(--theme-primary)',
                  }}
                >
                  {nickname}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text style={{ color: 'var(--theme-text-dim)' }}>{t('game.online')}:</Text>
                <Badge
                  leftSection={<IconUser size={12} />}
                  size="lg"
                  
                  variant="light"
                  style={{ boxShadow: 'var(--theme-glow-primary)' }}
                >
                  {playerCount}
                </Badge>
              </Group>
            </Stack>
          </Paper>
        </Stack>
      </Paper>
    </Center>
  );
}
