import { useEffect, useState } from 'react';
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
  ThemeIcon,
} from '@mantine/core';
import { IconDoorExit, IconCheck, IconX, IconPlayerPause } from '@tabler/icons-react';
import { useGame, GAME_STATES } from '../context/GameContext';
import Timer from '../components/game/Timer';
import QuestionDisplay from '../components/game/QuestionDisplay';
import AnswerOptions from '../components/game/AnswerOptions';
import AnswerFeedback from '../components/game/AnswerFeedback';
import Leaderboard from '../components/game/Leaderboard';
import Podium from '../components/game/Podium';
import PlayerWaiting from '../components/game/PlayerWaiting';
import ReactionOverlay from '../components/game/ReactionOverlay';
import ReactionPicker from '../components/game/ReactionPicker';
import PowerUpBar from '../components/game/PowerUpBar';
import AnswerDistribution from '../components/game/AnswerDistribution';
import { showToast } from '../utils/toast';

export default function PlayerGame() {
  const navigate = useNavigate();
  const {
    roomPin,
    isHost,
    gameState,
    players,
    playerId,
    nickname,
    currentQuestion,
    currentQuestionIndex,
    totalQuestions,
    timeLimit,
    remainingTime,
    score,
    streak,
    lastAnswer,
    leaderboard,
    podium,
    correctAnswerIndex,
    answerDistribution,
    answeredCount,
    hasAnswered,
    explanation,
    submitAnswer,
    leaveRoom,
    teamMode,
    teamLeaderboard,
    teamPodium,
    eliminatedOptions,
  } = useGame();

  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset selected answer on new question
  useEffect(() => {
    setSelectedAnswer(null);
  }, [currentQuestionIndex]);


  // Redirect if not in a game
  useEffect(() => {
    if (!roomPin || isHost) {
      navigate('/join');
    }
  }, [roomPin, isHost, navigate]);

  const handleAnswerSelect = async (answerIndex) => {
    if (hasAnswered || submitting) return;

    setSelectedAnswer(answerIndex);
    setSubmitting(true);

    try {
      await submitAnswer(answerIndex);
    } catch (error) {
      showToast.error(error.message);
      setSelectedAnswer(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  // Render based on game state
  const renderContent = () => {
    switch (gameState) {
      case GAME_STATES.WAITING_PLAYERS:
        return <PlayerWaiting nickname={nickname} playerCount={players.length} />;

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
                  <Text size="xs" c="dimmed">Your Score</Text>
                  <Text size="xl" fw={700}>{score.toLocaleString()}</Text>
                  {streak > 0 && (
                    <Badge color="orange" size="sm">
                      {streak} streak
                    </Badge>
                  )}
                </Stack>
              </Paper>
            </Group>

            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
            />

            {!hasAnswered && <PowerUpBar />}

            {hasAnswered ? (
              <AnswerFeedback
                isCorrect={lastAnswer?.isCorrect}
                score={lastAnswer?.score || 0}
                streakBonus={lastAnswer?.streakBonus || 0}
                streak={streak}
                totalScore={score}
                explanation={explanation}
              />
            ) : (
              <AnswerOptions
                options={currentQuestion?.options || []}
                onSelect={handleAnswerSelect}
                disabled={submitting}
                selectedIndex={selectedAnswer}
                eliminatedOptions={eliminatedOptions}
              />
            )}
          </Stack>
        );

      case GAME_STATES.SHOW_RESULTS:
        return (
          <Stack gap="xl">
            {/* Your result */}
            {lastAnswer && (
              <Paper p="lg" radius="md" withBorder bg={lastAnswer.isCorrect ? 'green.0' : 'red.0'}>
                <Group justify="center" gap="md">
                  <ThemeIcon
                    size={40}
                    radius="xl"
                    color={lastAnswer.isCorrect ? 'green' : 'red'}
                    variant="filled"
                  >
                    {lastAnswer.isCorrect ? <IconCheck size={24} /> : <IconX size={24} />}
                  </ThemeIcon>
                  <Stack gap={0}>
                    <Text size="lg" fw={600}>
                      {lastAnswer.isCorrect ? 'Correct!' : 'Wrong!'}
                    </Text>
                    <Text size="xl" fw={700} c={lastAnswer.isCorrect ? 'green' : 'dimmed'}>
                      +{lastAnswer.isCorrect ? lastAnswer.score + (lastAnswer.streakBonus || 0) : 0} pts
                    </Text>
                  </Stack>
                </Group>
              </Paper>
            )}

            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
            />

            {/* Answer distribution */}
            <AnswerDistribution
              distribution={answerDistribution}
              correctAnswerIndex={correctAnswerIndex}
              totalPlayers={players.length || answeredCount}
              options={currentQuestion?.options}
            />
          </Stack>
        );

      case GAME_STATES.LEADERBOARD:
        return (
          <Stack gap="xl">
            <Group justify="center" gap="md">
              <Paper p="md" radius="md" withBorder>
                <Stack gap="xs" align="center">
                  <Text size="xs" c="dimmed">Your Score</Text>
                  <Text size="xl" fw={700}>{score.toLocaleString()}</Text>
                </Stack>
              </Paper>
            </Group>

            <Leaderboard
              players={leaderboard.length > 0 ? leaderboard : players}
              currentPlayerId={playerId}
              teamMode={teamMode}
              teamLeaderboard={teamLeaderboard}
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

            <Group justify="center" gap="md">
              <Paper p="md" radius="md" withBorder>
                <Stack gap="xs" align="center">
                  <Text size="xs" c="dimmed">Your Score</Text>
                  <Text size="xl" fw={700}>{score.toLocaleString()}</Text>
                </Stack>
              </Paper>
            </Group>
          </Stack>
        );

      case GAME_STATES.PODIUM:
        return (
          <Stack gap="xl">
            <Podium
              players={podium.length > 0 ? podium : players}
              currentPlayerId={playerId}
              teamMode={teamMode}
              teamPodium={teamPodium}
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
    <>
      <ReactionOverlay />
      <Container size="sm" py="xl" pb={80}>
        <Stack gap="xl">
          {/* Header */}
          {gameState !== GAME_STATES.WAITING_PLAYERS && (
            <Paper p="sm" radius="md" withBorder>
              <Group justify="space-between">
                <Group gap="xs">
                  <Badge size="lg" variant="light">
                    {nickname}
                  </Badge>
                  <Badge size="lg" variant="light" color="blue">
                    {score.toLocaleString()} pts
                  </Badge>
                </Group>
                <Badge size="lg">
                  {currentQuestionIndex + 1} / {totalQuestions}
                </Badge>
              </Group>
            </Paper>
          )}

          {/* Main content */}
          {renderContent()}
        </Stack>
      </Container>
      <ReactionPicker />
    </>
  );
}
