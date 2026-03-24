import { useEffect } from 'react';
import { Stack, Group, Paper, Text, ThemeIcon, Title, Center, Box, ColorSwatch, Divider } from '@mantine/core';
import { IconTrophy, IconMedal } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import PlayerAvatar from './PlayerAvatar';
import { fireConfetti } from '../../utils/confetti';

const PODIUM_CONFIG = {
  1: {
    color: 'var(--theme-warning)',
    glow: 'var(--theme-glow-warning)',
    mantineColor: 'yellow',
    icon: <IconTrophy size={28} />,
    height: { base: 120, sm: 180 },
    order: 2,
    label: '#1',
    animDelay: 'podium-rise-d1',
  },
  2: {
    color: 'var(--theme-primary)',
    glow: 'var(--theme-glow-primary)',
    mantineColor: 'cyan',
    icon: <IconMedal size={24} />,
    height: { base: 90, sm: 140 },
    order: 1,
    label: '#2',
    animDelay: 'podium-rise-d2',
  },
  3: {
    color: 'var(--theme-secondary)',
    glow: 'var(--theme-glow-secondary)',
    mantineColor: 'pink',
    icon: <IconMedal size={22} />,
    height: { base: 65, sm: 100 },
    order: 3,
    label: '#3',
    animDelay: 'podium-rise-d3',
  },
};

function PodiumPlace({ player, rank, t }) {
  const config = PODIUM_CONFIG[rank];
  if (!player || !config) return null;

  return (
    <Box style={{ order: config.order, flex: 1, maxWidth: '33%' }}>
      <Stack align="center" gap={6}>
        <Box
          className={rank === 1 ? 'crown-bounce' : ''}
          style={{
            border: `2px solid ${config.color}`,
            borderRadius: '50%',
            padding: 3,
            boxShadow: config.glow,
          }}
        >
          <PlayerAvatar nickname={player.nickname} size={rank === 1 ? 'lg' : 'md'} />
        </Box>

        <ThemeIcon
          variant="light"
          color={config.mantineColor}
          size={rank === 1 ? 50 : 40}
          radius="xl"
          style={{ boxShadow: config.glow }}
        >
          {config.icon}
        </ThemeIcon>

        <Text
          fw={700}
          ta="center"
          truncate
          style={{
            maxWidth: 100,
            fontFamily: 'var(--theme-font-display)',
            fontSize: rank === 1 ? '0.6rem' : '0.5rem',
            color: config.color,
            textShadow: config.glow,
          }}
        >
          {player.nickname}
        </Text>

        <Text size="sm" style={{ color: 'var(--theme-text-dim)' }}>
          {(player.score || 0).toLocaleString()} {t('game.pts')}
        </Text>

        <Paper
          className={`podium-rise ${config.animDelay}`}
          style={{
            width: '100%',
            height: config.height.base,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: 12,
            background: `linear-gradient(180deg, ${config.color}33 0%, ${config.color}11 100%)`,
            border: `1px solid ${config.color}`,
            boxShadow: config.glow,
          }}
          radius="md"
        >
          <Title
            order={3}
            style={{
              fontFamily: 'var(--theme-font-display)',
              fontSize: '0.8rem',
              color: config.color,
              textShadow: config.glow,
            }}
          >
            {config.label}
          </Title>
        </Paper>
      </Stack>
    </Box>
  );
}

