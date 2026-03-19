import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Stack,
  Group,
  Button,
  Paper,
  Text,
  Title,
  Badge,
  Progress,
  Center,
  SimpleGrid,
  Alert,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerSkipForward,
  IconChartBar,
  IconInfoCircle,
  IconTrophy,
  IconUsers,
  IconPlayerPause,
} from '@tabler/icons-react';
import { useGame, GAME_STATES } from '../context/GameContext';
import Timer from '../components/game/Timer';
import QuestionDisplay from '../components/game/QuestionDisplay';
import Leaderboard from '../components/game/Leaderboard';
import Podium from '../components/game/Podium';
import ReactionOverlay from '../components/game/ReactionOverlay';
import AnswerDistribution from '../components/game/AnswerDistribution';
import { showToast } from '../utils/toast';

export default function HostGame() {
  const navigate = useNavigate();
  const {
    roomPin,
    isHost,
    gameState,
    players,
    currentQuestion,
    currentQuestionIndex,
    totalQuestions,
    timeLimit,
    remainingTime,
    leaderboard,
    podium,
    answerDistribution,
    correctAnswerIndex,
    answeredCount,
    explanation,
    startAnswering,
    endAnswering,
    showLeaderboard,
    nextQuestion,
    closeRoom,
    pauseGame,
    resumeGame,
    teamMode,
    teamLeaderboard,
    teamPodium,
  } = useGame();

  // Redirect if not host
  useEffect(() => {
    if (!isHost || !roomPin) {
      navigate('/');
    }
  }, [isHost, roomPin, navigate]);

  const handleStartAnswering = async () => {
    try {
      await startAnswering();
    } catch (error) {
      showToast.error(error.message);
    }
  };

  const handleEndAnswering = async () => {
    try {
      await endAnswering();
    } catch (error) {
      showToast.error(error.message);
    }
  };

  const handleShowLeaderboard = async () => {
    try {
      await showLeaderboard();
    } catch (error) {
      showToast.error(error.message);
    }
  };

  const handleNextQuestion = async () => {
    try {
      await nextQuestion();
    } catch (error) {
      showToast.error(error.message);
    }
  };

  const handleEndGame = async () => {
    try {
      await closeRoom();
      navigate('/my-quizzes');
    } catch (error) {
      showToast.error(error.message);
    }
  };

  const handlePauseGame = async () => {
    try {
      await pauseGame();
    } catch (error) {
      showToast.error(error.message);
    }
  };

  const handleResumeGame = async () => {
    try {
      await resumeGame();
    } catch (error) {
      showToast.error(error.message);
    }
  };

  const connectedPlayers = players.filter((p) => !p.disconnectedAt);


  // Render based on game state
  const renderContent = () => {
    switch (gameState) {
      case GAME_STATES.QUESTION_INTRO:
        return (
          <Stack gap="xl">
            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
            />

            <Center>
              <Button
                size="xl"
                leftSection={<IconPlayerPlay size={24} />}
                onClick={handleStartAnswering}
              >
                Start Timer
              </Button>
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
                    value={(answeredCount / connectedPlayers.length) * 100}
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
              showImage={false}
            />

            {/* Show options for host reference */}
            <SimpleGrid cols={2} spacing="md">
              {currentQuestion?.options?.map((option, index) => (
                <Paper
                  key={index}
                  p="md"
                  radius="md"
                  withBorder
                  bg={index === correctAnswerIndex ? 'green.1' : undefined}
                >
                  <Group gap="sm">
                    <Badge>{String.fromCharCode(65 + index)}</Badge>
                    <Text>{option}</Text>
                  </Group>
                </Paper>
              ))}
            </SimpleGrid>

            <Center>
              <Button
                variant="light"
                leftSection={<IconPlayerSkipForward size={20} />}
                onClick={handleEndAnswering}
              >
                End Early
              </Button>
            </Center>
          </Stack>
        );

      case GAME_STATES.SHOW_RESULTS:
        return (
          <Stack gap="xl">
            <Title order={2} ta="center">Results</Title>

            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
              showImage={false}
            />

            {/* Answer distribution */}
            <AnswerDistribution
              distribution={answerDistribution}
              correctAnswerIndex={correctAnswerIndex}
              totalPlayers={players.length || answeredCount}
              options={currentQuestion?.options}
            />

            {explanation && (
              <Alert
                icon={<IconInfoCircle size={16} />}
                color="blue"
                variant="light"
                title="Explanation"
              >
                {explanation}
              </Alert>
            )}

            <Center>
              <Button
                size="lg"
                leftSection={<IconChartBar size={20} />}
                onClick={handleShowLeaderboard}
              >
                Show Leaderboard
              </Button>
            </Center>
          </Stack>
        );

      case GAME_STATES.LEADERBOARD:
        return (
          <Stack gap="xl">
            <Title order={2} ta="center">Leaderboard</Title>

            <Leaderboard
              players={leaderboard.length > 0 ? leaderboard : players}
              teamMode={teamMode}
              teamLeaderboard={teamLeaderboard}
            />

            <Group justify="center" gap="md">
              <Button
                variant="light"
                color="yellow"
                leftSection={<IconPlayerPause size={20} />}
                onClick={handlePauseGame}
              >
                Pause Game
              </Button>
              <Button
                size="lg"
                leftSection={
                  currentQuestionIndex + 1 >= totalQuestions
                    ? <IconTrophy size={20} />
                    : <IconPlayerSkipForward size={20} />
                }
                onClick={handleNextQuestion}
              >
                {currentQuestionIndex + 1 >= totalQuestions ? 'Show Final Results' : 'Next Question'}
              </Button>
            </Group>
          </Stack>
        );

      case GAME_STATES.PAUSED:
        return (
          <Stack gap="xl">
            <Center>
              <Paper p="xl" radius="md" withBorder bg="yellow.0">
                <Stack align="center" gap="md">
                  <IconPlayerPause size={48} color="var(--mantine-color-yellow-6)" />
                  <Title order={2}>Game Paused</Title>
                  <Text c="dimmed">The game is currently paused. Players are waiting.</Text>
                </Stack>
              </Paper>
            </Center>

            <Leaderboard
              players={leaderboard.length > 0 ? leaderboard : players}
              teamMode={teamMode}
              teamLeaderboard={teamLeaderboard}
            />

            <Center>
              <Button
                size="lg"
                color="green"
                leftSection={<IconPlayerPlay size={20} />}
                onClick={handleResumeGame}
              >
                Resume Game
              </Button>
            </Center>
          </Stack>
        );

      case GAME_STATES.PODIUM:
        return (
          <Stack gap="xl">
            <Podium
              players={podium.length > 0 ? podium : players}
              teamMode={teamMode}
              teamPodium={teamPodium}
            />

            <Center>
              <Button
                size="lg"
                variant="light"
                onClick={handleEndGame}
              >
                End Game
              </Button>
            </Center>
          </Stack>
        );

      default:
        return (
          <Center>
            <Text c="dimmed">Unknown game state: {gameState}</Text>
          </Center>
        );
    }
  };

  return (
    <>
      <ReactionOverlay />
      <Container size="md" py="xl">
        <Stack gap="xl">
          {/* Header */}
          <Paper p="sm" radius="md" withBorder>
            <Group justify="space-between">
              <Group gap="md">
                <Badge size="lg">PIN: {roomPin}</Badge>
                <Badge size="lg" variant="light" color="blue">
                  {connectedPlayers.length} players
                </Badge>
              </Group>
              <Badge size="lg" variant="light">
                Question {currentQuestionIndex + 1} / {totalQuestions}
              </Badge>
            </Group>
          </Paper>

          {/* Main content */}
          {renderContent()}
        </Stack>
      </Container>
    </>
  );
}
