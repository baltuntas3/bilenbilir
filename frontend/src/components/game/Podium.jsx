import { Stack, Group, Paper, Text, ThemeIcon, Title, Center, Box } from '@mantine/core';
import { IconTrophy, IconMedal } from '@tabler/icons-react';

const PODIUM_CONFIG = {
  1: {
    color: 'yellow',
    icon: <IconTrophy size={32} />,
    height: 180,
    order: 2,
    label: '1st',
  },
  2: {
    color: 'gray.5',
    icon: <IconMedal size={28} />,
    height: 140,
    order: 1,
    label: '2nd',
  },
  3: {
    color: 'orange',
    icon: <IconMedal size={24} />,
    height: 100,
    order: 3,
    label: '3rd',
  },
};

function PodiumPlace({ player, rank }) {
  const config = PODIUM_CONFIG[rank];
  if (!player || !config) return null;

  return (
    <Box style={{ order: config.order, flex: 1 }}>
      <Stack align="center" gap="xs">
        <ThemeIcon
          variant="light"
          color={config.color}
          size={rank === 1 ? 60 : 50}
          radius="xl"
        >
          {config.icon}
        </ThemeIcon>
        <Text fw={700} size={rank === 1 ? 'xl' : 'lg'} ta="center" truncate style={{ maxWidth: 120 }}>
          {player.nickname}
        </Text>
        <Text size="sm" c="dimmed">
          {player.score.toLocaleString()} pts
        </Text>
        <Paper
          style={{
            width: '100%',
            height: config.height,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: 16,
          }}
          radius="md"
          bg={config.color}
        >
          <Title order={2} c="white">
            {config.label}
          </Title>
        </Paper>
      </Stack>
    </Box>
  );
}

export default function Podium({ players, currentPlayerId }) {
  // Sort players by score and get top 3
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const top3 = sortedPlayers.slice(0, 3);

  // Find current player's rank
  const currentPlayerRank = sortedPlayers.findIndex((p) => p.id === currentPlayerId) + 1;
  const currentPlayer = sortedPlayers.find((p) => p.id === currentPlayerId);

  return (
    <Stack gap="xl">
      <Title order={2} ta="center">
        Final Results
      </Title>

      <Group justify="center" align="flex-end" gap="md" wrap="nowrap">
        <PodiumPlace player={top3[1]} rank={2} />
        <PodiumPlace player={top3[0]} rank={1} />
        <PodiumPlace player={top3[2]} rank={3} />
      </Group>

      {currentPlayer && currentPlayerRank > 3 && (
        <Paper p="md" radius="md" withBorder>
          <Center>
            <Group gap="md">
              <Text c="dimmed">Your ranking:</Text>
              <Text fw={700} size="xl">
                #{currentPlayerRank}
              </Text>
              <Text c="dimmed">with</Text>
              <Text fw={700} size="xl">
                {currentPlayer.score.toLocaleString()} pts
              </Text>
            </Group>
          </Center>
        </Paper>
      )}
    </Stack>
  );
}
