import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  Alert,
  Box,
  Transition,
} from '@mantine/core';
import { IconDoorExit, IconEye, IconUsers, IconInfoCircle, IconBulb } from '@tabler/icons-react';
import { useGame, GAME_STATES } from '../context/GameContext';
import Timer from '../components/game/Timer';
import QuestionDisplay from '../components/game/QuestionDisplay';
import Leaderboard from '../components/game/Leaderboard';
import Podium from '../components/game/Podium';
import ReactionOverlay from '../components/game/ReactionOverlay';
import ReactionPicker from '../components/game/ReactionPicker';
import AnswerDistribution from '../components/game/AnswerDistribution';
import GamePausedBanner from '../components/game/GamePausedBanner';

const OPTION_COLORS = ['var(--theme-primary)', 'var(--theme-secondary)', 'var(--theme-success)', 'var(--theme-warning)', 'var(--theme-accent)', 'var(--theme-primary)'];

export default function SpectatorGame() {
  const { t } = useTranslation();
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
    totalPlayersInPhase,
    connectedPlayerCount,
    explanation,
    leaveSpectator,
    teamMode,
    teamLeaderboard,
    teamPodium,
    isLightning,
    isReconnecting,
  } = useGame();

  useEffect(() => {
    if (isReconnecting) return;
    if (!roomPin || !isSpectator) {
      navigate('/join');
    }
  }, [roomPin, isSpectator, isReconnecting, navigate]);

  const handleLeave = () => {
    leaveSpectator();
    navigate('/');
  };

  const connectedPlayers = players.filter((p) => !p.disconnected);

  // Fun facts for waiting screen
  const funFacts = useMemo(() => t('game.waitingFunFacts', { returnObjects: true }), [t]);
  const shuffledFacts = useMemo(() => {
    if (!Array.isArray(funFacts)) return [];
    return [...funFacts].sort(() => Math.random() - 0.5);
  }, [funFacts]);
  const [factIndex, setFactIndex] = useState(0);
  const [factVisible, setFactVisible] = useState(true);

  const rotateFact = useCallback(() => {
    setFactVisible(false);
    setTimeout(() => {
      setFactIndex((prev) => (prev + 1) % shuffledFacts.length);
      setFactVisible(true);
    }, 300);
  }, [shuffledFacts.length]);

  useEffect(() => {
    if (shuffledFacts.length === 0 || gameState !== GAME_STATES.WAITING_PLAYERS) return;
    const interval = setInterval(rotateFact, 5000);
    return () => clearInterval(interval);
  }, [rotateFact, shuffledFacts.length, gameState]);

  const renderContent = () => {
    switch (gameState) {
      case GAME_STATES.WAITING_PLAYERS:
        return (
          <Center style={{ minHeight: 300 }} className="crt-on">
            <Paper
              p="xl"
              radius="md"
              style={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-primary)',
                boxShadow: 'var(--theme-glow-primary)',
              }}
            >
              <Stack align="center" gap="md">
                <Box
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid var(--theme-primary)',
                    boxShadow: 'var(--theme-glow-primary)',
                  }}
                >
                  <IconEye size={32} style={{ color: 'var(--theme-primary)' }} />
                </Box>
                <Text
                  fw={700}
                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.6rem',
                    color: 'var(--theme-primary)',
                    textShadow: 'var(--theme-glow-primary)',
                  }}
                >
                  {t('game.spectatorMode')}
                </Text>

                {/* Fun fact */}
                <Paper
                  p="sm"
                  radius="md"
                  style={{
                    width: '100%',
                    background: 'rgba(0, 240, 255, 0.04)',
                    border: '1px solid var(--theme-primary)',
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Transition mounted={factVisible} transition="fade" duration={300}>
                    {(styles) => (
                      <Group gap="xs" wrap="nowrap" justify="center" style={styles}>
                        <IconBulb size={16} style={{ color: 'var(--theme-warning)', flexShrink: 0 }} />
                        <Text size="sm" ta="center" fw={500} style={{ color: 'var(--theme-text)' }}>
                          {shuffledFacts.length > 0 ? shuffledFacts[factIndex] : t('game.hostWillStart')}
                        </Text>
                      </Group>
                    )}
                  </Transition>
                </Paper>

                <Badge
                  size="lg"
                  variant="light"
                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.45rem',
                  }}
                >
                  {t('game.onlineCount', { count: connectedPlayers.length })}
                </Badge>
              </Stack>
            </Paper>
          </Center>
        );

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
              isLightning={isLightning}
            />

            <SimpleGrid cols={{ base: 2, sm: 2 }} spacing="sm">
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
                      <Text size="sm" style={{ color: 'var(--theme-text)', flex: 1 }}>{option}</Text>
                    </Group>
                  </Paper>
                );
              })}
            </SimpleGrid>

            <Center>
              <Badge
                size="lg"
                variant="light"
                
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '0.4rem',
                }}
              >
                <Group gap="xs">
                  <IconEye size={14} />
                  <Text size="xs">{t('game.watching')}</Text>
                </Group>
              </Badge>
            </Center>
          </Stack>
        );

      case GAME_STATES.SHOW_RESULTS:
        return (
          <Stack gap="xl" className="fade-slide-in">
            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
              isLightning={isLightning}
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
          </Stack>
        );

      case GAME_STATES.LEADERBOARD:
        return (
          <Stack gap="xl" className="fade-slide-in">
            <Leaderboard
              players={leaderboard.length > 0 ? leaderboard : players}
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
            <Leaderboard
              players={leaderboard.length > 0 ? leaderboard : players}
              teamMode={teamMode}
              teamLeaderboard={teamLeaderboard}
            />
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
                leftSection={<IconDoorExit size={20} />}
                onClick={handleLeave}
                color="red"
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
        return (
          <Center style={{ minHeight: 300 }}>
            <Stack align="center" gap="md">
              <IconEye size={48} style={{ color: 'var(--theme-primary)', opacity: 0.5 }} />
              <Text
                className="anim-pulse"
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '0.5rem',
                  color: 'var(--theme-text-dim)',
                }}
              >
                {t('game.spectatorMode')}
              </Text>
            </Stack>
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
      <Container size="md" py="md" pb={80}>
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
                  size="md"
                  color="violet"
                  variant="light"
                  leftSection={<IconEye size={12} />}
                  style={{
                    fontFamily: 'var(--theme-font-display)',
                    fontSize: '0.4rem',
                  }}
                >
                  {nickname}
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
              </Group>
              {gameState !== GAME_STATES.WAITING_PLAYERS && gameState !== GAME_STATES.IDLE && totalQuestions > 0 && (
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

          {renderContent()}
        </Stack>
      </Container>
      <ReactionPicker />
    </>
  );
}
