import { useNavigate } from 'react-router-dom';
import { Container, Title, Paper, TextInput, Textarea, Switch, Button, Stack, Select, TagsInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { quizService } from '../services/quizService';
import { showToast } from '../utils/toast';
import { quizTitleValidation, quizDescriptionValidation, QUIZ_CATEGORIES, quizTagsValidation } from '../constants/validation';

export default function QuizCreate() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const form = useForm({
    initialValues: {
      title: '',
      description: '',
      isPublic: false,
      category: 'Diğer',
      tags: [],
    },
    validate: {
      title: quizTitleValidation,
      description: quizDescriptionValidation,
      tags: quizTagsValidation,
    },
  });

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data) => quizService.create(data.title, data.description, data.isPublic, data.category, data.tags),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
      showToast.success('Quiz created');
      navigate(`/quizzes/${data.id || data._id}/edit`);
    },
  });

  return (
    <Container size={600} my={40}>
      <Title mb="lg">{t('nav.createQuiz')}</Title>

      <Paper withBorder shadow="md" p={30} radius="md">
        <form onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
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

            <Button type="submit" loading={createMutation.isPending}>
              {t('nav.createQuiz')}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
