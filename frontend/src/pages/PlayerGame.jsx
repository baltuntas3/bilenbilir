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
  SimpleGrid,
  Progress,
  ThemeIcon,
} from '@mantine/core';
import { IconDoorExit, IconCheck, IconX } from '@tabler/icons-react';
import { useGame, GAME_STATES } from '../context/GameContext';
import Timer from '../components/game/Timer';
import QuestionDisplay from '../components/game/QuestionDisplay';
import AnswerOptions from '../components/game/AnswerOptions';
import AnswerFeedback from '../components/game/AnswerFeedback';
import Leaderboard from '../components/game/Leaderboard';
import Podium from '../components/game/Podium';
import PlayerWaiting from '../components/game/PlayerWaiting';
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
    submitAnswer,
    leaveRoom,
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

            {hasAnswered ? (
              <AnswerFeedback
                isCorrect={lastAnswer?.isCorrect}
                score={lastAnswer?.score || 0}
                streakBonus={lastAnswer?.streakBonus || 0}
                streak={streak}
                totalScore={score}
              />
            ) : (
              <AnswerOptions
                options={currentQuestion?.options || []}
                onSelect={handleAnswerSelect}
                disabled={submitting}
                selectedIndex={selectedAnswer}
              />
            )}
          </Stack>
        );

      case GAME_STATES.SHOW_RESULTS:
        const totalPlayerCount = answeredCount || players.length;
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
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {currentQuestion?.options?.map((option, index) => {
                const count = answerDistribution?.[index] || 0;
                const percentage = totalPlayerCount > 0
                  ? Math.round((count / totalPlayerCount) * 100)
                  : 0;
                const isCorrect = index === correctAnswerIndex;
                const wasSelected = selectedAnswer === index;

                return (
                  <Paper
                    key={index}
                    p="md"
                    radius="md"
                    withBorder
                    style={{
                      borderColor: isCorrect
                        ? 'var(--mantine-color-green-5)'
                        : wasSelected
                          ? 'var(--mantine-color-red-5)'
                          : undefined,
                      borderWidth: isCorrect || wasSelected ? 2 : 1,
                      backgroundColor: isCorrect ? 'var(--mantine-color-green-0)' : undefined,
                    }}
                  >
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Group gap="sm">
                          <Badge color={isCorrect ? 'green' : wasSelected ? 'red' : 'gray'}>
                            {String.fromCharCode(65 + index)}
                          </Badge>
                          <Text size="sm">{option}</Text>
                          {isCorrect && <IconCheck size={16} color="var(--mantine-color-green-6)" />}
                          {wasSelected && !isCorrect && <IconX size={16} color="var(--mantine-color-red-6)" />}
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
            />

            <Center>
              <Text c="dimmed">Waiting for next question...</Text>
            </Center>
          </Stack>
        );

      case GAME_STATES.PODIUM:
        return (
          <Stack gap="xl">
            <Podium
              players={podium.length > 0 ? podium : players}
              currentPlayerId={playerId}
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
    <Container size="sm" py="xl">
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
  );
}
