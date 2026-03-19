import { useParams, Link } from 'react-router-dom';
import {
  Container, Title, Text, Paper, Group, Stack, Table, Badge,
  Progress, SimpleGrid, Center, Loader, Button
} from '@mantine/core';
import {
  IconTrophy, IconArrowLeft, IconClock, IconUsers, IconTarget, IconMedal
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { statsService } from '../services/statsService';
import { showToast, getErrorMessage } from '../utils/toast';
import { formatDuration, formatDate } from '../utils/formatters';

function StatusBadge({ status }) {
  const colorMap = {
    completed: 'green',
    interrupted: 'orange',
    cancelled: 'red',
    abandoned: 'gray',
    error: 'red'
  };
  return (
    <Badge color={colorMap[status] || 'gray'} size="sm">
      {status}
    </Badge>
  );
}

function RankBadge({ rank }) {
  if (rank === 1) return <Badge color="yellow" leftSection={<IconTrophy size={12} />}>1st</Badge>;
  if (rank === 2) return <Badge color="gray.5" leftSection={<IconMedal size={12} />}>2nd</Badge>;
  if (rank === 3) return <Badge color="orange" leftSection={<IconMedal size={12} />}>3rd</Badge>;
  return <Badge color="gray" variant="light">#{rank}</Badge>;
}

function QuestionBreakdown({ answers, playerCount }) {
  // Group answers by question index
  const questionMap = new Map();
  for (const answer of answers) {
    const idx = answer.questionIndex;
    if (!questionMap.has(idx)) {
      questionMap.set(idx, { total: 0, correct: 0, totalTime: 0 });
    }
    const stat = questionMap.get(idx);
    stat.total++;
    stat.totalTime += answer.responseTimeMs || 0;
    if (answer.isCorrect) stat.correct++;
  }

  const questions = Array.from(questionMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([index, stat]) => ({
      index,
      total: stat.total,
      correct: stat.correct,
      accuracy: stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0,
      avgTime: stat.total > 0 ? Math.round(stat.totalTime / stat.total) : 0
    }));

  if (questions.length === 0) {
    return (
      <Paper withBorder p="xl" ta="center">
        <Text c="dimmed">No answer data available</Text>
      </Paper>
    );
  }

  return (
    <Stack gap="sm">
      {questions.map((q) => (
        <Paper key={q.index} withBorder p="md" radius="md">
          <Group justify="space-between" mb="xs">
            <Text fw={500} size="sm">Question {q.index + 1}</Text>
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                {q.correct}/{q.total} correct
              </Text>
              <Text size="xs" c="dimmed">
                Avg: {(q.avgTime / 1000).toFixed(1)}s
              </Text>
            </Group>
          </Group>
          <Progress.Root size="xl">
            <Progress.Section value={q.accuracy} color="green">
              <Progress.Label>{q.accuracy}%</Progress.Label>
            </Progress.Section>
            <Progress.Section value={100 - q.accuracy} color="red">
              {(100 - q.accuracy) >= 15 && (
                <Progress.Label>{100 - q.accuracy}%</Progress.Label>
              )}
            </Progress.Section>
          </Progress.Root>
        </Paper>
      ))}
    </Stack>
  );
}

export default function GameSessionDetail() {
  const { id } = useParams();

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ['stats', 'session', id],
    queryFn: () => statsService.getSessionDetail(id),
    onError: (error) => showToast.error(getErrorMessage(error)),
  });

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
          <Text c="dimmed">Failed to load session details</Text>
          <Button component={Link} to="/stats" leftSection={<IconArrowLeft size={16} />} variant="light">
            Back to Stats
          </Button>
        </Stack>
      </Container>
    );
  }

  const playerResults = session.playerResults || [];
  const sortedPlayers = [...playerResults].sort((a, b) => a.rank - b.rank);

  return (
    <Container size="lg" my={40}>
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Button
              component={Link}
              to="/stats"
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              mb="xs"
              px={0}
            >
              Back to Stats
            </Button>
            <Title>{session.quiz?.title || 'Deleted Quiz'}</Title>
            <Group gap="sm" mt="xs">
              <StatusBadge status={session.status} />
              <Text size="sm" c="dimmed">PIN: {session.pin}</Text>
            </Group>
          </div>
        </Group>

        {/* Game Info Cards */}
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
          <Paper withBorder p="md" radius="md">
            <Group gap="xs">
              <IconClock size={20} stroke={1.5} color="var(--mantine-color-blue-6)" />
              <div>
                <Text size="xs" c="dimmed">Date</Text>
                <Text size="sm" fw={500}>{formatDate(session.startedAt)}</Text>
              </div>
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group gap="xs">
              <IconClock size={20} stroke={1.5} color="var(--mantine-color-orange-6)" />
              <div>
                <Text size="xs" c="dimmed">Duration</Text>
                <Text size="sm" fw={500}>{formatDuration(session.durationSeconds)}</Text>
              </div>
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group gap="xs">
              <IconUsers size={20} stroke={1.5} color="var(--mantine-color-teal-6)" />
              <div>
                <Text size="xs" c="dimmed">Players</Text>
                <Text size="sm" fw={500}>{session.playerCount}</Text>
              </div>
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group gap="xs">
              <IconTarget size={20} stroke={1.5} color="var(--mantine-color-green-6)" />
              <div>
                <Text size="xs" c="dimmed">Accuracy</Text>
                <Text size="sm" fw={500}>{session.overallAccuracy ?? 0}%</Text>
              </div>
            </Group>
          </Paper>
        </SimpleGrid>

        {/* Leaderboard */}
        <div>
          <Title order={3} mb="md">Leaderboard</Title>
          {sortedPlayers.length === 0 ? (
            <Paper withBorder p="xl" ta="center">
              <Text c="dimmed">No player data available</Text>
            </Paper>
          ) : (
            <Paper withBorder>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Rank</Table.Th>
                    <Table.Th>Player</Table.Th>
                    <Table.Th>Score</Table.Th>
                    <Table.Th>Correct</Table.Th>
                    <Table.Th>Wrong</Table.Th>
                    <Table.Th>Avg Time</Table.Th>
                    <Table.Th>Streak</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sortedPlayers.map((player) => (
                    <Table.Tr key={player.nickname}>
                      <Table.Td><RankBadge rank={player.rank} /></Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>{player.nickname}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{(player.score || 0).toLocaleString()}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color="green" variant="light" size="sm">
                          {player.correctAnswers || 0}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge color="red" variant="light" size="sm">
                          {player.wrongAnswers || 0}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {player.averageResponseTime
                            ? `${(player.averageResponseTime / 1000).toFixed(1)}s`
                            : '-'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{player.longestStreak || 0}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}
        </div>

        {/* Per-Question Breakdown */}
        <div>
          <Title order={3} mb="md">Question Breakdown</Title>
          <QuestionBreakdown
            answers={session.answers || []}
            playerCount={session.playerCount}
          />
        </div>
      </Stack>
    </Container>
  );
}
