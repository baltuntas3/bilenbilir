import { Text, Paper, Group, Progress, Stack, Box } from '@mantine/core';

const OPTION_COLORS = [
  { neon: 'var(--theme-opt-a)', mantine: 'cyan' },
  { neon: 'var(--theme-opt-b)', mantine: 'pink' },
  { neon: 'var(--theme-opt-c)', mantine: 'green' },
  { neon: 'var(--theme-opt-d)', mantine: 'yellow' },
  { neon: 'var(--theme-opt-e)', mantine: 'grape' },
  { neon: 'var(--theme-opt-f)', mantine: 'cyan' },
];

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function AnswerDistribution({ distribution, correctAnswerIndex, totalPlayers, options }) {
  if (!distribution || !Array.isArray(distribution)) return null;

  return (
    <Stack gap="xs">
      {distribution.map((count, index) => {
        const percentage = totalPlayers > 0 ? Math.round((count / totalPlayers) * 100) : 0;
        const isCorrect = index === correctAnswerIndex;
        const colors = OPTION_COLORS[index] || OPTION_COLORS[0];

        return (
          <Paper
            key={index}
            p="xs"
            className={`slide-up slide-up-d${index + 1}`}
            style={{
              background: 'var(--theme-surface)',
              border: `1px solid ${isCorrect ? 'var(--theme-success)' : 'var(--theme-border)'}`,
              boxShadow: isCorrect ? 'var(--theme-glow-success)' : 'none',
            }}
          >
            <Group justify="space-between" mb={4} wrap="nowrap">
              <Group gap="xs" wrap="nowrap" style={{ overflow: 'hidden', flex: 1 }}>
                <Box
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: `1px solid ${isCorrect ? 'var(--theme-success)' : colors.neon}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Text
                    fw={700}
                    style={{
                      fontFamily: 'var(--theme-font-display)',
                      fontSize: '0.4rem',
                      color: isCorrect ? 'var(--theme-success)' : colors.neon,
                    }}
                  >
                    {OPTION_LABELS[index]}
                  </Text>
                </Box>
                {options && options[index] && (
                  <Text size="sm" lineClamp={1} style={{ color: 'var(--theme-text)' }}>
                    {options[index]}
                  </Text>
                )}
              </Group>
              <Text
                size="sm"
                fw={700}
                style={{
                  color: isCorrect ? 'var(--theme-success)' : 'var(--theme-text-dim)',
                  flexShrink: 0,
                }}
              >
                {count} ({percentage}%)
              </Text>
            </Group>
            <Progress
              value={percentage}
              color={isCorrect ? 'green' : colors.mantine}
              size="sm"
              style={{
                boxShadow: isCorrect ? 'var(--theme-glow-success)' : 'none',
              }}
            />
          </Paper>
        );
      })}
    </Stack>
  );
}
