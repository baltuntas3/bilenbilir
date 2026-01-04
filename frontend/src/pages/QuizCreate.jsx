import { useNavigate } from 'react-router-dom';
import { Container, Title, Paper, TextInput, Textarea, Switch, Button, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { quizService } from '../services/quizService';
import { showToast } from '../utils/toast';
import { quizTitleValidation, quizDescriptionValidation } from '../constants/validation';

export default function QuizCreate() {
  const navigate = useNavigate();

  const form = useForm({
    initialValues: {
      title: '',
      description: '',
      isPublic: false,
    },
    validate: {
      title: quizTitleValidation,
      description: quizDescriptionValidation,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => quizService.create(data.title, data.description, data.isPublic),
    onSuccess: (data) => {
      showToast.success('Quiz created');
      navigate(`/quizzes/${data.id || data._id}/edit`);
    },
  });

  return (
    <Container size={600} my={40}>
      <Title mb="lg">Create Quiz</Title>

      <Paper withBorder shadow="md" p={30} radius="md">
        <form onSubmit={form.onSubmit((values) => createMutation.mutate(values))}>
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

            <Button type="submit" loading={createMutation.isPending}>
              Create Quiz
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
