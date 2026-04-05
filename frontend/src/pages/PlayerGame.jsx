import { useEffect, useState, useCallback } from 'react';
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
  Box,
  Alert,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconDoorExit, IconCheck, IconX, IconInfoCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
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
import GamePausedBanner from '../components/game/GamePausedBanner';
import { showToast } from '../utils/toast';
import { fireCorrectAnswer, fireStreakConfetti } from '../utils/confetti';

export default function PlayerGame() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 48em)');
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
    isLightning,
    isReconnecting,
  } = useGame();

  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showScorePop, setShowScorePop] = useState(false);

  useEffect(() => {
    setSelectedAnswer(null);
  }, [currentQuestionIndex]);

  useEffect(() => {
    if (isReconnecting) return;
    if (!roomPin || isHost) {
      navigate('/join');
    }
  }, [roomPin, isHost, isReconnecting, navigate]);

  // Confetti on correct answer
  useEffect(() => {
    if (lastAnswer?.isCorrect && gameState === GAME_STATES.SHOW_RESULTS) {
      fireCorrectAnswer();
      if (streak > 2) {
        setTimeout(() => fireStreakConfetti(streak), 300);
      }
    }
  }, [lastAnswer, gameState, streak]);

  // Memoize so AnswerOptions doesn't get a new onSelect prop on every parent
  // re-render (which happens frequently during ANSWERING_PHASE as the players
  // array churns on disconnect/reconnect events).
  const handleAnswerSelect = useCallback(async (answerIndex) => {
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
  }, [hasAnswered, submitting, submitAnswer]);

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  const renderContent = () => {
    switch (gameState) {
      case GAME_STATES.WAITING_PLAYERS:
        return <PlayerWaiting nickname={nickname} playerCount={players.length} />;

      case GAME_STATES.QUESTION_INTRO:
        return (
          <Stack gap="lg" className="fade-slide-in">
            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
              isLightning={isLightning}
            />
            <Center>
              <Paper
                p="xl"
                radius="md"
                style={{
                  background: 'var(--theme-surface)',
                  border: '1px solid var(--theme-primary)',
                  boxShadow: 'var(--theme-glow-primary)',
                }}
              >
                <Text
                  ta="center"
                  className="anim-pulse"
                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.6rem',
                    color: 'var(--theme-primary)',
                    textShadow: 'var(--theme-glow-primary)',
                  }}
                >
                  {t('game.getReady')}
                </Text>
              </Paper>
            </Center>
          </Stack>
        );

      case GAME_STATES.ANSWERING_PHASE:
        return (
          <Stack gap="md" className="fade-slide-in">
            {/* Timer + Score bar */}
            <Paper
              p="sm"
              radius="md"
              style={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-border)',
              }}
            >
              <Group justify="space-between" align="center" wrap="nowrap">
                <Box style={{ flex: 1, maxWidth: isMobile ? '50%' : 'auto' }}>
                  <Timer
                    remaining={remainingTime}
                    total={timeLimit}
                    isLightning={isLightning}
                    compact={isMobile}
                  />
                </Box>
                <Stack gap={2} align="center">
                  <Text
                    fw={700}
                    className={showScorePop ? 'score-pop' : ''}
                    style={{
                      fontFamily: 'var(--theme-font-display)',
                      fontSize: isMobile ? '0.7rem' : '1rem',
                      color: 'var(--theme-warning)',
                      textShadow: 'var(--theme-glow-warning)',
                    }}
                  >
                    {score.toLocaleString()}
                  </Text>
                  {streak > 0 && (
                    <Badge
                      size="xs"
                      color="orange"
                      variant="filled"
                      style={{
                        fontFamily: 'var(--theme-font-display)',
                        fontSize: '0.4rem',
                      }}
                    >
                      {t('game.streakCount', { count: streak })}
                    </Badge>
                  )}
                </Stack>
              </Group>
            </Paper>

            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
              isLightning={isLightning}
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
          <Stack gap="lg" className="fade-slide-in">
            {lastAnswer && (
              <Paper
                p="lg"
                radius="md"
                className={lastAnswer.isCorrect ? 'score-pop' : 'shake'}
                style={{
                  background: lastAnswer.isCorrect
                    ? 'rgba(57, 255, 20, 0.08)'
                    : 'rgba(255, 45, 149, 0.08)',
                  border: `2px solid ${lastAnswer.isCorrect ? 'var(--theme-success)' : 'var(--theme-secondary)'}`,
                  boxShadow: lastAnswer.isCorrect
                    ? 'var(--theme-glow-success)'
                    : 'var(--theme-glow-secondary)',
                }}
              >
                <Group justify="center" gap="md">
                  <Box
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: `2px solid ${lastAnswer.isCorrect ? 'var(--theme-success)' : 'var(--theme-secondary)'}`,
                    }}
                  >
                    {lastAnswer.isCorrect
                      ? <IconCheck size={24} style={{ color: 'var(--theme-success)' }} />
                      : <IconX size={24} style={{ color: 'var(--theme-secondary)' }} />}
                  </Box>
                  <Stack gap={0}>
                    <Text
                      fw={700}
                      style={{
                        fontFamily: 'var(--theme-font-display)',
                        fontSize: '0.7rem',
                        color: lastAnswer.isCorrect ? 'var(--theme-success)' : 'var(--theme-secondary)',
                        textShadow: lastAnswer.isCorrect
                          ? 'var(--theme-glow-success)'
                          : 'var(--theme-glow-secondary)',
                      }}
                    >
                      {lastAnswer.isCorrect ? t('game.correct') : t('game.wrong')}
                    </Text>
                    <Text
                      fw={700}
                      style={{
                        fontFamily: 'var(--theme-font-display)',
                        fontSize: '0.6rem',
                        color: lastAnswer.isCorrect ? 'var(--theme-warning)' : 'var(--theme-text-dim)',
                      }}
                    >
                      +{lastAnswer.isCorrect ? lastAnswer.score : 0} {t('game.pts')}
                    </Text>
                  </Stack>
                </Group>
              </Paper>
            )}

            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
              isLightning={isLightning}
            />

            <AnswerDistribution
              distribution={answerDistribution}
              correctAnswerIndex={correctAnswerIndex}
              totalPlayers={answeredCount || players.length}
              options={currentQuestion?.options}
            />

            {explanation && (
              <Alert
                icon={<IconInfoCircle size={16} />}
                variant="light"
                title={t('quiz.explanation')}
                style={{
                  background: 'rgba(0, 240, 255, 0.05)',
                  border: '1px solid var(--theme-primary)',
                }}
              >
                {explanation}
              </Alert>
            )}
          </Stack>
        );

      case GAME_STATES.LEADERBOARD:
        return (
          <Stack gap="lg" className="fade-slide-in">
            <Center>
              <Paper
                p="md"
                radius="md"
                style={{
                  background: 'var(--theme-surface)',
                  border: '1px solid var(--theme-warning)',
                  boxShadow: 'var(--theme-glow-warning)',
                }}
              >
                <Stack gap={2} align="center">
                  <Text size="xs" style={{ color: 'var(--theme-text-dim)' }}>{t('game.yourScore')}</Text>
                  <Text
                    fw={700}
                    style={{
                      fontFamily: 'var(--theme-font-display)',
                      fontSize: '1rem',
                      color: 'var(--theme-warning)',
                      textShadow: 'var(--theme-glow-warning)',
                    }}
                  >
                    {score.toLocaleString()}
                  </Text>
                </Stack>
              </Paper>
            </Center>

            <Leaderboard
              players={leaderboard.length > 0 ? leaderboard : players}
              currentPlayerId={playerId}
              teamMode={teamMode}
              teamLeaderboard={teamLeaderboard}
            />

            <Center>
              <Text
                className="anim-pulse"
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '0.5rem',
                  color: 'var(--theme-text-dim)',
                }}
              >
                {t('game.nextLoading')}
              </Text>
            </Center>
          </Stack>
        );

      case GAME_STATES.PAUSED:
        return (
          <Stack gap="xl">
            <GamePausedBanner />

            <Center>
              <Paper
                p="md"
                radius="md"
                style={{
                  background: 'var(--theme-surface)',
                  border: '1px solid var(--theme-warning)',
                  boxShadow: 'var(--theme-glow-warning)',
                }}
              >
                <Stack gap={2} align="center">
                  <Text size="xs" style={{ color: 'var(--theme-text-dim)' }}>{t('game.yourScore')}</Text>
                  <Text
                    fw={700}
                    style={{
                      fontFamily: 'var(--theme-font-display)',
                      fontSize: '1rem',
                      color: 'var(--theme-warning)',
                      textShadow: 'var(--theme-glow-warning)',
                    }}
                  >
                    {score.toLocaleString()}
                  </Text>
                </Stack>
              </Paper>
            </Center>
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
                color="red"
                leftSection={<IconDoorExit size={20} />}
                onClick={handleLeave}
                style={{
                  border: '1px solid var(--theme-secondary)',
                  boxShadow: 'var(--theme-glow-secondary)',
                }}
              >
                {t('game.leaveGame')}
              </Button>
            </Center>
          </Stack>
        );

      case GAME_STATES.IDLE:
      default:
        return <PlayerWaiting nickname={nickname} playerCount={players.length} />;
    }
  };

  if (!roomPin) {
    return null;
  }

  return (
    <>
      <ReactionOverlay />
      <Container size="sm" py="md" pb={80}>
        <Stack gap="md">
          {/* Header bar - only show during active game phases with valid question data */}
          {gameState !== GAME_STATES.WAITING_PLAYERS && gameState !== GAME_STATES.IDLE && totalQuestions > 0 && (
            <Paper
              p="xs"
              radius="md"
              style={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-border)',
              }}
            >
              <Group justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap" style={{ overflow: 'hidden' }}>
                  <Badge
                    size="md"
                    variant="light"
                    
                    style={{
                      fontFamily: 'var(--theme-font-display)',
                      fontSize: '0.45rem',
                    }}
                  >
                    {nickname}
                  </Badge>
                  <Badge
                    size="md"
                    variant="light"
                    color="yellow"
                    style={{
                      fontFamily: 'var(--theme-font-display)',
                      fontSize: '0.45rem',
                    }}
                  >
                    {score.toLocaleString()}
                  </Badge>
                </Group>
                <Badge
                  size="md"
                  color="violet"
                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.45rem',
                  }}
                >
                  {currentQuestionIndex + 1}/{totalQuestions}
                </Badge>
              </Group>
            </Paper>
          )}

          {renderContent()}
        </Stack>
      </Container>
      <ReactionPicker />
    </>
  );
}
