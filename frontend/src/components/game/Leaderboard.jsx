import { useMemo } from 'react';
import { Paper, Stack, Group, Text, Badge, ThemeIcon, ScrollArea, Tabs, ColorSwatch, Box } from '@mantine/core';
import { IconTrophy, IconMedal, IconUser, IconUsersGroup } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import PlayerAvatar from './PlayerAvatar';

const RANK_CONFIGS = {
  1: { color: 'var(--theme-warning)', glow: 'var(--theme-glow-warning)', mantine: 'yellow', icon: <IconTrophy size={18} /> },
  2: { color: 'var(--theme-primary)', glow: 'var(--theme-glow-primary)', mantine: 'cyan', icon: <IconMedal size={18} /> },
  3: { color: 'var(--theme-secondary)', glow: 'var(--theme-glow-secondary)', mantine: 'pink', icon: <IconMedal size={18} /> },
};

function PlayerLeaderboard({ players = [], currentPlayerId, maxHeight, t }) {
  const sortedPlayers = useMemo(
    () => [...(players || [])].sort((a, b) => (b.score || 0) - (a.score || 0)),
    [players]
  );

  return (
    <ScrollArea h={maxHeight} offsetScrollbars>
      <Stack gap="xs">
        {sortedPlayers.map((player, index) => {
          const rank = index + 1;
          const isCurrentPlayer = player.id === currentPlayerId;
          const rankConfig = RANK_CONFIGS[rank];

          return (
            <Paper
              key={player.id}
              p="sm"
              radius="md"
              className={`slide-up slide-up-d${Math.min(rank, 4)}`}
              style={{
                background: isCurrentPlayer ? 'rgba(0, 240, 255, 0.08)' : 'var(--theme-surface)',
                border: `1px solid ${
                  isCurrentPlayer ? 'var(--theme-primary)' :
                  rankConfig ? rankConfig.color : 'var(--theme-border)'
                }`,
                boxShadow: isCurrentPlayer ? 'var(--theme-glow-primary)' :
                  rankConfig ? rankConfig.glow : 'none',
              }}
            >
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" style={{ overflow: 'hidden' }}>
                  {rankConfig ? (
                    <Box
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: `1px solid ${rankConfig.color}`,
                        boxShadow: rankConfig.glow,
                        flexShrink: 0,
                      }}
                    >
                      <Text style={{ color: rankConfig.color }}>{rankConfig.icon}</Text>
                    </Box>
                  ) : (
                    <Box
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--theme-border)',
                        flexShrink: 0,
                      }}
                    >
                      <Text
                        fw={700}
                        size="sm"
                        style={{
                          fontFamily: 'var(--theme-font-display)',
                          fontSize: '0.5rem',
                          color: 'var(--theme-text-dim)',
                        }}
                      >
                        {rank}
                      </Text>
                    </Box>
                  )}
                  <PlayerAvatar nickname={player.nickname} size="sm" />
                  <Text
                    fw={isCurrentPlayer ? 700 : 500}
                    truncate
                    style={{
                      color: isCurrentPlayer ? 'var(--theme-primary)' : 'var(--theme-text)',
                    }}
                  >
                    {player.nickname}
                    {isCurrentPlayer && ` (${t('game.you')})`}
                  </Text>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  {player.streak > 0 && (
                    <Badge
                      variant="filled"
                      color="orange"
                      size="sm"
                      style={{
                        fontFamily: 'var(--theme-font-display)',
                        fontSize: '0.35rem',
                      }}
                    >
                      {player.streak}x
                    </Badge>
                  )}
                  <Text
                    fw={700}
                    style={{
                      fontFamily: 'var(--theme-font-display)',
                      fontSize: '0.6rem',
                      color: rankConfig ? rankConfig.color : 'var(--theme-text)',
                    }}
                  >
                    {(player.score || 0).toLocaleString()}
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

function TeamLeaderboard({ teamLeaderboard, maxHeight, t }) {
  if (!teamLeaderboard || teamLeaderboard.length === 0) {
    return (
      <Text style={{ color: 'var(--theme-text-dim)' }} ta="center" py="md">
        {t('game.noTeamData')}
      </Text>
    );
  }

  return (
    <ScrollArea h={maxHeight} offsetScrollbars>
      <Stack gap="xs">
        {teamLeaderboard.map((team, index) => {
          const rank = index + 1;
          const rankConfig = RANK_CONFIGS[rank];

          return (
            <Paper
              key={team.id}
              p="sm"
              radius="md"
              style={{
                background: 'var(--theme-surface)',
                border: `1px solid ${rankConfig ? rankConfig.color : 'var(--theme-border)'}`,
                boxShadow: rankConfig ? rankConfig.glow : 'none',
              }}
            >
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" style={{ overflow: 'hidden' }}>
                  {rankConfig ? (
                    <Box
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: `1px solid ${rankConfig.color}`,
                        flexShrink: 0,
                      }}
                    >
                      <Text style={{ color: rankConfig.color }}>{rankConfig.icon}</Text>
                    </Box>
                  ) : (
                    <Badge variant="light" color="gray" size="lg" radius="xl" style={{ minWidth: 36 }}>
                      {rank}
                    </Badge>
                  )}
                  <Group gap="xs" wrap="nowrap">
                    <ColorSwatch color={team.color} size={14} />
                    <Text fw={500} truncate style={{ color: 'var(--theme-text)' }}>
                      {team.name}
                    </Text>
                  </Group>
                  <Badge variant="light" size="sm" >
                    {t('team.players_other', { count: team.playerCount })}
                  </Badge>
                </Group>
                <Text
                  fw={700}
                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.6rem',
                    color: rankConfig ? rankConfig.color : 'var(--theme-text)',
                  }}
                >
                  {(team.score || 0).toLocaleString()}
                </Text>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    </ScrollArea>
  );
}

export default function Leaderboard({ players = [], currentPlayerId, maxHeight = 400, teamMode = false, teamLeaderboard = [] }) {
  const { t } = useTranslation();

  if (!teamMode) {
    return <PlayerLeaderboard players={players} currentPlayerId={currentPlayerId} maxHeight={maxHeight} t={t} />;
  }

  return (
    <Tabs defaultValue="individual" >
      <Tabs.List mb="sm" style={{ borderColor: 'var(--theme-border)' }}>
        <Tabs.Tab value="individual" leftSection={<IconUser size={16} />}>
          {t('team.individual')}
        </Tabs.Tab>
        <Tabs.Tab value="team" leftSection={<IconUsersGroup size={16} />}>
          {t('team.teamTab')}
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="individual">
        <PlayerLeaderboard players={players} currentPlayerId={currentPlayerId} maxHeight={maxHeight - 50} t={t} />
      </Tabs.Panel>

      <Tabs.Panel value="team">
        <TeamLeaderboard teamLeaderboard={teamLeaderboard} maxHeight={maxHeight - 50} t={t} />
      </Tabs.Panel>
    </Tabs>
  );
}
