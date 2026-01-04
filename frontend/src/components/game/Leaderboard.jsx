import { Paper, Stack, Group, Text, Badge, ThemeIcon, ScrollArea } from '@mantine/core';
import { IconTrophy, IconMedal } from '@tabler/icons-react';

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

export default function Leaderboard({ players, currentPlayerId, maxHeight = 400 }) {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

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
                  <Text fw={isCurrentPlayer ? 700 : 500} truncate>
                    {player.nickname}
                    {isCurrentPlayer && ' (You)'}
                  </Text>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  {player.streak > 0 && (
                    <Badge variant="light" color="orange" size="sm">
                      {player.streak} streak
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
