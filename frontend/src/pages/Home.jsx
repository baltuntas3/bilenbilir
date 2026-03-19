import { Link } from 'react-router-dom';
import { Container, Title, Text, Stack, SimpleGrid, Card, Group } from '@mantine/core';
import { IconSearch, IconPlus, IconList, IconUsers, IconChartBar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <Container size="lg" my={40}>
      <Stack align="center" gap="md" mb="xl">
        <Title>{t('home.welcome', { username: user?.username })}</Title>
        <Text c="dimmed">{t('home.subtitle')}</Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <Card component={Link} to="/join" withBorder shadow="sm" padding="lg" style={{ textDecoration: 'none' }}>
          <Group>
            <IconUsers size={32} stroke={1.5} />
            <div>
              <Text fw={500}>{t('home.joinGame')}</Text>
              <Text size="sm" c="dimmed">{t('home.joinGameDesc')}</Text>
            </div>
          </Group>
        </Card>

        <Card component={Link} to="/quizzes" withBorder shadow="sm" padding="lg" style={{ textDecoration: 'none' }}>
          <Group>
            <IconSearch size={32} stroke={1.5} />
            <div>
              <Text fw={500}>{t('home.exploreQuizzes')}</Text>
              <Text size="sm" c="dimmed">{t('home.exploreQuizzesDesc')}</Text>
            </div>
          </Group>
        </Card>

        <Card component={Link} to="/my-quizzes" withBorder shadow="sm" padding="lg" style={{ textDecoration: 'none' }}>
          <Group>
            <IconList size={32} stroke={1.5} />
            <div>
              <Text fw={500}>{t('home.myQuizzes')}</Text>
              <Text size="sm" c="dimmed">{t('home.myQuizzesDesc')}</Text>
            </div>
          </Group>
        </Card>

        <Card component={Link} to="/quizzes/create" withBorder shadow="sm" padding="lg" style={{ textDecoration: 'none' }}>
          <Group>
            <IconPlus size={32} stroke={1.5} />
            <div>
              <Text fw={500}>{t('home.createQuiz')}</Text>
              <Text size="sm" c="dimmed">{t('home.createQuizDesc')}</Text>
            </div>
          </Group>
        </Card>

        <Card component={Link} to="/stats" withBorder shadow="sm" padding="lg" style={{ textDecoration: 'none' }}>
          <Group>
            <IconChartBar size={32} stroke={1.5} />
            <div>
              <Text fw={500}>{t('home.gameStats')}</Text>
              <Text size="sm" c="dimmed">{t('home.gameStatsDesc')}</Text>
            </div>
          </Group>
        </Card>
      </SimpleGrid>
    </Container>
  );
}
