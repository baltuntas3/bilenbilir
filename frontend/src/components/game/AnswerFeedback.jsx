import { Paper, Stack, Text, Group, Badge, Center, Alert, Box } from '@mantine/core';
import { IconCheck, IconX, IconFlame, IconInfoCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export default function AnswerFeedback({ isCorrect, score, streakBonus, streak, totalScore, explanation }) {
  const { t } = useTranslation();

  return (
    <Center style={{ minHeight: 160 }}>
      <Paper
        p="xl"
        radius="md"
        className={isCorrect ? 'score-pop' : 'shake'}
        style={{
          maxWidth: 400,
          width: '100%',
          background: 'var(--theme-surface)',
          border: `2px solid ${isCorrect ? 'var(--theme-success)' : 'var(--theme-secondary)'}`,
          boxShadow: isCorrect ? 'var(--theme-glow-success)' : 'var(--theme-glow-secondary)',
        }}
      >
        <Stack align="center" gap="md">
          <Box
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `2px solid ${isCorrect ? 'var(--theme-success)' : 'var(--theme-secondary)'}`,
              background: isCorrect ? 'rgba(57, 255, 20, 0.1)' : 'rgba(255, 45, 149, 0.1)',
              boxShadow: isCorrect ? 'var(--theme-glow-success)' : 'var(--theme-glow-secondary)',
            }}
          >
            {isCorrect
              ? <IconCheck size={36} style={{ color: 'var(--theme-success)' }} />
              : <IconX size={36} style={{ color: 'var(--theme-secondary)' }} />}
          </Box>

          <Text
            fw={700}
            ta="center"
            style={{
              fontFamily: 'var(--theme-font-display)',
              fontSize: '0.8rem',
              color: isCorrect ? 'var(--theme-success)' : 'var(--theme-secondary)',
              textShadow: isCorrect ? 'var(--theme-glow-success)' : 'var(--theme-glow-secondary)',
            }}
          >
            {isCorrect ? t('game.correct') : t('game.wrong')}
          </Text>

          {isCorrect && (
            <Stack gap="xs" align="center">
              <Group gap="xs">
                <Text
                  fw={700}
                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.7rem',
                    color: 'var(--theme-warning)',
                    textShadow: 'var(--theme-glow-warning)',
                  }}
                >
                  +{score}
                </Text>
                {streakBonus > 0 && (
                  <Badge
                    leftSection={<IconFlame size={14} />}
                    color="orange"
                    variant="filled"
                    style={{
                      fontFamily: 'var(--theme-font-display)',
                      fontSize: '0.4rem',
                    }}
                  >
                    {t('game.streakBonus', { count: streakBonus })}
                  </Badge>
                )}
              </Group>
              {streak > 1 && (
                <Badge
                  size="lg"
                  leftSection={<IconFlame size={16} />}
                  color="orange"
                  variant="filled"
                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.5rem',
                    boxShadow: 'var(--theme-glow-warning)',
                  }}
                >
                  {t('game.streakCount', { count: streak })}
                </Badge>
              )}
            </Stack>
          )}

          <Text size="sm" style={{ color: 'var(--theme-text-dim)' }}>
            {t('game.totalScore', { count: totalScore.toLocaleString() })}
          </Text>

          {explanation && (
            <Alert
              icon={<IconInfoCircle size={16} />}
              
              variant="light"
              title={t('quiz.explanation')}
              style={{
                width: '100%',
                background: 'rgba(0, 240, 255, 0.05)',
                border: '1px solid var(--theme-primary)',
              }}
            >
              {explanation}
            </Alert>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
