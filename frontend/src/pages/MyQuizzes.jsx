import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Title, Button, Card, Text, Group, Badge, Stack, Pagination, Center, Loader, ActionIcon, Menu } from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IconPlus, IconDotsVertical, IconEdit, IconTrash, IconEye } from '@tabler/icons-react';
import { quizService } from '../services/quizService';
import { showToast } from '../utils/toast';

export default function MyQuizzes() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

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

  const quizzes = data?.quizzes || [];
  const pagination = data?.pagination;

  const handleDelete = (id, title) => {
    if (window.confirm(`Are you sure you want to delete "${title}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <Container size="lg" my={40}>
      <Group justify="space-between" mb="lg">
        <Title>My Quizzes</Title>
        <Button component={Link} to="/quizzes/create" leftSection={<IconPlus size={16} />}>
          Create Quiz
        </Button>
      </Group>

      {isLoading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : quizzes.length === 0 ? (
        <Card withBorder padding="xl" ta="center">
          <Text c="dimmed" mb="md">You haven't created any quizzes yet.</Text>
          <Button component={Link} to="/quizzes/create" leftSection={<IconPlus size={16} />}>
            Create Your First Quiz
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
                      {quiz.isPublic ? 'Public' : 'Private'}
                    </Badge>
                    <Badge color="blue" size="sm">
                      {quiz.questionCount || quiz.questions?.length || 0} questions
                    </Badge>
                  </Group>
                  {quiz.description && (
                    <Text size="sm" c="dimmed" lineClamp={1}>
                      {quiz.description}
                    </Text>
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
                      to={`/quizzes/${quiz.id || quiz._id}`}
                      leftSection={<IconEye size={14} />}
                    >
                      View
                    </Menu.Item>
                    <Menu.Item
                      component={Link}
                      to={`/quizzes/${quiz.id || quiz._id}/edit`}
                      leftSection={<IconEdit size={14} />}
                    >
                      Edit
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => handleDelete(quiz.id || quiz._id, quiz.title)}
                    >
                      Delete
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