function TeamPodiumPlace({ team, rank, t }) {
  const config = PODIUM_CONFIG[rank];
  if (!team || !config) return null;

  return (
    <Box style={{ order: config.order, flex: 1, maxWidth: '33%' }}>
      <Stack align="center" gap={6}>
        <ThemeIcon
          variant="light"
          color={config.mantineColor}
          size={rank === 1 ? 50 : 40}
          radius="xl"
          style={{ boxShadow: config.glow }}
        >
          {config.icon}
        </ThemeIcon>
        <Group gap={4} justify="center" wrap="nowrap">
          <ColorSwatch color={team.color} size={12} />
          <Text
            fw={700}
            ta="center"
            truncate
            style={{
              maxWidth: 90,
              fontFamily: 'var(--theme-font-display)',
              fontSize: rank === 1 ? '0.55rem' : '0.45rem',
              color: config.color,
              textShadow: config.glow,
            }}
          >
            {team.name}
          </Text>
        </Group>
        <Text size="sm" style={{ color: 'var(--theme-text-dim)' }}>
          {(team.score || 0).toLocaleString()} {t('game.pts')}
        </Text>
        <Text size="xs" style={{ color: 'var(--theme-text-dim)' }}>
          {t('team.players_other', { count: team.playerCount })}
        </Text>
        <Paper
          className={`podium-rise ${config.animDelay}`}
          style={{
            width: '100%',
            height: config.height.base,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: 12,
            background: `linear-gradient(180deg, ${config.color}33 0%, ${config.color}11 100%)`,
            border: `1px solid ${config.color}`,
            boxShadow: config.glow,
          }}
          radius="md"
        >
          <Title
            order={3}
            style={{
              fontFamily: 'var(--theme-font-display)',
              fontSize: '0.8rem',
              color: config.color,
              textShadow: config.glow,
            }}
          >
            {config.label}
          </Title>
        </Paper>
      </Stack>
    </Box>
  );
}

export default function Podium({ players = [], currentPlayerId, teamMode = false, teamPodium = [] }) {
  const { t } = useTranslation();
  const sortedPlayers = [...(players || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
  const top3 = sortedPlayers.slice(0, 3);
  const currentPlayerRank = sortedPlayers.findIndex((p) => p.id === currentPlayerId) + 1;
  const currentPlayer = sortedPlayers.find((p) => p.id === currentPlayerId);

  // Fire confetti on mount
  useEffect(() => {
    const timer = setTimeout(() => fireConfetti(), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Stack gap="xl" className="fade-slide-in">
      {/* Team Podium */}
      {teamMode && teamPodium.length > 0 && (
        <>
          <Title
            order={2}
            ta="center"
            className="theme-text-warning display-font display-font-sm"
          >
            {t('game.teamResults')}
          </Title>

          <Group justify="center" align="flex-end" gap="xs" wrap="nowrap">
            <TeamPodiumPlace team={teamPodium[1]} rank={2} t={t} />
            <TeamPodiumPlace team={teamPodium[0]} rank={1} t={t} />
            <TeamPodiumPlace team={teamPodium[2]} rank={3} t={t} />
          </Group>

          <Divider color="var(--theme-border)" my="md" />
        </>
      )}

      {/* Individual Podium */}
      <Title
        order={2}
        ta="center"
        className="theme-text-primary display-font display-font-sm"
      >
        {teamMode ? t('game.individualResults') : t('game.finalResults')}
      </Title>

      <Group justify="center" align="flex-end" gap="xs" wrap="nowrap">
        <PodiumPlace player={top3[1]} rank={2} t={t} />
        <PodiumPlace player={top3[0]} rank={1} t={t} />
        <PodiumPlace player={top3[2]} rank={3} t={t} />
      </Group>

      {currentPlayer && currentPlayerRank > 3 && (
        <Paper
          p="md"
          radius="md"
          style={{
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-primary)',
            boxShadow: 'var(--theme-glow-primary)',
          }}
        >
          <Center>
            <Group gap="md">
              <Text style={{ color: 'var(--theme-text-dim)' }}>{t('game.rank')}:</Text>
              <Text
                fw={700}
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '1rem',
                  color: 'var(--theme-primary)',
                  textShadow: 'var(--theme-glow-primary)',
                }}
              >
                #{currentPlayerRank}
              </Text>
              <Text style={{ color: 'var(--theme-text-dim)' }}>{t('game.score')}:</Text>
              <Text
                fw={700}
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '1rem',
                  color: 'var(--theme-warning)',
                  textShadow: 'var(--theme-glow-warning)',
                }}
              >
                {(currentPlayer.score || 0).toLocaleString()}
              </Text>
            </Group>
          </Center>
        </Paper>
      )}
    </Stack>
  );
}
