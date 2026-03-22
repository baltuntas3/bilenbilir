import { useMemo } from 'react';
import { Paper, Stack, Group, Text, Badge, ThemeIcon, ScrollArea, Tabs, ColorSwatch } from '@mantine/core';
import { IconTrophy, IconMedal, IconUser, IconUsersGroup } from '@tabler/icons-react';
import PlayerAvatar from './PlayerAvatar';

const RANK_COLORS = {
  1: 'yellow',
  2: 'gray',
  3: 'orange',
};

const RANK_ICONS = {
  1: <IconTrophy size={18} />,
  2: <IconMedal size={18} />,
  3: <IconMedal size={18} />,
};

function PlayerLeaderboard({ players, currentPlayerId, maxHeight }) {
  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players]
  );

  return (
    <ScrollArea h={maxHeight} offsetScrollbars>
      <Stack gap="xs">
        {sortedPlayers.map((player, index) => {
          const rank = index + 1;
          const isCurrentPlayer = player.id === currentPlayerId;

          return (
            <Paper
              key={player.id}
              p="sm"
              radius="md"
              withBorder
              style={{
                borderColor: isCurrentPlayer ? 'var(--mantine-color-blue-5)' : undefined,
                backgroundColor: isCurrentPlayer ? 'var(--mantine-color-blue-light)' : undefined,
              }}
            >
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" style={{ overflow: 'hidden' }}>
                  {RANK_ICONS[rank] ? (
                    <ThemeIcon
                      variant="light"
                      color={RANK_COLORS[rank]}
                      size="lg"
                      radius="xl"
                    >
                      {RANK_ICONS[rank]}
                    </ThemeIcon>
                  ) : (
                    <Badge
                      variant="light"
                      color="gray"
                      size="lg"
                      radius="xl"
                      style={{ minWidth: 36 }}
                    >
                      {rank}
                    </Badge>
                  )}
                  <PlayerAvatar nickname={player.nickname} size="sm" />
                  <Text fw={isCurrentPlayer ? 700 : 500} truncate>
                    {player.nickname}
                    {isCurrentPlayer && ' (Sen)'}
                  </Text>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  {player.streak > 0 && (
                    <Badge variant="light" color="orange" size="sm">
                      {player.streak} seri
                    </Badge>
                  )}
                  <Text fw={700} size="lg">
                    {player.score.toLocaleString()}
                  </Text>
                </Group>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    </ScrollArea>
  );
}

function TeamLeaderboard({ teamLeaderboard, maxHeight }) {
  if (!teamLeaderboard || teamLeaderboard.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="md">
        Takım verisi yok
      </Text>
    );
  }

  return (
    <ScrollArea h={maxHeight} offsetScrollbars>
      <Stack gap="xs">
        {teamLeaderboard.map((team, index) => {
          const rank = index + 1;

          return (
            <Paper key={team.id} p="sm" radius="md" withBorder>
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" style={{ overflow: 'hidden' }}>
                  {RANK_ICONS[rank] ? (
                    <ThemeIcon
                      variant="light"
                      color={RANK_COLORS[rank]}
                      size="lg"
                      radius="xl"
                    >
                      {RANK_ICONS[rank]}
                    </ThemeIcon>
                  ) : (
                    <Badge
                      variant="light"
                      color="gray"
                      size="lg"
                      radius="xl"
                      style={{ minWidth: 36 }}
                    >
                      {rank}
                    </Badge>
                  )}
                  <Group gap="xs" wrap="nowrap">
                    <ColorSwatch color={team.color} size={14} />
                    <Text fw={500} truncate>
                      {team.name}
                    </Text>
                  </Group>
                  <Badge variant="light" size="sm">
                    {team.playerCount} oyuncu
                  </Badge>
                </Group>
                <Text fw={700} size="lg">
                  {team.score.toLocaleString()}
                </Text>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    </ScrollArea>
  );
}

export default function Leaderboard({ players, currentPlayerId, maxHeight = 400, teamMode = false, teamLeaderboard = [] }) {
  if (!teamMode) {
    return <PlayerLeaderboard players={players} currentPlayerId={currentPlayerId} maxHeight={maxHeight} />;
  }

  return (
    <Tabs defaultValue="individual">
      <Tabs.List mb="sm">
        <Tabs.Tab value="individual" leftSection={<IconUser size={16} />}>
          Bireysel
        </Tabs.Tab>
        <Tabs.Tab value="team" leftSection={<IconUsersGroup size={16} />}>
          Takım
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="individual">
        <PlayerLeaderboard players={players} currentPlayerId={currentPlayerId} maxHeight={maxHeight - 50} />
      </Tabs.Panel>

      <Tabs.Panel value="team">
        <TeamLeaderboard teamLeaderboard={teamLeaderboard} maxHeight={maxHeight - 50} />
      </Tabs.Panel>
    </Tabs>
  );
}
