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
    createRoom,
    closeRoom,
    startGame,
    kickPlayer,
    banPlayer,
  } = useGame();

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

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
        await createRoom(quizId);
        setLoading(false);
      } catch (error) {
        showToast.error(error.message || 'Failed to create room');
        navigate('/my-quizzes');
      }
    };

    initRoom();
  }, [quizId, roomPin, isHost, createRoom, navigate]);

  // Redirect to game when game starts
  useEffect(() => {
    if (gameState === GAME_STATES.QUESTION_INTRO) {
      navigate('/host');
    }
  }, [gameState, navigate]);

  const handleStartGame = async () => {
    if (players.length === 0) {
      showToast.error('Wait for at least one player to join');
      return;
    }

    setStarting(true);
    try {
      await startGame();
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
                  {quiz.questions?.length || 0} questions
                </Text>
              </div>
              <Badge size="lg" variant="light">
                {players.length} players
              </Badge>
            </Group>
          </Paper>
        )}

        {/* Players List */}
        <Stack gap="sm">
          <Title order={3}>Players ({players.length})</Title>

          {players.length === 0 ? (
            <Paper p="xl" radius="md" withBorder>
              <Center>
                <Stack align="center" gap="xs">
                  <IconUser size={48} stroke={1} color="gray" />
                  <Text c="dimmed">Waiting for players to join...</Text>
                </Stack>
              </Center>
            </Paper>
          ) : (
            <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
              {players.map((player) => (
                <Card key={player.id} padding="sm" radius="md" withBorder>
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
                </Card>
              ))}
            </SimpleGrid>
          )}
        </Stack>

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
