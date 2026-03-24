import { Text, Center, Stack, Box, Progress } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export default function Timer({ remaining, total, isLightning = false, compact = false }) {
  const { t } = useTranslation();
  const percentage = total > 0 ? (remaining / total) * 100 : 0;

  const getColor = () => {
    if (isLightning) return 'var(--theme-accent)';
    if (percentage > 50) return 'var(--theme-success)';
    if (percentage > 25) return 'var(--theme-warning)';
    return 'var(--theme-secondary)';
  };

  const getGlow = () => {
    if (isLightning) return 'var(--theme-glow-accent)';
    if (percentage > 50) return 'var(--theme-glow-success)';
    if (percentage > 25) return 'var(--theme-glow-warning)';
    return 'var(--theme-glow-secondary)';
  };

  const getMantineColor = () => {
    if (isLightning) return 'grape';
    if (percentage > 50) return 'green';
    if (percentage > 25) return 'yellow';
    return 'pink';
  };

  const isDanger = percentage <= 25 && !isLightning;
  const color = getColor();

  // Compact mode for mobile - horizontal bar
  if (compact) {
    return (
      <Box className={isDanger ? 'timer-danger' : ''} style={{ width: '100%' }}>
        <Stack gap={4}>
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {isLightning && (
              <Text style={{ fontSize: '1rem' }}>{'\u26A1'}</Text>
            )}
            <Text
              fw={700}
              style={{
                fontFamily: 'var(--theme-font-display)',
                fontSize: '1.2rem',
                color,
                textShadow: getGlow(),
              }}
            >
              {remaining}
            </Text>
            <Text size="xs" style={{ color: 'var(--theme-text-dim)' }}>
              {t('game.sec')}
            </Text>
          </Box>
          <Progress
            value={percentage}
            size="sm"
            color={getMantineColor()}
            style={{ boxShadow: getGlow() }}
          />
        </Stack>
      </Box>
    );
  }

  // Full mode - digital clock display
  return (
    <Center>
      <Box
        className={isDanger ? 'timer-danger' : isLightning ? 'anim-pulse' : ''}
        style={{
          borderRadius: 16,
          border: `2px solid ${color}`,
          boxShadow: getGlow(),
          padding: '16px 24px',
          background: 'var(--theme-bg)',
          minWidth: 100,
          textAlign: 'center',
        }}
      >
        <Stack gap={2} align="center">
          {isLightning && (
            <Text style={{ fontSize: '1.2rem', lineHeight: 1 }}>{'\u26A1'}</Text>
          )}
          <Text
            fw={700}
            style={{
              fontFamily: 'var(--theme-font-display)',
              fontSize: '1.8rem',
              color,
              textShadow: getGlow(),
              lineHeight: 1,
            }}
          >
            {remaining}
          </Text>
          <Text
            size="xs"
            style={{
              fontFamily: 'var(--theme-font-display)',
              fontSize: '0.5rem',
              color: 'var(--theme-text-dim)',
            }}
          >
            {t('game.seconds')}
          </Text>
        </Stack>
      </Box>
    </Center>
  );
}
