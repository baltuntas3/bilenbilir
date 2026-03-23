import { Text, Paper, Group, Progress, Stack } from '@mantine/core';

const OPTION_COLORS = ['blue', 'orange', 'green', 'red', 'grape', 'cyan'];
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function AnswerDistribution({ distribution, correctAnswerIndex, totalPlayers, options }) {
  if (!distribution || !Array.isArray(distribution)) return null;

  return (
    <Stack gap="xs">
      {distribution.map((count, index) => {
        const percentage = totalPlayers > 0 ? Math.round((count / totalPlayers) * 100) : 0;
        const isCorrect = index === correctAnswerIndex;

        return (
          <Paper key={index} p="xs" withBorder style={{ borderColor: isCorrect ? 'var(--mantine-color-green-6)' : undefined, borderWidth: isCorrect ? 2 : 1 }}>
            <Group justify="space-between" mb={4}>
              <Group gap="xs">
                <Text fw={700} size="sm" c={OPTION_COLORS[index]}>
                  {OPTION_LABELS[index]}
                </Text>
                {options && options[index] && (
                  <Text size="sm" lineClamp={1}>{options[index]}</Text>
                )}
              </Group>
              <Text size="sm" fw={500}>
                {count} ({percentage}%)
              </Text>
            </Group>
            <Progress value={percentage} color={isCorrect ? 'green' : OPTION_COLORS[index]} size="sm" />
          </Paper>
        );
      })}
    </Stack>
  );
}
