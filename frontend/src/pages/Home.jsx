import { Link } from 'react-router-dom';
import { Container, Title, Text, Button, Stack, SimpleGrid, Card, Group } from '@mantine/core';
import { IconSearch, IconPlus, IconList, IconUser } from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user } = useAuth();

  return (
    <Container size="lg" my={40}>
      <Stack align="center" gap="md" mb="xl">
        <Title>Welcome, {user?.username}!</Title>
        <Text c="dimmed">Bilenbilir Quiz Application</Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <Card component={Link} to="/quizzes" withBorder shadow="sm" padding="lg" style={{ textDecoration: 'none' }}>
          <Group>
            <IconSearch size={32} stroke={1.5} />
            <div>
              <Text fw={500}>Explore Quizzes</Text>
              <Text size="sm" c="dimmed">Discover and play public quizzes</Text>
            </div>
          </Group>
        </Card>

        <Card component={Link} to="/my-quizzes" withBorder shadow="sm" padding="lg" style={{ textDecoration: 'none' }}>
          <Group>
            <IconList size={32} stroke={1.5} />
            <div>
              <Text fw={500}>My Quizzes</Text>
              <Text size="sm" c="dimmed">Manage your created quizzes</Text>
            </div>
          </Group>
        </Card>

        <Card component={Link} to="/quizzes/create" withBorder shadow="sm" padding="lg" style={{ textDecoration: 'none' }}>
          <Group>
            <IconPlus size={32} stroke={1.5} />
            <div>
              <Text fw={500}>Create Quiz</Text>
              <Text size="sm" c="dimmed">Create a new quiz</Text>
            </div>
          </Group>
        </Card>

        <Card component={Link} to="/profile" withBorder shadow="sm" padding="lg" style={{ textDecoration: 'none' }}>
          <Group>
            <IconUser size={32} stroke={1.5} />
            <div>
              <Text fw={500}>Profile</Text>
              <Text size="sm" c="dimmed">Manage your account settings</Text>
            </div>
          </Group>
        </Card>
      </SimpleGrid>
    </Container>
  );
}
