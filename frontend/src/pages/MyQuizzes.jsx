import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Container, Title, Button, Card, Text, Group, Badge, Stack, Pagination, Center, Loader, ActionIcon, Menu } from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IconPlus, IconDotsVertical, IconEdit, IconTrash, IconEye, IconPlayerPlay, IconUpload } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { quizService } from '../services/quizService';
import { showToast } from '../utils/toast';

export default function MyQuizzes() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['quizzes', 'my', page],
    queryFn: () => quizService.getMy(page),
  });

  const deleteMutation = useMutation({
    mutationFn: quizService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizzes', 'my'] });
      showToast.success('Quiz deleted');
    },
  });

  const importMutation = useMutation({
    mutationFn: (data) => quizService.import(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['quizzes', 'my'] });
      showToast.success(result.message || 'Quiz imported successfully');
    },
    onError: (error) => {
      showToast.error(error.response?.data?.message || 'Failed to import quiz');
    },
  });

  const quizzes = data?.quizzes || [];
  const pagination = data?.pagination;

  const handleDelete = (id, title) => {
    if (window.confirm(`Are you sure you want to delete "${title}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        importMutation.mutate(jsonData);
      } catch {
        showToast.error('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    event.target.value = '';
  };

  return (
    <Container size="lg" my={40}>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".json"
        onChange={handleFileChange}
      />
      <Group justify="space-between" mb="lg">
        <Title>{t('nav.myQuizzes')}</Title>
        <Group>
          <Button
            variant="light"
            leftSection={<IconUpload size={16} />}
            onClick={handleImport}
            loading={importMutation.isPending}
          >
            {t('quiz.importQuiz')}
          </Button>
          <Button component={Link} to="/quizzes/create" leftSection={<IconPlus size={16} />}>
            {t('nav.createQuiz')}
          </Button>
        </Group>
      </Group>

      {isLoading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : quizzes.length === 0 ? (
        <Card withBorder padding="xl" ta="center">
          <Text c="dimmed" mb="md">{t('quiz.noCreatedQuizzes')}</Text>
          <Button component={Link} to="/quizzes/create" leftSection={<IconPlus size={16} />}>
            {t('quiz.createFirstQuiz')}
          </Button>
        </Card>
      ) : (
        <Stack gap="md">
          {quizzes.map((quiz) => (
            <Card key={quiz.id || quiz._id} withBorder shadow="sm" padding="lg">
              <Group justify="space-between">
                <div style={{ flex: 1 }}>
                  <Group gap="xs" mb="xs">
                    <Text fw={500}>{quiz.title}</Text>
                    <Badge color={quiz.isPublic ? 'green' : 'gray'} size="sm">
                      {quiz.isPublic ? t('quiz.public') : t('quiz.private')}
                    </Badge>
                    {quiz.category && quiz.category !== 'Diğer' && (
                      <Badge color="violet" variant="light" size="sm">{quiz.category}</Badge>
                    )}
                    <Badge color="blue" size="sm">
                      {t('quiz.questionCount', { count: quiz.questionCount || quiz.questions?.length || 0 })}
                    </Badge>
                  </Group>
                  {quiz.description && (
                    <Text size="sm" c="dimmed" lineClamp={1}>
                      {quiz.description}
                    </Text>
                  )}
                  {quiz.tags && quiz.tags.length > 0 && (
                    <Group gap={4} mt={4}>
                      {quiz.tags.map((tag) => (
                        <Badge key={tag} size="xs" variant="outline" color="gray">{tag}</Badge>
                      ))}
                    </Group>
                  )}
                </div>

                <Menu position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle">
                      <IconDotsVertical size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      component={Link}
                      to={`/host/${quiz.id || quiz._id}`}
                      leftSection={<IconPlayerPlay size={14} />}
                      disabled={(quiz.questionCount || quiz.questions?.length || 0) === 0}
                    >
                      {t('quiz.play')}
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      component={Link}
                      to={`/quizzes/${quiz.id || quiz._id}`}
                      leftSection={<IconEye size={14} />}
                    >
                      {t('quiz.view')}
                    </Menu.Item>
                    <Menu.Item
                      component={Link}
                      to={`/quizzes/${quiz.id || quiz._id}/edit`}
                      leftSection={<IconEdit size={14} />}
                    >
                      {t('common.edit')}
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => handleDelete(quiz.id || quiz._id, quiz.title)}
                    >
                      {t('common.delete')}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
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
