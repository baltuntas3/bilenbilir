import { Center, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconPlayerPause } from '@tabler/icons-react';

export default function GamePausedBanner({ message = 'The host has paused the game. Please wait...' }) {
  return (
    <Center>
      <Paper p="xl" radius="md" withBorder bg="yellow.0">
        <Stack align="center" gap="md">
          <ThemeIcon size={60} radius="xl" color="yellow" variant="light">
            <IconPlayerPause size={32} />
          </ThemeIcon>
          <Text size="xl" fw={600}>Game Paused</Text>
          <Text c="dimmed">{message}</Text>
        </Stack>
      </Paper>
    </Center>
  );
}
