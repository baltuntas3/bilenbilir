import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Container, Title, Paper, TextInput, Textarea, Switch, Button, Stack, Group, Card, Text, Badge, ActionIcon, Modal, Center, Loader, Select, TagsInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IconPlus, IconEdit, IconTrash, IconArrowLeft, IconGripVertical } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { quizService } from '../services/quizService';
import { showToast } from '../utils/toast';
import { quizTitleValidation, quizDescriptionValidation, QUIZ_CATEGORIES, quizTagsValidation } from '../constants/validation';
import QuestionForm from '../components/QuestionForm';

export default function QuizEdit() {
  const { t } = useTranslation();
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
      category: quiz?.category || 'Diğer',
      tags: quiz?.tags || [],
    },
    validate: {
      title: quizTitleValidation,
      description: quizDescriptionValidation,
      tags: quizTagsValidation,
    },
  });

  // Update form when quiz data loads
  useEffect(() => {
    if (quiz) {
      form.setValues({
        title: quiz.title || '',
        description: quiz.description || '',
        isPublic: quiz.isPublic || false,
        category: quiz.category || 'Diğer',
        tags: quiz.tags || [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz]);

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
        <Title>{t('common.edit')} Quiz</Title>
      </Group>

      {/* Quiz Settings */}
      <Paper withBorder shadow="md" p={30} radius="md" mb="lg">
        <Title order={4} mb="md">Quiz Settings</Title>
        <form onSubmit={form.onSubmit((values) => updateMutation.mutate(values))}>
          <Stack>
            <TextInput
              label={t('quiz.title')}
              placeholder={t('quiz.enterTitle')}
              {...form.getInputProps('title')}
            />

            <Textarea
              label={t('quiz.description')}
              placeholder={t('quiz.enterDescription')}
              rows={3}
              {...form.getInputProps('description')}
            />

            <Select
              label={t('quiz.category')}
              placeholder={t('quiz.selectCategory')}
              data={QUIZ_CATEGORIES}
              {...form.getInputProps('category')}
            />

            <TagsInput
              label={t('quiz.tags')}
              placeholder={t('quiz.tagsPlaceholder')}
              description={t('quiz.tagsDescription')}
              maxTags={5}
              {...form.getInputProps('tags')}
            />

            <Switch
              label={t('quiz.makePublic')}
              description={t('quiz.makePublicDesc')}
              {...form.getInputProps('isPublic', { type: 'checkbox' })}
            />

            <Button type="submit" loading={updateMutation.isPending}>
              {t('common.save')}
            </Button>
          </Stack>
        </form>
      </Paper>

      {/* Questions */}
      <Group justify="space-between" mb="md">
        <Title order={3}>{t('quiz.questions')} ({questions.length}/50)</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={handleAddQuestion}
          disabled={questions.length >= 50}
        >
          {t('quiz.addQuestion')}
        </Button>
      </Group>

      {questions.length === 0 ? (
        <Paper withBorder p="xl" ta="center">
          <Text c="dimmed" mb="md">No questions yet. Add your first question!</Text>
          <Button leftSection={<IconPlus size={16} />} onClick={handleAddQuestion}>
            {t('quiz.addQuestion')}
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
        title={editingQuestion ? t('quiz.editQuestion') : t('quiz.addQuestion')}
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
