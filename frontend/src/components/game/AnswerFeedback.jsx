import { Paper, Stack, Text, ThemeIcon, Group, Badge, Center } from '@mantine/core';
import { IconCheck, IconX, IconFlame } from '@tabler/icons-react';

export default function AnswerFeedback({ isCorrect, score, streakBonus, streak, totalScore }) {
  return (
    <Center style={{ minHeight: 200 }}>
      <Paper p="xl" radius="md" withBorder style={{ maxWidth: 400, width: '100%' }}>
        <Stack align="center" gap="md">
          <ThemeIcon
            size={80}
            radius="xl"
            color={isCorrect ? 'green' : 'red'}
            variant="light"
          >
            {isCorrect ? <IconCheck size={48} /> : <IconX size={48} />}
          </ThemeIcon>

          <Text size="xl" fw={700} ta="center">
            {isCorrect ? 'Correct!' : 'Wrong!'}
          </Text>

          {isCorrect && (
            <Stack gap="xs" align="center">
              <Group gap="xs">
                <Text size="lg" fw={600}>
                  +{score}
                </Text>
                {streakBonus > 0 && (
                  <Badge
                    leftSection={<IconFlame size={14} />}
                    color="orange"
                    variant="light"
                  >
                    +{streakBonus} streak bonus
                  </Badge>
                )}
              </Group>
              {streak > 1 && (
                <Badge
                  size="lg"
                  leftSection={<IconFlame size={16} />}
                  color="orange"
                  variant="filled"
                >
                  {streak} streak!
                </Badge>
              )}
            </Stack>
          )}

          <Text c="dimmed" size="sm">
            Total Score: <strong>{totalScore.toLocaleString()}</strong>
          </Text>
        </Stack>
      </Paper>
    </Center>
  );
}
