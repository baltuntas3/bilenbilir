import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Stack,
  Group,
  Paper,
  Text,
  Badge,
  Center,
  Button,
  SimpleGrid,
  Progress,
  ThemeIcon,
} from '@mantine/core';
import { IconDoorExit, IconCheck, IconEye, IconPlayerPause, IconUsers } from '@tabler/icons-react';
import { useGame, GAME_STATES } from '../context/GameContext';
import Timer from '../components/game/Timer';
import QuestionDisplay from '../components/game/QuestionDisplay';
import Leaderboard from '../components/game/Leaderboard';
import Podium from '../components/game/Podium';

export default function SpectatorGame() {
  const navigate = useNavigate();
  const {
    roomPin,
    isSpectator,
    nickname,
    gameState,
    players,
    currentQuestion,
    currentQuestionIndex,
    totalQuestions,
    timeLimit,
    remainingTime,
    leaderboard,
    podium,
    correctAnswerIndex,
    answerDistribution,
    answeredCount,
    leaveRoom,
  } = useGame();

  // Redirect if not a spectator
  useEffect(() => {
    if (!roomPin || !isSpectator) {
      navigate('/join');
    }
  }, [roomPin, isSpectator, navigate]);

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  const connectedPlayers = players.filter((p) => !p.disconnectedAt);

  // Render based on game state
  const renderContent = () => {
    switch (gameState) {
      case GAME_STATES.WAITING_PLAYERS:
        return (
          <Center style={{ minHeight: 300 }}>
            <Paper p="xl" radius="md" withBorder>
              <Stack align="center" gap="md">
                <ThemeIcon size={60} radius="xl" variant="light" color="blue">
                  <IconEye size={32} />
                </ThemeIcon>
                <Text size="xl" fw={600}>Watching as Spectator</Text>
                <Text c="dimmed" ta="center">
                  Waiting for the host to start the game...
                </Text>
                <Badge size="lg" variant="light">
                  {connectedPlayers.length} players joined
                </Badge>
              </Stack>
            </Paper>
          </Center>
        );

      case GAME_STATES.QUESTION_INTRO:
        return (
          <Stack gap="xl">
            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
            />
            <Center>
              <Paper p="xl" radius="md" withBorder>
                <Text size="lg" ta="center" c="dimmed">
                  Get ready! The question will start soon...
                </Text>
              </Paper>
            </Center>
          </Stack>
        );

      case GAME_STATES.ANSWERING_PHASE:
        return (
          <Stack gap="xl">
            <Group justify="space-between" align="flex-start">
              <Timer remaining={remainingTime} total={timeLimit} />
              <Paper p="md" radius="md" withBorder>
                <Stack gap="xs" align="center">
                  <Group gap="xs">
                    <IconUsers size={20} />
                    <Text fw={600}>
                      {answeredCount} / {connectedPlayers.length}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">answered</Text>
                  <Progress
                    value={(answeredCount / Math.max(connectedPlayers.length, 1)) * 100}
                    size="sm"
                    style={{ width: 100 }}
                  />
                </Stack>
              </Paper>
            </Group>

            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
            />

            {/* Show options without ability to answer */}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {currentQuestion?.options?.map((option, index) => (
                <Paper key={index} p="md" radius="md" withBorder>
                  <Group gap="sm">
                    <Badge>{String.fromCharCode(65 + index)}</Badge>
                    <Text>{option}</Text>
                  </Group>
                </Paper>
              ))}
            </SimpleGrid>

            <Center>
              <Badge size="lg" variant="light" color="blue">
                <Group gap="xs">
                  <IconEye size={16} />
                  <Text size="sm">Watching</Text>
                </Group>
              </Badge>
            </Center>
          </Stack>
        );

      case GAME_STATES.SHOW_RESULTS:
        const totalPlayerCount = answeredCount || connectedPlayers.length;
        return (
          <Stack gap="xl">
            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
            />

            {/* Answer distribution */}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {currentQuestion?.options?.map((option, index) => {
                const count = answerDistribution?.[index] || 0;
                const percentage = totalPlayerCount > 0
                  ? Math.round((count / totalPlayerCount) * 100)
                  : 0;
                const isCorrect = index === correctAnswerIndex;

                return (
                  <Paper
                    key={index}
                    p="md"
                    radius="md"
                    withBorder
                    style={{
                      borderColor: isCorrect ? 'var(--mantine-color-green-5)' : undefined,
                      borderWidth: isCorrect ? 2 : 1,
                      backgroundColor: isCorrect ? 'var(--mantine-color-green-0)' : undefined,
                    }}
                  >
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Group gap="sm">
                          <Badge color={isCorrect ? 'green' : 'gray'}>
                            {String.fromCharCode(65 + index)}
                          </Badge>
                          <Text size="sm">{option}</Text>
                          {isCorrect && <IconCheck size={16} color="var(--mantine-color-green-6)" />}
                        </Group>
                        <Badge variant="light">{count} ({percentage}%)</Badge>
                      </Group>
                      <Progress
                        value={percentage}
                        color={isCorrect ? 'green' : 'gray'}
                        size="sm"
                      />
                    </Stack>
                  </Paper>
                );
              })}
            </SimpleGrid>
          </Stack>
        );

      case GAME_STATES.LEADERBOARD:
        return (
          <Stack gap="xl">
            <Leaderboard
              players={leaderboard.length > 0 ? leaderboard : players}
            />
            <Center>
              <Text c="dimmed">Waiting for next question...</Text>
            </Center>
          </Stack>
        );

      case GAME_STATES.PAUSED:
        return (
          <Stack gap="xl">
            <Center>
              <Paper p="xl" radius="md" withBorder bg="yellow.0">
                <Stack align="center" gap="md">
                  <ThemeIcon size={60} radius="xl" color="yellow" variant="light">
                    <IconPlayerPause size={32} />
                  </ThemeIcon>
                  <Text size="xl" fw={600}>Game Paused</Text>
                  <Text c="dimmed">The host has paused the game. Please wait...</Text>
                </Stack>
              </Paper>
            </Center>

            <Leaderboard
              players={leaderboard.length > 0 ? leaderboard : players}
            />
          </Stack>
        );

      case GAME_STATES.PODIUM:
        return (
          <Stack gap="xl">
            <Podium
              players={podium.length > 0 ? podium : players}
            />

            <Center>
              <Button
                size="lg"
                variant="light"
                leftSection={<IconDoorExit size={20} />}
                onClick={handleLeave}
              >
                Leave Game
              </Button>
            </Center>
          </Stack>
        );

      default:
        return (
          <Center>
            <Text c="dimmed">Waiting for the game to continue...</Text>
          </Center>
        );
    }
  };

  if (!roomPin) {
    return null;
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Paper p="sm" radius="md" withBorder>
          <Group justify="space-between">
            <Group gap="md">
              <Badge size="lg" color="blue" variant="light" leftSection={<IconEye size={14} />}>
                Spectator: {nickname}
              </Badge>
              <Badge size="lg" variant="light">
                {connectedPlayers.length} players
              </Badge>
            </Group>
            {gameState !== GAME_STATES.WAITING_PLAYERS && (
              <Badge size="lg">
                {currentQuestionIndex + 1} / {totalQuestions}
              </Badge>
            )}
          </Group>
        </Paper>

        {/* Main content */}
        {renderContent()}
      </Stack>
    </Container>
  );
}
