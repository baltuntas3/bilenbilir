import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Stack,
  Group,
  Button,
  Paper,
  Text,
  Badge,
  Progress,
  Center,
  SimpleGrid,
  Alert,
  Box,
  Transition,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerSkipForward,
  IconChartBar,
  IconInfoCircle,
  IconTrophy,
  IconUsers,
  IconPlayerPause,
  IconEye,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useGame, GAME_STATES } from '../context/GameContext';
import { useGameAction } from '../hooks/useGameAction';
import Timer from '../components/game/Timer';
import QuestionDisplay from '../components/game/QuestionDisplay';
import Leaderboard from '../components/game/Leaderboard';
import Podium from '../components/game/Podium';
import ReactionOverlay from '../components/game/ReactionOverlay';
import AnswerDistribution from '../components/game/AnswerDistribution';
import GamePausedBanner from '../components/game/GamePausedBanner';
import { showToast } from '../utils/toast';

const OPTION_COLORS = ['var(--theme-primary)', 'var(--theme-secondary)', 'var(--theme-success)', 'var(--theme-warning)', 'var(--theme-accent)', 'var(--theme-primary)'];

export default function HostGame() {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
    totalPlayersInPhase,
    connectedPlayerCount,
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
    isLightning,
    spectators,
  } = useGame();

  useEffect(() => {
    if (!isHost || !roomPin) {
      navigate('/');
    }
  }, [isHost, roomPin, navigate]);

  const handleEndAnswering = useGameAction(endAnswering);
  const handleShowLeaderboard = useGameAction(showLeaderboard);
  const handleEndGame = useGameAction(closeRoom, { onSuccess: () => navigate('/my-quizzes') });
  const handlePauseGame = useGameAction(pauseGame);
  const handleResumeGame = useGameAction(resumeGame);

  const connectedPlayers = players.filter((p) => !p.disconnected);
  const noPlayers = connectedPlayers.length === 0 && players.length > 0;

  const handleStartAnswering = useGameAction(() => {
    if (noPlayers) {
      showToast.error(t('game.noPlayersToAdvance'));
      return Promise.reject(new Error(t('game.noPlayersToAdvance')));
    }
    return startAnswering();
  });

  const handleNextQuestion = useGameAction(() => {
    if (noPlayers) {
      showToast.error(t('game.noPlayersToAdvance'));
      return Promise.reject(new Error(t('game.noPlayersToAdvance')));
    }
    return nextQuestion();
  });

  const renderContent = () => {
    switch (gameState) {
      case GAME_STATES.QUESTION_INTRO:
        return (
          <Stack gap="xl" className="fade-slide-in">
            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
              isLightning={isLightning}
            />

            <Center>
              <Button
                size="xl"
                leftSection={<IconPlayerPlay size={24} />}
                onClick={handleStartAnswering}
                disabled={noPlayers}
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '0.7rem',
                  boxShadow: noPlayers ? 'none' : 'var(--theme-glow-primary)',
                }}
              >
                {t('game.startTimer')}
              </Button>
            </Center>
          </Stack>
        );

      case GAME_STATES.ANSWERING_PHASE:
        return (
          <Stack gap="lg" className="fade-slide-in">
            <Paper
              p="md"
              radius="md"
              style={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-border)',
              }}
            >
              <Group justify="space-between" align="center" wrap="nowrap">
                <Timer remaining={remainingTime} total={timeLimit} isLightning={isLightning} compact />
                <Stack gap={4} align="center">
                  <Group gap="xs">
                    <IconUsers size={18} style={{ color: 'var(--theme-primary)' }} />
                    <Text
                      fw={700}
                      style={{
                        fontFamily: 'var(--theme-font-display)',
                        fontSize: '0.6rem',
                        color: 'var(--theme-primary)',
                      }}
                    >
                      {answeredCount}/{totalPlayersInPhase || connectedPlayerCount || connectedPlayers.length || '-'}
                    </Text>
                  </Group>
                  <Progress
                    value={(answeredCount / Math.max(totalPlayersInPhase || connectedPlayerCount || connectedPlayers.length, 1)) * 100}
                    size="xs"
                    
                    style={{ width: 80 }}
                  />
                </Stack>
              </Group>
            </Paper>

            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
              showImage={false}
            />

            <SimpleGrid cols={2} spacing="sm">
              {currentQuestion?.options?.map((option, index) => {
                const color = OPTION_COLORS[index];

                return (
                  <Paper
                    key={index}
                    p="md"
                    radius="md"
                    style={{
                      background: 'var(--theme-surface)',
                      border: `1px solid ${color}`,
                    }}
                  >
                    <Group gap="sm">
                      <Box
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: `1px solid ${color}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          fw={700}
                          style={{
                            fontFamily: 'var(--theme-font-display)',
                            fontSize: '0.5rem',
                            color,
                          }}
                        >
                          {String.fromCharCode(65 + index)}
                        </Text>
                      </Box>
                      <Text size="sm" style={{ color: 'var(--theme-text)' }}>{option}</Text>
                    </Group>
                  </Paper>
                );
              })}
            </SimpleGrid>

            <Center>
              <Button
                variant="light"
                leftSection={<IconPlayerSkipForward size={20} />}
                onClick={handleEndAnswering}
                color="red"
                style={{ border: '1px solid var(--theme-secondary)' }}
              >
                {t('game.endEarly')}
              </Button>
            </Center>
          </Stack>
        );

      case GAME_STATES.SHOW_RESULTS:
        return (
          <Stack gap="xl" className="fade-slide-in">
            <Text
              ta="center"
              fw={700}
              className="theme-text-primary display-font display-font-sm"
            >
              {t('game.results')}
            </Text>

            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
              showImage={false}
            />

            <AnswerDistribution
              distribution={answerDistribution}
              correctAnswerIndex={correctAnswerIndex}
              totalPlayers={totalPlayersInPhase || connectedPlayers.length || answeredCount}
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

            <Center>
              <Button
                size="lg"
                leftSection={<IconChartBar size={20} />}
                onClick={handleShowLeaderboard}
                
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '0.6rem',
                  boxShadow: 'var(--theme-glow-primary)',
                }}
              >
                {t('game.showLeaderboard')}
              </Button>
            </Center>
          </Stack>
        );

      case GAME_STATES.LEADERBOARD:
        return (
          <Stack gap="xl" className="fade-slide-in">
            <Text
              ta="center"
              fw={700}
              className="theme-text-warning display-font display-font-sm"
            >
              {t('game.leaderboard')}
            </Text>

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
                style={{ border: '1px solid var(--theme-warning)' }}
              >
                {t('game.pause')}
              </Button>
              <Button
                size="lg"
                leftSection={
                  currentQuestionIndex + 1 >= totalQuestions
                    ? <IconTrophy size={20} />
                    : <IconPlayerSkipForward size={20} />
                }
                onClick={handleNextQuestion}
                disabled={noPlayers}
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '0.6rem',
                  boxShadow: noPlayers ? 'none' : 'var(--theme-glow-primary)',
                }}
              >
                {currentQuestionIndex + 1 >= totalQuestions ? t('game.finalResults') : t('game.nextQuestion')}
              </Button>
            </Group>
          </Stack>
        );

      case GAME_STATES.PAUSED:
        return (
          <Stack gap="xl">
            <GamePausedBanner message={t('game.gamePausedHost')} />

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
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '0.6rem',
                  boxShadow: 'var(--theme-glow-success)',
                }}
              >
                {t('game.resume')}
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
                color="red"
                style={{
                  border: '1px solid var(--theme-secondary)',
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '0.6rem',
                }}
              >
                {t('game.endGame')}
              </Button>
            </Center>
          </Stack>
        );

      default:
        return (
          <Center>
            <Text style={{ color: 'var(--theme-text-dim)' }}>Unknown state: {gameState}</Text>
          </Center>
        );
    }
  };

  return (
    <>
      <ReactionOverlay />
      <Container size="md" py="md">
        <Stack gap="md">
          {/* Header */}
          <Paper
            p="sm"
            radius="md"
            style={{
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-border)',
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Group gap="sm" wrap="nowrap">
                <Badge
                  size="lg"
                  
                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.45rem',
                  }}
                >
                  PIN: {roomPin}
                </Badge>
                <Badge
                  size="md"
                  variant="light"

                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.4rem',
                  }}
                >
                  {t('game.onlineCount', { count: connectedPlayers.length })}
                </Badge>
                {spectators.length > 0 && (
                  <Badge
                    size="md"
                    variant="light"
                    color="grape"
                    leftSection={<IconEye size={14} />}
                    style={{
                      fontFamily: 'var(--theme-font-display)',
                      fontSize: '0.4rem',
                    }}
                  >
                    {t('game.spectatorCount', { count: spectators.length })}
                  </Badge>
                )}
              </Group>
              {totalQuestions > 0 && (
                <Badge
                  size="md"
                  color="violet"
                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.4rem',
                  }}
                >
                  {t('game.questionOf', { current: currentQuestionIndex + 1, total: totalQuestions })}
                </Badge>
              )}
            </Group>
          </Paper>

          <Transition mounted={noPlayers} transition="slide-down" duration={300}>
            {(styles) => (
              <Alert
                style={{
                  ...styles,
                  background: 'rgba(255, 100, 100, 0.08)',
                  border: '1px solid var(--theme-secondary)',
                }}
                icon={<IconAlertTriangle size={20} />}
                color="red"
                variant="light"
                title={t('game.allPlayersDisconnected')}
              />
            )}
          </Transition>

          {renderContent()}
        </Stack>
      </Container>
    </>
  );
}
