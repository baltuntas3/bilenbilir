import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Container, Title, Paper, TextInput, Textarea, Switch, Button, Stack, Group, Card, Text, Badge, ActionIcon, Modal, Center, Loader } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IconPlus, IconEdit, IconTrash, IconArrowLeft, IconGripVertical } from '@tabler/icons-react';
import { quizService } from '../services/quizService';
import { showToast } from '../utils/toast';
import { quizTitleValidation, quizDescriptionValidation } from '../constants/validation';
import QuestionForm from '../components/QuestionForm';

export default function QuizEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [editingQuestion, setEditingQuestion] = useState(null);

  const { data: quiz, isLoading } = useQuery({
    queryKey: ['quiz', id],
    queryFn: () => quizService.getById(id),
  });

  const { data: questions = [] } = useQuery({
    queryKey: ['quiz', id, 'questions'],
    queryFn: () => quizService.getQuestions(id),
    enabled: !!quiz,
  });

  const form = useForm({
    initialValues: {
      title: quiz?.title || '',
      description: quiz?.description || '',
      isPublic: quiz?.isPublic || false,
    },
    validate: {
      title: quizTitleValidation,
      description: quizDescriptionValidation,
    },
  });

  // Update form when quiz data loads
  if (quiz && form.values.title === '' && quiz.title) {
    form.setValues({
      title: quiz.title,
      description: quiz.description || '',
      isPublic: quiz.isPublic,
    });
  }

  const updateMutation = useMutation({
    mutationFn: (data) => quizService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', id] });
      showToast.success('Quiz updated');
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (questionId) => quizService.deleteQuestion(id, questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', id, 'questions'] });
      showToast.success('Question deleted');
    },
  });

  const handleAddQuestion = () => {
    setEditingQuestion(null);
    open();
  };

  const handleEditQuestion = (question) => {
    setEditingQuestion(question);
    open();
  };

  const handleDeleteQuestion = (questionId) => {
    if (window.confirm('Are you sure you want to delete this question?')) {
      deleteQuestionMutation.mutate(questionId);
    }
  };

  const handleQuestionSaved = () => {
    close();
    setEditingQuestion(null);
    queryClient.invalidateQueries({ queryKey: ['quiz', id, 'questions'] });
  };

  if (isLoading) {
    return (
      <Center py="xl" mt={100}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Container size="lg" my={40}>
      <Group mb="lg">
        <ActionIcon variant="subtle" component={Link} to={`/quizzes/${id}`}>
          <IconArrowLeft size={20} />
        </ActionIcon>
        <Title>Edit Quiz</Title>
      </Group>

      {/* Quiz Settings */}
      <Paper withBorder shadow="md" p={30} radius="md" mb="lg">
        <Title order={4} mb="md">Quiz Settings</Title>
        <form onSubmit={form.onSubmit((values) => updateMutation.mutate(values))}>
          <Stack>
            <TextInput
              label="Title"
              placeholder="Enter quiz title"
              {...form.getInputProps('title')}
            />

            <Textarea
              label="Description"
              placeholder="Enter quiz description (optional)"
              rows={3}
              {...form.getInputProps('description')}
            />

            <Switch
              label="Make this quiz public"
              description="Public quizzes can be discovered and played by anyone"
              {...form.getInputProps('isPublic', { type: 'checkbox' })}
            />

            <Button type="submit" loading={updateMutation.isPending}>
              Save Changes
            </Button>
          </Stack>
        </form>
      </Paper>

      {/* Questions */}
      <Group justify="space-between" mb="md">
        <Title order={3}>Questions ({questions.length}/50)</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={handleAddQuestion}
          disabled={questions.length >= 50}
        >
          Add Question
        </Button>
      </Group>

      {questions.length === 0 ? (
        <Paper withBorder p="xl" ta="center">
          <Text c="dimmed" mb="md">No questions yet. Add your first question!</Text>
          <Button leftSection={<IconPlus size={16} />} onClick={handleAddQuestion}>
            Add Question
          </Button>
        </Paper>
      ) : (
        <Stack gap="md">
          {questions.map((question, index) => (
            <Card key={question.id || question._id} withBorder padding="md">
              <Group justify="space-between">
                <Group gap="xs" style={{ flex: 1 }}>
                  <IconGripVertical size={16} style={{ color: 'var(--mantine-color-dimmed)' }} />
                  <div style={{ flex: 1 }}>
                    <Text fw={500} lineClamp={1}>
                      {index + 1}. {question.text}
                    </Text>
                    <Group gap="xs" mt={4}>
                      <Badge size="xs" variant="light">{question.type}</Badge>
                      <Badge size="xs" variant="light">{question.options.length} options</Badge>
                      <Badge size="xs" variant="light">{question.timeLimit}s</Badge>
                      <Badge size="xs" variant="light">{question.points} pts</Badge>
                    </Group>
                  </div>
                </Group>

                <Group gap="xs">
                  <ActionIcon variant="subtle" onClick={() => handleEditQuestion(question)}>
                    <IconEdit size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => handleDeleteQuestion(question.id || question._id)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      {/* Question Modal */}
      <Modal
        opened={opened}
        onClose={close}
        title={editingQuestion ? 'Edit Question' : 'Add Question'}
        size="lg"
      >
        <QuestionForm
          quizId={id}
          question={editingQuestion}
          onSaved={handleQuestionSaved}
          onCancel={close}
        />
      </Modal>
    </Container>
  );
}
