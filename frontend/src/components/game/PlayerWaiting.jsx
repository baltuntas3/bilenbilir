import { Stack, Text, Title, Paper, Center, Loader, Badge, Group } from '@mantine/core';
import { IconUser } from '@tabler/icons-react';

export default function PlayerWaiting({ nickname, playerCount }) {
  return (
    <Center style={{ minHeight: '50vh' }}>
      <Paper shadow="md" p="xl" radius="md" withBorder style={{ maxWidth: 400, width: '100%' }}>
        <Stack align="center" gap="lg">
          <Loader size="lg" type="dots" />

          <Stack align="center" gap="xs">
            <Title order={2} ta="center">
              Waiting for the game to start...
            </Title>
            <Text c="dimmed" ta="center">
              The host will start the game soon
            </Text>
          </Stack>

          <Paper p="md" radius="md" withBorder style={{ width: '100%' }}>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text c="dimmed">Your nickname:</Text>
                <Text fw={600}>{nickname}</Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed">Players joined:</Text>
                <Badge leftSection={<IconUser size={14} />} variant="light" size="lg">
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
