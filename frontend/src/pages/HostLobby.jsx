import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Title,
  Text,
  Stack,
  Group,
  Button,
  CopyButton,
  ActionIcon,
  Tooltip,
  Badge,
  Card,
  SimpleGrid,
  Menu,
  Center,
  Loader,
  Alert,
  Switch,
  NumberInput,
  TextInput,
  Select,
  Divider,
  ColorSwatch,
  Box,
} from '@mantine/core';
import {
  IconCopy,
  IconCheck,
  IconPlayerPlay,
  IconDoorExit,
  IconUser,
  IconDotsVertical,
  IconUserMinus,
  IconBan,
  IconAlertCircle,
  IconRefresh,
  IconArrowsShuffle,
  IconUsersGroup,
  IconPlus,
  IconTrash,
  IconBolt,
} from '@tabler/icons-react';
import { useGame, GAME_STATES } from '../context/GameContext';
import { showToast } from '../utils/toast';
import PlayerAvatar from '../components/game/PlayerAvatar';
import ShareButton from '../components/game/ShareButton';

export default function HostLobby() {
  const { t } = useTranslation();
  const { quizId } = useParams();
  const navigate = useNavigate();
  const {
    roomPin,
    isHost,
    gameState,
    players,
    quiz,
    totalQuestions,
    createRoom,
    closeRoom,
    getMyRoom,
    forceCloseExistingRoom,
    startGame,
    kickPlayer,
    banPlayer,
    teams,
    teamMode,
    enableTeamMode,
    disableTeamMode,
    addTeam,
    removeTeam,
    assignTeam,
    lightningRound,
    setLightningRound,
  } = useGame();

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [existingRoom, setExistingRoom] = useState(null);
  const [closingExisting, setClosingExisting] = useState(false);
  const [randomEnabled, setRandomEnabled] = useState(false);
  const [questionCount, setQuestionCount] = useState(totalQuestions || 0);
  const [newTeamName, setNewTeamName] = useState('');
  const [lightningEnabled, setLightningEnabled] = useState(lightningRound?.enabled || false);
  const [lightningCount, setLightningCount] = useState(lightningRound?.questionCount || 3);

  useEffect(() => {
    if (totalQuestions > 0 && questionCount === 0) {
      setQuestionCount(totalQuestions);
    }
  }, [totalQuestions, questionCount]);

  useEffect(() => {
    if (!quizId) {
      navigate('/my-quizzes');
      return;
    }

    if (roomPin && isHost) {
      setLoading(false);
      return;
    }

    const initRoom = async () => {
      try {
        const existing = await getMyRoom();
        if (existing) {
          setExistingRoom(existing);
          setLoading(false);
          return;
        }

        await createRoom(quizId);
        setLoading(false);
      } catch (error) {
        if (error.message?.includes('already have an active room')) {
          const existing = await getMyRoom();
          if (existing) {
            setExistingRoom(existing);
            setLoading(false);
            return;
          }
        }
        showToast.error(error.message || 'Failed to create room');
        navigate('/my-quizzes');
      }
    };

    initRoom();
  }, [quizId, roomPin, isHost, createRoom, getMyRoom, navigate]);

  useEffect(() => {
    if (gameState === GAME_STATES.QUESTION_INTRO) {
      navigate('/host');
    }
  }, [gameState, navigate]);

  const handleCloseExistingAndCreate = async () => {
    setClosingExisting(true);
    try {
      await forceCloseExistingRoom();
      setExistingRoom(null);
      showToast.success('Previous room closed');
      await createRoom(quizId);
      setLoading(false);
    } catch (error) {
      showToast.error(error.message || 'Failed to close existing room');
    } finally {
      setClosingExisting(false);
    }
  };

  const handleRejoinExisting = () => {
    navigate(`/host/${existingRoom.quizId}`);
  };

  const connectedPlayers = players.filter(p => !p.disconnected);

  const handleStartGame = async () => {
    if (connectedPlayers.length === 0) {
      showToast.error('Wait for at least one connected player to join');
      return;
    }

    setStarting(true);
    try {
      await startGame(randomEnabled ? questionCount : undefined);
    } catch (error) {
      showToast.error(error.message || 'Failed to start game');
      setStarting(false);
    }
  };

  const handleCloseRoom = async () => {
    try {
      await closeRoom();
      showToast.success('Room closed');
      navigate('/my-quizzes');
    } catch (error) {
      showToast.error(error.message || 'Failed to close room');
    }
  };

  const handleKickPlayer = async (playerId, nickname) => {
    try {
      await kickPlayer(playerId);
      showToast.success(`${nickname} has been kicked`);
    } catch (error) {
      showToast.error(error.message || 'Failed to kick player');
    }
  };

  const handleBanPlayer = async (playerId, nickname) => {
    try {
      await banPlayer(playerId);
      showToast.success(`${nickname} has been banned`);
    } catch (error) {
      showToast.error(error.message || 'Failed to ban player');
    }
  };

  const handleToggleTeamMode = async (checked) => {
    try {
      if (checked) {
        await enableTeamMode();
      } else {
        await disableTeamMode();
      }
    } catch (error) {
      showToast.error(error.message || 'Failed to change team mode');
    }
  };

  const handleToggleLightning = async (checked) => {
    setLightningEnabled(checked);
    try {
      await setLightningRound(checked, lightningCount);
    } catch (error) {
      showToast.error(error.message || 'Failed to update lightning round');
      setLightningEnabled(!checked);
    }
  };

  const handleLightningCountChange = async (val) => {
    const count = val || 3;
    setLightningCount(count);
    try {
      await setLightningRound(lightningEnabled, count);
    } catch (error) {
      showToast.error(error.message || 'Failed to update lightning round');
    }
  };

  const handleAddTeam = async () => {
    if (!newTeamName.trim()) {
      showToast.error(t('team.teamNameRequired'));
      return;
    }
    try {
      await addTeam(newTeamName.trim());
      setNewTeamName('');
    } catch (error) {
      showToast.error(error.message || 'Failed to add team');
    }
  };

  const handleRemoveTeam = async (teamId) => {
    try {
      await removeTeam(teamId);
    } catch (error) {
      showToast.error(error.message || 'Failed to remove team');
    }
  };

  const handleAssignTeam = async (playerId, teamId) => {
    try {
      await assignTeam(playerId, teamId);
    } catch (error) {
      showToast.error(error.message || 'Failed to assign player to team');
    }
  };

  // Existing room dialog
  if (existingRoom) {
    return (
      <Container size="sm" py="xl" className="fade-slide-in">
        <Stack gap="xl">
          <Alert
            icon={<IconAlertCircle size={24} />}
            title={t('game.activeRoomDetected')}
            color="yellow"
            style={{
              background: 'rgba(255, 230, 0, 0.05)',
              border: '1px solid var(--theme-warning)',
            }}
          >
            {t('game.activeRoomMsg')}
          </Alert>

          <Paper
            p="xl"
            radius="md"
            style={{
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-border)',
            }}
          >
            <Stack gap="md">
              <Group justify="space-between">
                <Text fw={500} style={{ color: 'var(--theme-text)' }}>{t('game.existingRoom')}</Text>
                <Badge
                  size="lg"
                  
                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.5rem',
                  }}
                >
                  PIN: {existingRoom.pin}
                </Badge>
              </Group>

              <SimpleGrid cols={2} spacing="xs">
                <div>
                  <Text size="sm" style={{ color: 'var(--theme-text-dim)' }}>{t('game.state')}</Text>
                  <Text fw={500} style={{ color: 'var(--theme-text)' }}>{existingRoom.state}</Text>
                </div>
                <div>
                  <Text size="sm" style={{ color: 'var(--theme-text-dim)' }}>{t('game.players')}</Text>
                  <Text fw={500} style={{ color: 'var(--theme-text)' }}>
                    {existingRoom.connectedPlayerCount} / {existingRoom.playerCount}
                  </Text>
                </div>
                <div>
                  <Text size="sm" style={{ color: 'var(--theme-text-dim)' }}>{t('game.question')}</Text>
                  <Text fw={500} style={{ color: 'var(--theme-text)' }}>
                    {existingRoom.currentQuestionIndex + 1}
                  </Text>
                </div>
                <div>
                  <Text size="sm" style={{ color: 'var(--theme-text-dim)' }}>{t('game.hostStatus')}</Text>
                  <Badge
                    color={existingRoom.isHostDisconnected ? 'red' : 'green'}
                    size="sm"
                  >
                    {existingRoom.isHostDisconnected ? t('game.disconnected') : t('game.connected')}
                  </Badge>
                </div>
              </SimpleGrid>
            </Stack>
          </Paper>

          <Group justify="center" gap="md">
            <Button
              variant="light"
              color="red"
              leftSection={<IconDoorExit size={18} />}
              onClick={handleCloseExistingAndCreate}
              loading={closingExisting}
              style={{ border: '1px solid var(--theme-secondary)' }}
            >
              {t('game.closeAndCreate')}
            </Button>
            <Button
              leftSection={<IconRefresh size={18} />}
              onClick={handleRejoinExisting}
              
              style={{ boxShadow: 'var(--theme-glow-primary)' }}
            >
              {t('game.rejoinExisting')}
            </Button>
          </Group>
        </Stack>
      </Container>
    );
  }

  if (loading) {
    return (
      <Center h="50vh">
        <Stack align="center" gap="md">
          <Loader size="lg"  />
          <Text
            className="anim-pulse"
            style={{
              fontFamily: 'var(--theme-font-display)',
              fontSize: '0.6rem',
              color: 'var(--theme-primary)',
              textShadow: 'var(--theme-glow-primary)',
            }}
          >
            {t('game.creatingArena')}
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Container size="md" py="xl" className="fade-slide-in">
      <Stack gap="lg">
        {/* PIN Display */}
        <Paper
          p="xl"
          radius="md"
          style={{
            background: 'var(--theme-surface)',
            border: '2px solid var(--theme-primary)',
            boxShadow: 'var(--theme-glow-primary)',
            textAlign: 'center',
          }}
        >
          <Stack align="center" gap="md">
            <Text
              style={{
                fontFamily: 'var(--theme-font-display)',
                fontSize: '0.6rem',
                color: 'var(--theme-text-dim)',
              }}
            >
              {t('game.pin')}
            </Text>
            <Group gap="xs" align="center" justify="center">
              <Title
                order={1}
                className="theme-text-primary anim-flicker"
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: 'clamp(1.5rem, 6vw, 3rem)',
                  letterSpacing: '0.5rem',
                }}
              >
                {roomPin}
              </Title>
              <CopyButton value={roomPin} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? t('common.copied') : t('common.copy')}>
                    <ActionIcon
                      variant="subtle"
                      color={copied ? 'green' : 'cyan'}
                      onClick={copy}
                      size="lg"
                    >
                      {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
            <Text size="sm" style={{ color: 'var(--theme-text-dim)' }}>
              Join at <strong style={{ color: 'var(--theme-primary)' }}>bilenbilir.com/join</strong>
            </Text>
            <ShareButton pin={roomPin} />
          </Stack>
        </Paper>

        {/* Quiz Info */}
        {quiz && (
          <Paper
            p="md"
            radius="md"
            style={{
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-border)',
            }}
          >
            <Group justify="space-between">
              <div>
                <Text fw={500} style={{ color: 'var(--theme-text)' }}>{quiz.title}</Text>
                <Text size="sm" style={{ color: 'var(--theme-text-dim)' }}>
                  {t('quiz.questionCount', { count: quiz.questionCount || totalQuestions || 0 })}
                </Text>
              </div>
              <Badge
                size="lg"
                variant="light"
                
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '0.5rem',
                  boxShadow: 'var(--theme-glow-primary)',
                }}
              >
                {t('game.onlineCount', { count: players.length })}
              </Badge>
            </Group>
          </Paper>
        )}

        {/* Team Mode Toggle */}
        <Paper
          p="md"
          radius="md"
          style={{
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-border)',
          }}
        >
          <Group justify="space-between">
            <Group gap="xs">
              <IconUsersGroup size={20} style={{ color: 'var(--theme-accent)' }} />
              <Text fw={500} style={{ color: 'var(--theme-text)' }}>{t('team.teamMode')}</Text>
            </Group>
            <Switch
              checked={teamMode}
              onChange={(e) => handleToggleTeamMode(e.currentTarget.checked)}
              label={teamMode ? t('common.active') : t('common.inactive')}
              color="violet"
            />
          </Group>
        </Paper>

        {/* Team Management */}
        {teamMode && (
          <Paper
            p="md"
            radius="md"
            style={{
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-accent)',
              boxShadow: 'var(--theme-glow-accent)',
            }}
          >
            <Stack gap="md">
              <Text
                fw={700}
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '0.6rem',
                  color: 'var(--theme-accent)',
                }}
              >
                {t('team.teamsCount', { count: teams.length })}
              </Text>

              <Group gap="sm">
                <TextInput
                  placeholder={t('team.teamNamePlaceholder')}
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
                  style={{ flex: 1 }}
                  maxLength={20}
                  styles={{
                    input: {
                      background: 'var(--theme-bg)',
                      border: '1px solid var(--theme-border)',
                      color: 'var(--theme-text)',
                    },
                  }}
                />
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={handleAddTeam}
                  disabled={!newTeamName.trim() || teams.length >= 8}
                  variant="light"
                  color="violet"
                >
                  {t('team.addTeam')}
                </Button>
              </Group>

              {teams.length === 0 ? (
                <Text ta="center" size="sm" style={{ color: 'var(--theme-text-dim)' }}>
                  {t('team.noTeams')}
                </Text>
              ) : (
                <Stack gap="xs">
                  {teams.map((team) => (
                    <Paper
                      key={team.id}
                      p="sm"
                      radius="md"
                      style={{
                        background: 'var(--theme-bg)',
                        border: '1px solid var(--theme-border)',
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap">
                          <ColorSwatch color={team.color} size={18} />
                          <Text fw={500} style={{ color: 'var(--theme-text)' }}>{team.name}</Text>
                          <Badge variant="light" size="sm" color="violet">
                            {t('team.players_other', { count: team.playerCount })}
                          </Badge>
                        </Group>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          onClick={() => handleRemoveTeam(team.id)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>
        )}

        {/* Lightning Round */}
        <Paper
          p="md"
          radius="md"
          style={{
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-border)',
          }}
        >
          <Stack gap="sm">
            <Group justify="space-between">
              <Group gap="xs">
                <IconBolt size={20} style={{ color: 'var(--theme-warning)' }} />
                <Text fw={500} style={{ color: 'var(--theme-text)' }}>{t('game.lightningRound')}</Text>
              </Group>
              <Switch
                checked={lightningEnabled}
                onChange={(e) => handleToggleLightning(e.currentTarget.checked)}
                label={lightningEnabled ? t('common.active') : t('common.inactive')}
                color="yellow"
              />
            </Group>
            {lightningEnabled && (
              <NumberInput
                label={t('game.lightningQuestionCount')}
                description={t('game.lightningRoundDesc')}
                value={lightningCount}
                onChange={handleLightningCountChange}
                min={1}
                max={10}
                leftSection={<IconBolt size={18} />}
                styles={{
                  input: {
                    background: 'var(--theme-bg)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-text)',
                  },
                  label: { color: 'var(--theme-text)' },
                  description: { color: 'var(--theme-text-dim)' },
                }}
              />
            )}
          </Stack>
        </Paper>

        {/* Players List */}
        <Stack gap="sm">
          <Text
            fw={700}
            style={{
              fontFamily: 'var(--theme-font-display)',
              fontSize: '0.7rem',
              color: 'var(--theme-primary)',
              textShadow: 'var(--theme-glow-primary)',
            }}
          >
            {t('game.players')} ({players.length})
          </Text>

          {players.length === 0 ? (
            <Paper
              p="xl"
              radius="md"
              style={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-border)',
              }}
            >
              <Center>
                <Stack align="center" gap="xs">
                  <IconUser size={48} stroke={1} style={{ color: 'var(--theme-text-dim)' }} />
                  <Text
                    className="anim-pulse"
                    style={{
                      fontFamily: 'var(--theme-font-display)',
                      fontSize: '0.5rem',
                      color: 'var(--theme-text-dim)',
                    }}
                  >
                    {t('game.waitingPlayers')}
                  </Text>
                </Stack>
              </Center>
            </Paper>
          ) : (
            <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
              {players.map((player, idx) => {
                const playerTeam = teamMode
                  ? teams.find((t) => t.playerIds?.includes(player.id))
                  : null;

                return (
                  <Card
                    key={player.id}
                    padding="sm"
                    radius="md"
                    className={`slide-up slide-up-d${Math.min(idx + 1, 4)}`}
                    style={{
                      background: 'var(--theme-surface)',
                      border: '1px solid var(--theme-border)',
                      transition: 'border-color 0.3s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--theme-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--theme-border)';
                    }}
                  >
                    <Stack gap={4}>
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap" style={{ overflow: 'hidden' }}>
                          <PlayerAvatar nickname={player.nickname} size="sm" />
                          <Text truncate fw={500} size="sm" style={{ color: 'var(--theme-text)' }}>
                            {player.nickname}
                          </Text>
                        </Group>
                        <Menu position="bottom-end" withArrow>
                          <Menu.Target>
                            <ActionIcon variant="subtle" size="sm">
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown
                            style={{
                              background: 'var(--theme-surface)',
                              border: '1px solid var(--theme-border)',
                            }}
                          >
                            <Menu.Item
                              leftSection={<IconUserMinus size={16} />}
                              onClick={() => handleKickPlayer(player.id, player.nickname)}
                            >
                              {t('game.kick')}
                            </Menu.Item>
                            <Menu.Item
                              leftSection={<IconBan size={16} />}
                              color="red"
                              onClick={() => handleBanPlayer(player.id, player.nickname)}
                            >
                              {t('game.ban')}
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>

                      {teamMode && teams.length > 0 && (
                        <Select
                          size="xs"
                          placeholder={t('team.selectTeam')}
                          data={teams.map((t) => ({
                            value: t.id,
                            label: t.name,
                          }))}
                          value={playerTeam?.id || null}
                          onChange={(teamId) => {
                            if (teamId) handleAssignTeam(player.id, teamId);
                          }}
                          clearable={false}
                          styles={{
                            input: {
                              background: 'var(--theme-bg)',
                              border: '1px solid var(--theme-border)',
                              color: 'var(--theme-text)',
                              fontSize: '0.75rem',
                            },
                          }}
                        />
                      )}
                    </Stack>
                  </Card>
                );
              })}
            </SimpleGrid>
          )}
        </Stack>

        {/* Random Question Selection */}
        {totalQuestions > 1 && (
          <Paper
            p="md"
            radius="md"
            style={{
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-border)',
            }}
          >
            <Stack gap="sm">
              <Switch
                label={t('game.randomQuestions')}
                checked={randomEnabled}
                onChange={(e) => setRandomEnabled(e.currentTarget.checked)}
                size="md"
                
              />
              {randomEnabled && (
                <NumberInput
                  label={t('game.questionCountLabel')}
                  value={questionCount}
                  onChange={(val) => setQuestionCount(val || 1)}
                  min={1}
                  max={totalQuestions}
                  leftSection={<IconArrowsShuffle size={18} />}
                  styles={{
                    input: {
                      background: 'var(--theme-bg)',
                      border: '1px solid var(--theme-border)',
                      color: 'var(--theme-text)',
                    },
                    label: { color: 'var(--theme-text)' },
                  }}
                />
              )}
            </Stack>
          </Paper>
        )}

        {/* Action Buttons */}
        <Group justify="center" gap="md">
          <Button
            variant="light"
            color="red"
            leftSection={<IconDoorExit size={18} />}
            onClick={handleCloseRoom}
            style={{ border: '1px solid var(--theme-secondary)' }}
          >
            {t('game.closeRoom')}
          </Button>
          <Button
            size="lg"
            leftSection={<IconPlayerPlay size={20} />}
            onClick={handleStartGame}
            loading={starting}
            disabled={connectedPlayers.length === 0 || starting}
            
            style={{
              boxShadow: connectedPlayers.length > 0 ? 'var(--theme-glow-primary)' : 'none',
              fontFamily: 'var(--theme-font-display)',
              fontSize: '0.7rem',
              transition: 'box-shadow 0.3s',
            }}
          >
            {t('game.startGame')}
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
