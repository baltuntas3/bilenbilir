import { useEffect, useState } from 'react';
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
} from '@tabler/icons-react';
import { useGame, GAME_STATES } from '../context/GameContext';
import { showToast } from '../utils/toast';

export default function HostLobby() {
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
    // Team mode
    teams,
    teamMode,
    enableTeamMode,
    disableTeamMode,
    addTeam,
    removeTeam,
    assignTeam,
  } = useGame();

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [existingRoom, setExistingRoom] = useState(null);
  const [closingExisting, setClosingExisting] = useState(false);
  const [randomEnabled, setRandomEnabled] = useState(false);
  const [questionCount, setQuestionCount] = useState(totalQuestions || 0);
  const [newTeamName, setNewTeamName] = useState('');

  // Sync questionCount default when totalQuestions loads
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

    // If already in a room, don't create a new one
    if (roomPin && isHost) {
      setLoading(false);
      return;
    }

    const initRoom = async () => {
      try {
        // First check if there's an existing room
        const existing = await getMyRoom();
        if (existing) {
          setExistingRoom(existing);
          setLoading(false);
          return;
        }

        // No existing room, create new one
        await createRoom(quizId);
        setLoading(false);
      } catch (error) {
        // Check if error is about existing room
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

  // Redirect to game when game starts
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

      // Now create new room
      await createRoom(quizId);
      setLoading(false);
    } catch (error) {
      showToast.error(error.message || 'Failed to close existing room');
    } finally {
      setClosingExisting(false);
    }
  };

  const handleRejoinExisting = () => {
    // Navigate to the existing room's quiz host page
    navigate(`/host/${existingRoom.quizId}`);
    // Force reload to reconnect
    window.location.reload();
  };

  const handleStartGame = async () => {
    if (players.length === 0) {
      showToast.error('Wait for at least one player to join');
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

  const handleAddTeam = async () => {
    if (!newTeamName.trim()) {
      showToast.error('Takım adı gerekli');
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

  // Show existing room options
  if (existingRoom) {
    return (
      <Container size="sm" py="xl">
        <Stack gap="xl">
          <Alert
            icon={<IconAlertCircle size={24} />}
            title="You have an active room"
            color="yellow"
          >
            You already have an active game room. You can either rejoin it or close it to create a new one.
          </Alert>

          <Paper shadow="md" p="xl" radius="md" withBorder>
            <Stack gap="md">
              <Group justify="space-between">
                <Text fw={500}>Existing Room</Text>
                <Badge size="lg">PIN: {existingRoom.pin}</Badge>
              </Group>

              <SimpleGrid cols={2} spacing="xs">
                <div>
                  <Text size="sm" c="dimmed">State</Text>
                  <Text fw={500}>{existingRoom.state}</Text>
                </div>
                <div>
                  <Text size="sm" c="dimmed">Players</Text>
                  <Text fw={500}>{existingRoom.connectedPlayerCount} / {existingRoom.playerCount}</Text>
                </div>
                <div>
                  <Text size="sm" c="dimmed">Question</Text>
                  <Text fw={500}>{existingRoom.currentQuestionIndex + 1}</Text>
                </div>
                <div>
                  <Text size="sm" c="dimmed">Host Status</Text>
                  <Badge color={existingRoom.isHostDisconnected ? 'red' : 'green'} size="sm">
                    {existingRoom.isHostDisconnected ? 'Disconnected' : 'Connected'}
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
            >
              Close & Create New
            </Button>
            <Button
              leftSection={<IconRefresh size={18} />}
              onClick={handleRejoinExisting}
            >
              Rejoin Existing Room
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
          <Loader size="lg" />
          <Text c="dimmed">Creating room...</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* PIN Display */}
        <Paper shadow="md" p="xl" radius="md" withBorder>
          <Stack align="center" gap="md">
            <Text c="dimmed" size="sm">Game PIN</Text>
            <Group gap="xs" align="center">
              <Title order={1} style={{ fontSize: '3rem', letterSpacing: '0.5rem' }}>
                {roomPin}
              </Title>
              <CopyButton value={roomPin} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Copied!' : 'Copy PIN'}>
                    <ActionIcon
                      variant="subtle"
                      color={copied ? 'teal' : 'gray'}
                      onClick={copy}
                      size="lg"
                    >
                      {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
            <Text c="dimmed" size="sm">
              Players join at <strong>bilenbilir.com/join</strong>
            </Text>
          </Stack>
        </Paper>

        {/* Quiz Info */}
        {quiz && (
          <Paper p="md" radius="md" withBorder>
            <Group justify="space-between">
              <div>
                <Text fw={500}>{quiz.title}</Text>
                <Text size="sm" c="dimmed">
                  {quiz.questionCount || totalQuestions || 0} questions
                </Text>
              </div>
              <Badge size="lg" variant="light">
                {players.length} players
              </Badge>
            </Group>
          </Paper>
        )}

        {/* Team Mode Toggle */}
        <Paper p="md" radius="md" withBorder>
          <Group justify="space-between">
            <Group gap="xs">
              <IconUsersGroup size={20} />
              <Text fw={500}>Takım Modu</Text>
            </Group>
            <Switch
              checked={teamMode}
              onChange={(e) => handleToggleTeamMode(e.currentTarget.checked)}
              label={teamMode ? 'Aktif' : 'Kapalı'}
            />
          </Group>
        </Paper>

        {/* Team Management (only visible when team mode is on) */}
        {teamMode && (
          <Paper p="md" radius="md" withBorder>
            <Stack gap="md">
              <Title order={4}>Takımlar ({teams.length})</Title>

              {/* Add Team */}
              <Group gap="sm">
                <TextInput
                  placeholder="Takım adı"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
                  style={{ flex: 1 }}
                  maxLength={20}
                />
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={handleAddTeam}
                  disabled={!newTeamName.trim() || teams.length >= 8}
                  variant="light"
                >
                  Ekle
                </Button>
              </Group>

              {/* Team List */}
              {teams.length === 0 ? (
                <Text c="dimmed" ta="center" size="sm">
                  Henüz takım eklenmedi
                </Text>
              ) : (
                <Stack gap="xs">
                  {teams.map((team) => (
                    <Paper key={team.id} p="sm" radius="md" withBorder>
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap">
                          <ColorSwatch color={team.color} size={18} />
                          <Text fw={500}>{team.name}</Text>
                          <Badge variant="light" size="sm">
                            {team.playerCount} oyuncu
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

        {/* Players List */}
        <Stack gap="sm">
          <Title order={3}>Oyuncular ({players.length})</Title>

          {players.length === 0 ? (
            <Paper p="xl" radius="md" withBorder>
              <Center>
                <Stack align="center" gap="xs">
                  <IconUser size={48} stroke={1} color="gray" />
                  <Text c="dimmed">Oyuncuların katılması bekleniyor...</Text>
                </Stack>
              </Center>
            </Paper>
          ) : (
            <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
              {players.map((player) => {
                const playerTeam = teamMode
                  ? teams.find((t) => t.playerIds?.includes(player.id))
                  : null;

                return (
                  <Card key={player.id} padding="sm" radius="md" withBorder>
                    <Stack gap={4}>
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap" style={{ overflow: 'hidden' }}>
                          <IconUser size={20} />
                          <Text truncate fw={500}>
                            {player.nickname}
                          </Text>
                        </Group>
                        <Menu position="bottom-end" withArrow>
                          <Menu.Target>
                            <ActionIcon variant="subtle" size="sm">
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconUserMinus size={16} />}
                              onClick={() => handleKickPlayer(player.id, player.nickname)}
                            >
                              Kick
                            </Menu.Item>
                            <Menu.Item
                              leftSection={<IconBan size={16} />}
                              color="red"
                              onClick={() => handleBanPlayer(player.id, player.nickname)}
                            >
                              Ban
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>

                      {/* Team assignment dropdown */}
                      {teamMode && teams.length > 0 && (
                        <Select
                          size="xs"
                          placeholder="Takım seç"
                          data={teams.map((t) => ({
                            value: t.id,
                            label: t.name,
                          }))}
                          value={playerTeam?.id || null}
                          onChange={(teamId) => {
                            if (teamId) handleAssignTeam(player.id, teamId);
                          }}
                          clearable={false}
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
          <Paper p="md" radius="md" withBorder>
            <Stack gap="sm">
              <Switch
                label="Rastgele soru secimi"
                checked={randomEnabled}
                onChange={(e) => setRandomEnabled(e.currentTarget.checked)}
                size="md"
              />
              {randomEnabled && (
                <NumberInput
                  label="Soru Sayisi"
                  value={questionCount}
                  onChange={(val) => setQuestionCount(val || 1)}
                  min={1}
                  max={totalQuestions}
                  leftSection={<IconArrowsShuffle size={18} />}
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
          >
            Close Room
          </Button>
          <Button
            size="lg"
            leftSection={<IconPlayerPlay size={20} />}
            onClick={handleStartGame}
            loading={starting}
            disabled={players.length === 0}
          >
            Start Game
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
