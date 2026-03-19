import { Link, useNavigate } from 'react-router-dom';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Anchor, Group, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { emailValidation, passwordValidation, usernameValidation, confirmPasswordValidation } from '../constants/validation';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const form = useForm({
    initialValues: {
      email: '',
      username: '',
      password: '',
      confirmPassword: '',
    },
    validate: {
      email: emailValidation,
      username: usernameValidation,
      password: passwordValidation,
      confirmPassword: confirmPasswordValidation('password'),
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data) => authService.register(data.email, data.password, data.username),
    onSuccess: (data) => {
      login(data.token, data.user);
      navigate('/');
    },
  });

  return (
    <Container size={420} my={40}>
      <Title ta="center" mb="lg">{t('auth.createAccount')}</Title>

      <Paper withBorder shadow="md" p={30} radius="md">
        <form onSubmit={form.onSubmit((values) => registerMutation.mutate(values))}>
          <Stack>
            <TextInput
              label={t('auth.email')}
              placeholder="example@email.com"
              {...form.getInputProps('email')}
            />

            <TextInput
              label={t('auth.username')}
              placeholder="username"
              {...form.getInputProps('username')}
            />

            <PasswordInput
              label={t('auth.password')}
              placeholder="••••••••"
              {...form.getInputProps('password')}
            />

            <PasswordInput
              label={t('auth.confirmPassword')}
              placeholder="••••••••"
              {...form.getInputProps('confirmPassword')}
            />

            <Button type="submit" fullWidth loading={registerMutation.isPending}>
              {t('auth.signUp')}
            </Button>
          </Stack>
        </form>

        <Group justify="center" mt="md" gap="xs">
          <Text size="sm">{t('auth.hasAccount')}</Text>
          <Anchor component={Link} to="/login" size="sm">
            {t('auth.signIn')}
          </Anchor>
        </Group>
      </Paper>
    </Container>
  );
}
