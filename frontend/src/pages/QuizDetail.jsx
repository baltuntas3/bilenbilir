import { Link, useParams } from 'react-router-dom';
import { Container, Title, Paper, Text, Group, Badge, Button, Stack, Card, Center, Loader } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconEdit, IconPlayerPlay } from '@tabler/icons-react';
import { quizService } from '../services/quizService';
import { useAuth } from '../context/AuthContext';

export default function QuizDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const { data: quiz, isLoading, error } = useQuery({
    queryKey: ['quiz', id],
    queryFn: () => quizService.getById(id),
  });

  const { data: questions = [] } = useQuery({
    queryKey: ['quiz', id, 'questions'],
    queryFn: () => quizService.getQuestions(id),
    enabled: !!quiz,
  });

  if (isLoading) {
    return (
      <Center py="xl" mt={100}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (error) {
    return (
      <Container size="lg" my={40}>
        <Paper withBorder p="xl" ta="center">
          <Text c="red" mb="md">Failed to load quiz</Text>
          <Button component={Link} to="/quizzes">Back to Quizzes</Button>
        </Paper>
      </Container>
    );
  }

  const isOwner = user && quiz?.createdBy === user.id;

  return (
    <Container size="lg" my={40}>
      <Paper withBorder shadow="md" p={30} radius="md" mb="lg">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={2}>{quiz.title}</Title>
            <Group gap="xs" mt="xs">
              <Badge color={quiz.isPublic ? 'green' : 'gray'}>
                {quiz.isPublic ? 'Public' : 'Private'}
              </Badge>
              <Badge color="blue">{questions.length} questions</Badge>
              <Text size="sm" c="dimmed">Played {quiz.playCount || 0} times</Text>
            </Group>
          </div>
          <Group>
            {isOwner && (
              <Button
                component={Link}
                to={`/quizzes/${id}/edit`}
                variant="light"
                leftSection={<IconEdit size={16} />}
              >
                Edit
              </Button>
            )}
            <Button leftSection={<IconPlayerPlay size={16} />} disabled={questions.length === 0}>
              Play
            </Button>
          </Group>
        </Group>

        {quiz.description && (
          <Text c="dimmed">{quiz.description}</Text>
        )}
      </Paper>

      <Title order={3} mb="md">Questions</Title>

      {questions.length === 0 ? (
        <Paper withBorder p="xl" ta="center">
          <Text c="dimmed" mb="md">No questions yet.</Text>
          {isOwner && (
            <Button component={Link} to={`/quizzes/${id}/edit`}>
              Add Questions
            </Button>
          )}
        </Paper>
      ) : (
        <Stack gap="md">
          {questions.map((question, index) => (
            <Card key={question.id || question._id} withBorder padding="md">
              <Group justify="space-between" mb="xs">
                <Text fw={500}>
                  {index + 1}. {question.text}
                </Text>
                <Group gap="xs">
                  <Badge size="sm" variant="light">{question.timeLimit}s</Badge>
                  <Badge size="sm" variant="light">{question.points} pts</Badge>
                </Group>
              </Group>

              <Stack gap={4}>
                {question.options.map((option, optIndex) => (
                  <Text
                    key={optIndex}
                    size="sm"
                    c={optIndex === question.correctAnswerIndex ? 'green' : 'dimmed'}
                    fw={optIndex === question.correctAnswerIndex ? 500 : 400}
                  >
                    {String.fromCharCode(65 + optIndex)}. {option}
                    {optIndex === question.correctAnswerIndex && ' ✓'}
                  </Text>
                ))}
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
    </Container>
  );
}
