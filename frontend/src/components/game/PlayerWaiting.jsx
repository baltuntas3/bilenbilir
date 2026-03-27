import { useState, useEffect, useCallback, useMemo } from 'react';
import { Stack, Text, Title, Paper, Center, Badge, Group, Box, Progress, Transition } from '@mantine/core';
import { IconUser, IconBulb } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import PlayerAvatar from './PlayerAvatar';

const FACT_INTERVAL_MS = 5000;

export default function PlayerWaiting({ nickname, playerCount }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);

  const funFacts = useMemo(() => t('game.waitingFunFacts', { returnObjects: true }), [t]);
  const shuffled = useMemo(() => {
    if (!Array.isArray(funFacts)) return [];
    return [...funFacts].sort(() => Math.random() - 0.5);
  }, [funFacts]);

  const [factIndex, setFactIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const rotateFact = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setFactIndex((prev) => (prev + 1) % shuffled.length);
      setVisible(true);
    }, 300);
  }, [shuffled.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 0;
        return prev + 2;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (shuffled.length === 0) return;
    const interval = setInterval(rotateFact, FACT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [rotateFact, shuffled.length]);

  const currentFact = shuffled.length > 0 ? shuffled[factIndex] : t('game.hostWillStart');

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
          </Stack>

          {/* Fun fact */}
          <Paper
            p="sm"
            radius="md"
            style={{
              width: '100%',
              background: 'rgba(0, 240, 255, 0.04)',
              border: '1px solid var(--theme-primary)',
              minHeight: 52,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Transition mounted={visible} transition="fade" duration={300}>
              {(styles) => (
                <Group gap="xs" wrap="nowrap" justify="center" style={styles}>
                  <IconBulb
                    size={18}
                    style={{ color: 'var(--theme-warning)', flexShrink: 0 }}
                  />
                  <Text
                    size="sm"
                    ta="center"
                    fw={500}
                    style={{ color: 'var(--theme-text)' }}
                  >
                    {currentFact}
                  </Text>
                </Group>
              )}
            </Transition>
          </Paper>

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
