import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Title, TextInput, Card, Text, Group, Badge, Stack, Pagination, Center, Loader, Select } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { IconSearch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { quizService } from '../services/quizService';
import { QUIZ_CATEGORIES } from '../constants/validation';
import StarRating from '../components/StarRating';

export default function Quizzes() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(null);
  const [debouncedSearch] = useDebouncedValue(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['quizzes', 'public', page, debouncedSearch, category],
    queryFn: () => debouncedSearch.length >= 2
      ? quizService.search(debouncedSearch, page)
      : quizService.getPublic(page, 20, category),
  });

  const quizzes = data?.quizzes || [];
  const pagination = data?.pagination;

  return (
    <Container size="lg" my={40}>
      <Title mb="lg">{t('home.exploreQuizzes')}</Title>

      <Group mb="lg" grow>
        <TextInput
          placeholder={t('quiz.searchQuizzes')}
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          placeholder={t('quiz.allCategories')}
          data={QUIZ_CATEGORIES}
          value={category}
          onChange={(value) => {
            setCategory(value);
            setPage(1);
          }}
          clearable
        />
      </Group>

      {isLoading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : quizzes.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          {debouncedSearch ? t('quiz.noQuizzesSearch') : t('quiz.noQuizzesAvailable')}
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
                <Group gap="xs">
                  <Text fw={500}>{quiz.title}</Text>
                  {quiz.category && quiz.category !== 'Diğer' && (
                    <Badge color="violet" variant="light" size="sm">{quiz.category}</Badge>
                  )}
                </Group>
                <Badge color="blue">{t('quiz.questionCount', { count: quiz.questionCount || quiz.questions?.length || 0 })}</Badge>
              </Group>
              {quiz.description && (
                <Text size="sm" c="dimmed" lineClamp={2}>
                  {quiz.description}
                </Text>
              )}
              <Group gap="xs" mt="sm">
                <Text size="xs" c="dimmed">
                  {t('quiz.playCount', { count: quiz.playCount || 0 })}
                </Text>
                {quiz.averageRating > 0 && (
                  <StarRating value={quiz.averageRating} count={quiz.ratingCount} readOnly size="xs" />
                )}
                {quiz.tags && quiz.tags.length > 0 && (
                  <Group gap={4}>
                    {quiz.tags.map((tag) => (
                      <Badge key={tag} size="xs" variant="outline" color="gray">{tag}</Badge>
                    ))}
                  </Group>
                )}
              </Group>
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
