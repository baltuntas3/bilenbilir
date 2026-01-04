import { Link, useNavigate } from 'react-router-dom';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Anchor, Group, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { emailValidation, requiredPasswordValidation } from '../constants/validation';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
    },
    validate: {
      email: emailValidation,
      password: requiredPasswordValidation,
    },
  });

  const loginMutation = useMutation({
    mutationFn: (data) => authService.login(data.email, data.password),
    onSuccess: (data) => {
      login(data.token, data.user);
      navigate('/');
    },
  });

  return (
    <Container size={420} my={40}>
      <Title ta="center" mb="lg">Sign In</Title>

      <Paper withBorder shadow="md" p={30} radius="md">
        <form onSubmit={form.onSubmit((values) => loginMutation.mutate(values))}>
          <Stack>
            <TextInput
              label="Email"
              placeholder="example@email.com"
              {...form.getInputProps('email')}
            />

            <PasswordInput
              label="Password"
              placeholder="••••••••"
              {...form.getInputProps('password')}
            />

            <Button type="submit" fullWidth loading={loginMutation.isPending}>
              Sign In
            </Button>
          </Stack>
        </form>

        <Group justify="center" mt="md" gap="xs">
          <Anchor component={Link} to="/forgot-password" size="sm">
            Forgot Password
          </Anchor>
          <Text size="sm">•</Text>
          <Anchor component={Link} to="/register" size="sm">
            Create Account
          </Anchor>
        </Group>
      </Paper>
    </Container>
  );
}
