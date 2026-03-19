import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Container, Title, Text, Paper, Group, Stack, Table, Badge,
  Progress, Center, Loader, Button, ActionIcon, Select, Stepper
} from '@mantine/core';
import {
  IconPlayerPlay, IconPlayerPause, IconPlayerSkipForward,
  IconPlayerSkipBack, IconArrowLeft, IconTrophy, IconMedal
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { statsService } from '../services/statsService';

function RankBadge({ rank }) {
  if (rank === 1) return <Badge color="yellow" leftSection={<IconTrophy size={12} />}>1.</Badge>;
  if (rank === 2) return <Badge color="gray.5" leftSection={<IconMedal size={12} />}>2.</Badge>;
  if (rank === 3) return <Badge color="orange" leftSection={<IconMedal size={12} />}>3.</Badge>;
  return <Badge color="gray" variant="light">#{rank}</Badge>;
}

function buildRunningLeaderboard(answers, upToQuestionIndex) {
  const playerScores = new Map();
  for (const answer of answers) {
    if (answer.questionIndex > upToQuestionIndex) continue;
    const current = playerScores.get(answer.nickname) || { score: 0, correct: 0, total: 0 };
    current.score += answer.score || 0;
    current.total += 1;
    if (answer.isCorrect) current.correct += 1;
    playerScores.set(answer.nickname, current);
  }

  return Array.from(playerScores.entries())
    .map(([nickname, stats]) => ({ nickname, ...stats }))
    .sort((a, b) => b.score - a.score)
    .map((player, idx) => ({ ...player, rank: idx + 1 }));
}

export default function GameReplay() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState('1');
  const timerRef = useRef(null);

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ['stats', 'session', id],
    queryFn: () => statsService.getSessionDetail(id),
  });

  // Determine total questions from answers data
  const totalQuestions = session
    ? Math.max(0, ...session.answers.map(a => a.questionIndex)) + 1
    : 0;

  const quizQuestions = session?.quizQuestions || null;

  const goNext = useCallback(() => {
    setCurrentStep(prev => {
      if (prev >= totalQuestions - 1) {
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [totalQuestions]);

  const goPrev = useCallback(() => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  }, []);

  // Auto-play timer
  useEffect(() => {
    if (isPlaying && totalQuestions > 0) {
      const interval = 3000 / parseFloat(speed);
      timerRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= totalQuestions - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, interval);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speed, totalQuestions]);

  if (isLoading) {
    return (
      <Center py="xl" mt="xl">
        <Loader size="lg" />
      </Center>
    );
  }

  if (isError || !session) {
    return (
      <Container size="lg" my={40}>
        <Stack align="center" gap="md">
          <Text c="dimmed">{t('common.error')}</Text>
          <Button component={Link} to="/stats" leftSection={<IconArrowLeft size={16} />} variant="light">
            {t('common.back')}
          </Button>
        </Stack>
      </Container>
    );
  }

  if (totalQuestions === 0) {
    return (
      <Container size="lg" my={40}>
        <Stack align="center" gap="md">
          <Text c="dimmed">No answer data available for replay</Text>
          <Button component={Link} to={`/stats/session/${id}`} leftSection={<IconArrowLeft size={16} />} variant="light">
            {t('common.back')}
          </Button>
        </Stack>
      </Container>
    );
  }

  // Current question answers
  const currentAnswers = session.answers.filter(a => a.questionIndex === currentStep);
  const correctCount = currentAnswers.filter(a => a.isCorrect).length;
  const totalAnswered = currentAnswers.length;
  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

  // Running leaderboard
  const leaderboard = buildRunningLeaderboard(session.answers, currentStep);

  // Current question info from quiz snapshot
  const currentQuestion = quizQuestions && quizQuestions[currentStep] ? quizQuestions[currentStep] : null;

  const isComplete = currentStep >= totalQuestions - 1;

  return (
    <Container size="lg" my={40}>
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Button
              component={Link}
              to={`/stats/session/${id}`}
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              mb="xs"
              px={0}
            >
              {t('common.back')}
            </Button>
            <Title>{t('stats.replayTitle', 'Game Replay')}: {session.quiz?.title || 'Quiz'}</Title>
          </div>
        </Group>

        {/* Replay Controls */}
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between">
            <Group gap="sm">
              <ActionIcon
                variant="light"
                size="lg"
                onClick={goPrev}
                disabled={currentStep === 0}
              >
                <IconPlayerSkipBack size={18} />
              </ActionIcon>
              <ActionIcon
                variant="filled"
                size="lg"
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={isComplete && !isPlaying}
              >
                {isPlaying ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
              </ActionIcon>
              <ActionIcon
                variant="light"
                size="lg"
                onClick={goNext}
                disabled={isComplete}
              >
                <IconPlayerSkipForward size={18} />
              </ActionIcon>
            </Group>

            <Group gap="sm">
              <Text size="sm" fw={500}>
                {t('stats.questionN', 'Question {{n}}', { n: currentStep + 1 })} / {totalQuestions}
              </Text>
            </Group>

            <Group gap="sm">
              <Text size="sm" c="dimmed">{t('stats.speed', 'Speed')}:</Text>
              <Select
                size="xs"
                w={80}
                value={speed}
                onChange={setSpeed}
                data={[
                  { value: '0.5', label: '0.5x' },
                  { value: '1', label: '1x' },
                  { value: '2', label: '2x' },
                  { value: '4', label: '4x' },
                ]}
              />
            </Group>
          </Group>

          {/* Stepper progress */}
          <Progress
            value={((currentStep + 1) / totalQuestions) * 100}
            mt="md"
            size="sm"
            radius="xl"
          />

          {isComplete && (
            <Text ta="center" size="sm" c="green" fw={500} mt="sm">
              {t('stats.replayComplete', 'Replay complete')}
            </Text>
          )}
        </Paper>

        {/* Question Display */}
        <Paper withBorder p="lg" radius="md">
          <Title order={3} mb="md">
            {t('stats.questionN', 'Question {{n}}', { n: currentStep + 1 })}
          </Title>

          {currentQuestion ? (
            <Stack gap="md">
              <Text size="lg" fw={500}>{currentQuestion.text}</Text>
              <Stack gap="xs">
                {currentQuestion.options.map((option, idx) => (
                  <Paper
                    key={idx}
                    withBorder
                    p="sm"
                    radius="sm"
                    style={{
                      borderColor: idx === currentQuestion.correctAnswerIndex
                        ? 'var(--mantine-color-green-6)' : undefined,
                      backgroundColor: idx === currentQuestion.correctAnswerIndex
                        ? 'var(--mantine-color-green-0)' : undefined
                    }}
                  >
                    <Group justify="space-between">
                      <Text size="sm" fw={idx === currentQuestion.correctAnswerIndex ? 600 : 400}>
                        {String.fromCharCode(65 + idx)}. {option}
                        {idx === currentQuestion.correctAnswerIndex && ' ✓'}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {currentAnswers.filter(a => a.answerIndex === idx).length} {t('stats.answered', 'answers')}
                      </Text>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </Stack>
          ) : (
            <Text c="dimmed">{t('stats.questionN', 'Question {{n}}', { n: currentStep + 1 })}</Text>
          )}

          {/* Answer Distribution */}
          <Group mt="md" gap="md">
            <Badge color="green" size="lg" variant="light">
              {correctCount}/{totalAnswered} {t('stats.correctLabel', 'correct')}
            </Badge>
            <Progress.Root size="xl" style={{ flex: 1 }}>
              <Progress.Section value={accuracy} color="green">
                <Progress.Label>{accuracy}%</Progress.Label>
              </Progress.Section>
              <Progress.Section value={100 - accuracy} color="red">
                {(100 - accuracy) >= 15 && (
                  <Progress.Label>{100 - accuracy}%</Progress.Label>
                )}
              </Progress.Section>
            </Progress.Root>
          </Group>
        </Paper>

        {/* Player Answers for Current Question */}
        {currentAnswers.length > 0 && (
          <Paper withBorder radius="md">
            <Title order={4} p="md" pb={0}>
              {t('stats.playerAnswers', 'Player Answers')}
            </Title>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('game.nickname', 'Player')}</Table.Th>
                  <Table.Th>{t('stats.answer', 'Answer')}</Table.Th>
                  <Table.Th>{t('stats.result', 'Result')}</Table.Th>
                  <Table.Th>{t('stats.responseTime', 'Response Time')}</Table.Th>
                  <Table.Th>{t('game.score', 'Score')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {currentAnswers
                  .sort((a, b) => (a.responseTimeMs || 0) - (b.responseTimeMs || 0))
                  .map((answer, idx) => (
                    <Table.Tr key={idx}>
                      <Table.Td>
                        <Text size="sm" fw={500}>{answer.nickname}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {currentQuestion && currentQuestion.options[answer.answerIndex]
                            ? `${String.fromCharCode(65 + answer.answerIndex)}. ${currentQuestion.options[answer.answerIndex]}`
                            : String.fromCharCode(65 + answer.answerIndex)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={answer.isCorrect ? 'green' : 'red'} variant="light" size="sm">
                          {answer.isCorrect ? t('game.correct', 'Correct') : t('game.wrong', 'Wrong')}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{((answer.responseTimeMs || 0) / 1000).toFixed(1)}s</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">+{answer.score || 0}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}

        {/* Running Leaderboard */}
        <Paper withBorder radius="md">
          <Title order={4} p="md" pb={0}>
            {t('game.leaderboard', 'Leaderboard')} ({t('stats.questionN', 'Question {{n}}', { n: currentStep + 1 })})
          </Title>
          {leaderboard.length === 0 ? (
            <Text c="dimmed" p="md">No data</Text>
          ) : (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>#</Table.Th>
                  <Table.Th>{t('game.nickname', 'Player')}</Table.Th>
                  <Table.Th>{t('game.score', 'Score')}</Table.Th>
                  <Table.Th>{t('stats.correctAnswers', 'Correct')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {leaderboard.map((player) => (
                  <Table.Tr key={player.nickname}>
                    <Table.Td><RankBadge rank={player.rank} /></Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>{player.nickname}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{player.score.toLocaleString()}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color="green" variant="light" size="sm">
                        {player.correct}/{player.total}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
      </Stack>
    </Container>
  );
}
