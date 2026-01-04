import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Title, TextInput, Card, Text, Group, Badge, Stack, Pagination, Center, Loader } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { IconSearch } from '@tabler/icons-react';
import { quizService } from '../services/quizService';

export default function Quizzes() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['quizzes', 'public', page, debouncedSearch],
    queryFn: () => debouncedSearch.length >= 2
      ? quizService.search(debouncedSearch, page)
      : quizService.getPublic(page),
  });

  const quizzes = data?.quizzes || [];
  const pagination = data?.pagination;

  return (
    <Container size="lg" my={40}>
      <Title mb="lg">Explore Quizzes</Title>

      <TextInput
        placeholder="Search quizzes..."
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        mb="lg"
      />

      {isLoading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : quizzes.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          {debouncedSearch ? 'No quizzes found matching your search.' : 'No quizzes available yet.'}
        </Text>
      ) : (
        <Stack gap="md">
          {quizzes.map((quiz) => (
            <Card
              key={quiz.id || quiz._id}
              component={Link}
              to={`/quizzes/${quiz.id || quiz._id}`}
              withBorder
              shadow="sm"
              padding="lg"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Group justify="space-between" mb="xs">
                <Text fw={500}>{quiz.title}</Text>
                <Badge color="blue">{quiz.questionCount || quiz.questions?.length || 0} questions</Badge>
              </Group>
              {quiz.description && (
                <Text size="sm" c="dimmed" lineClamp={2}>
                  {quiz.description}
                </Text>
              )}
              <Text size="xs" c="dimmed" mt="sm">
                Played {quiz.playCount || 0} times
              </Text>
            </Card>
          ))}
        </Stack>
      )}

      {pagination && pagination.totalPages > 1 && (
        <Center mt="xl">
          <Pagination
            value={page}
            onChange={setPage}
            total={pagination.totalPages}
          />
        </Center>
      )}
    </Container>
  );
}
