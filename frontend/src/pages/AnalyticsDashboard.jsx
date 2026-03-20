import { Container, Title, Stack, Card, Text, Group, SimpleGrid, Progress, Table, Badge, Paper, RingProgress } from '@mantine/core';
import { IconChartBar, IconAlertTriangle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { statsService } from '../services/statsService';
import Loading from '../components/Loading';

export default function AnalyticsDashboard() {
  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: statsService.getDashboard,
  });

  const { data: weakTopics, isLoading: weakLoading } = useQuery({
    queryKey: ['weak-topics'],
    queryFn: statsService.getWeakTopics,
  });

  if (dashLoading || weakLoading) return <Loading />;

  const stats = dashboard || {};
  const topics = weakTopics?.topics || [];

  return (
    <Container size="lg" py="xl">
      <Group mb="xl">
        <IconChartBar size={28} />
        <Title order={2}>Detaylı Analitik</Title>
      </Group>

      <Stack gap="lg">
        {/* Overview Cards */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
          <Card withBorder padding="lg">
            <Text size="sm" c="dimmed">Toplam Oyun</Text>
            <Text size="xl" fw={700}>{stats.totalGames || 0}</Text>
          </Card>
          <Card withBorder padding="lg">
            <Text size="sm" c="dimmed">Toplam Oyuncu</Text>
            <Text size="xl" fw={700}>{stats.totalPlayers || 0}</Text>
          </Card>
          <Card withBorder padding="lg">
            <Text size="sm" c="dimmed">Ort. Oyuncu/Oyun</Text>
            <Text size="xl" fw={700}>{stats.averagePlayersPerGame || 0}</Text>
          </Card>
          <Card withBorder padding="lg">
            <Text size="sm" c="dimmed">Genel Doğruluk</Text>
            <Group>
              <RingProgress
                size={50}
                thickness={5}
                sections={[{ value: stats.accuracyRate || 0, color: 'blue' }]}
                label={<Text size="xs" ta="center">{stats.accuracyRate || 0}%</Text>}
              />
            </Group>
          </Card>
        </SimpleGrid>

        {/* Weak Topics */}
        <Card withBorder>
          <Group mb="md">
            <IconAlertTriangle size={20} />
            <Text fw={600} size="lg">Zayıf Konular</Text>
          </Group>
          {topics.length === 0 ? (
            <Text c="dimmed" ta="center" py="md">Henüz yeterli veri yok.</Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Quiz</Table.Th>
                  <Table.Th>Doğruluk</Table.Th>
                  <Table.Th>Toplam Cevap</Table.Th>
                  <Table.Th>Oyun Sayısı</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {topics.slice(0, 10).map((topic) => (
                  <Table.Tr key={topic.quizId}>
                    <Table.Td>{topic.quizTitle}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Progress value={topic.accuracy} size="sm" w={80}
                          color={topic.accuracy < 40 ? 'red' : topic.accuracy < 60 ? 'yellow' : 'green'} />
                        <Text size="sm">{topic.accuracy}%</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>{topic.totalAttempts}</Table.Td>
                    <Table.Td>{topic.sessions}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </Stack>
    </Container>
  );
}
