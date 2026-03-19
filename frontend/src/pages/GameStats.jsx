import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Container, Title, Text, SimpleGrid, Paper, Group, Stack,
  Table, Badge, Pagination, Center, Loader
} from '@mantine/core';
import {
  IconTrophy, IconUsers, IconTarget, IconClock, IconChartBar, IconDeviceGamepad2
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { statsService } from '../services/statsService';
import { showToast, getErrorMessage } from '../utils/toast';
import { formatDuration, formatDate } from '../utils/formatters';

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <Paper withBorder shadow="sm" p="md" radius="md">
      <Group>
        <Icon size={32} stroke={1.5} color={`var(--mantine-color-${color}-6)`} />
        <div>
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {label}
          </Text>
          <Text fw={700} size="xl">
            {value}
          </Text>
        </div>
      </Group>
    </Paper>
  );
}

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

export default function GameStats() {
  const [page, setPage] = useState(1);

  const { data: dashboardStats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: statsService.getDashboard,
    onError: (error) => showToast.error(getErrorMessage(error)),
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['stats', 'sessions', page],
    queryFn: () => statsService.getSessions(page, 10),
    onError: (error) => showToast.error(getErrorMessage(error)),
  });

  const sessions = sessionsData?.sessions || [];
  const pagination = sessionsData?.pagination;

  if (statsLoading) {
    return (
      <Center py="xl" mt="xl">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Container size="lg" my={40}>
      <Stack gap="xl">
        <div>
          <Title mb="xs">Game Statistics</Title>
          <Text c="dimmed">Overview of your hosted games</Text>
        </div>

        {/* Stats Cards */}
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="md">
          <StatCard
            icon={IconDeviceGamepad2}
            label="Total Games"
            value={dashboardStats?.totalGames ?? 0}
            color="blue"
          />
          <StatCard
            icon={IconUsers}
            label="Total Players"
            value={dashboardStats?.totalPlayers ?? 0}
            color="teal"
          />
          <StatCard
            icon={IconUsers}
            label="Unique Players"
            value={dashboardStats?.uniquePlayers ?? 0}
            color="violet"
          />
          <StatCard
            icon={IconChartBar}
            label="Avg Players / Game"
            value={dashboardStats?.averagePlayersPerGame ?? 0}
            color="indigo"
          />
          <StatCard
            icon={IconTarget}
            label="Accuracy Rate"
            value={`${dashboardStats?.accuracyRate ?? 0}%`}
            color="green"
          />
          <StatCard
            icon={IconClock}
            label="Avg Duration"
            value={formatDuration(dashboardStats?.averageDuration)}
            color="orange"
          />
        </SimpleGrid>

        {/* Recent Games Table */}
        <div>
          <Title order={3} mb="md">Game History</Title>

          {sessionsLoading ? (
            <Center py="xl">
              <Loader />
            </Center>
          ) : sessions.length === 0 ? (
            <Paper withBorder p="xl" ta="center">
              <Text c="dimmed">No games played yet. Host a game to see your stats here.</Text>
            </Paper>
          ) : (
            <Paper withBorder>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Quiz</Table.Th>
                    <Table.Th>Players</Table.Th>
                    <Table.Th>Winner</Table.Th>
                    <Table.Th>Duration</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sessions.map((session) => (
                    <Table.Tr
                      key={session.id}
                      component={Link}
                      to={`/stats/session/${session.id}`}
                      style={{ textDecoration: 'none', cursor: 'pointer' }}
                    >
                      <Table.Td>
                        <Text size="sm">{formatDate(session.startedAt)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500} truncate style={{ maxWidth: 200 }}>
                          {session.quiz?.title || 'Deleted Quiz'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{session.playerCount}</Text>
                      </Table.Td>
                      <Table.Td>
                        {session.winner ? (
                          <Group gap="xs">
                            <IconTrophy size={14} color="var(--mantine-color-yellow-6)" />
                            <Text size="sm">{session.winner}</Text>
                          </Group>
                        ) : (
                          <Text size="sm" c="dimmed">-</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{formatDuration(session.durationSeconds)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <StatusBadge status={session.status} />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}

          {pagination && pagination.totalPages > 1 && (
            <Center mt="lg">
              <Pagination
                value={page}
                onChange={setPage}
                total={pagination.totalPages}
              />
            </Center>
          )}
        </div>
      </Stack>
    </Container>
  );
}
