import { Stack, Group, Paper, Text, ThemeIcon, Title, Center, Box, ColorSwatch, Divider } from '@mantine/core';
import { IconTrophy, IconMedal } from '@tabler/icons-react';
import PlayerAvatar from './PlayerAvatar';

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
        <PlayerAvatar nickname={player.nickname} size={rank === 1 ? 'lg' : 'md'} />
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

function TeamPodiumPlace({ team, rank }) {
  const config = PODIUM_CONFIG[rank];
  if (!team || !config) return null;

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
        <Group gap={6} justify="center" wrap="nowrap">
          <ColorSwatch color={team.color} size={14} />
          <Text fw={700} size={rank === 1 ? 'xl' : 'lg'} ta="center" truncate style={{ maxWidth: 120 }}>
            {team.name}
          </Text>
        </Group>
        <Text size="sm" c="dimmed">
          {team.score.toLocaleString()} pts
        </Text>
        <Text size="xs" c="dimmed">
          {team.playerCount} oyuncu
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

export default function Podium({ players, currentPlayerId, teamMode = false, teamPodium = [] }) {
  // Sort players by score and get top 3
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const top3 = sortedPlayers.slice(0, 3);

  // Find current player's rank
  const currentPlayerRank = sortedPlayers.findIndex((p) => p.id === currentPlayerId) + 1;
  const currentPlayer = sortedPlayers.find((p) => p.id === currentPlayerId);

  return (
    <Stack gap="xl">
      {/* Team Podium (shown first if team mode) */}
      {teamMode && teamPodium.length > 0 && (
        <>
          <Title order={2} ta="center">
            Takım Sonuçları
          </Title>

          <Group justify="center" align="flex-end" gap="md" wrap="nowrap">
            <TeamPodiumPlace team={teamPodium[1]} rank={2} />
            <TeamPodiumPlace team={teamPodium[0]} rank={1} />
            <TeamPodiumPlace team={teamPodium[2]} rank={3} />
          </Group>

          <Divider my="md" />
        </>
      )}

      {/* Individual Podium */}
      <Title order={2} ta="center">
        {teamMode ? 'Bireysel Sonuçlar' : 'Final Sonuçları'}
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
              <Text c="dimmed">Sıralaman:</Text>
              <Text fw={700} size="xl">
                #{currentPlayerRank}
              </Text>
              <Text c="dimmed">puan:</Text>
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
