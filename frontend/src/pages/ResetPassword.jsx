import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Container, Paper, Title, PasswordInput, Button, Text, Anchor, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/authService';
import { showToast } from '../utils/toast';
import { passwordValidation, confirmPasswordValidation } from '../constants/validation';

export default function ResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [success, setSuccess] = useState(false);

  const form = useForm({
    initialValues: {
      password: '',
      confirmPassword: '',
    },
    validate: {
      password: passwordValidation,
      confirmPassword: confirmPasswordValidation('password'),
    },
  });

  const resetMutation = useMutation({
    mutationFn: (data) => authService.resetPassword(token, data.password),
    onSuccess: () => {
      setSuccess(true);
      showToast.success(t('auth.resetSuccess'));
      setTimeout(() => navigate('/login'), 3000);
    },
  });

  if (!token) {
    return (
      <Container size={420} my={40}>
        <Title ta="center" mb="lg">{t('auth.invalidToken')}</Title>
        <Paper withBorder shadow="md" p={30} radius="md">
          <Text ta="center" c="red" mb="md">
            {t('auth.invalidToken')}
          </Text>
          <Anchor component={Link} to="/forgot-password" size="sm" display="block" ta="center">
            {t('auth.sendResetLink')}
          </Anchor>
        </Paper>
      </Container>
    );
  }

  if (success) {
    return (
      <Container size={420} my={40}>
        <Title ta="center" mb="lg">{t('auth.resetPasswordTitle')}</Title>
        <Paper withBorder shadow="md" p={30} radius="md">
          <Text ta="center" c="dimmed" mb="md">
            {t('auth.resetSuccess')}
          </Text>
          <Anchor component={Link} to="/login" size="sm" display="block" ta="center">
            {t('auth.signIn')}
          </Anchor>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size={420} my={40}>
      <Title ta="center" mb="lg">{t('auth.resetPasswordTitle')}</Title>

      <Paper withBorder shadow="md" p={30} radius="md">
        <form onSubmit={form.onSubmit((values) => resetMutation.mutate(values))}>
          <Stack>
            <PasswordInput
              label={t('auth.newPasswordLabel')}
              placeholder="••••••••"
              {...form.getInputProps('password')}
            />

            <PasswordInput
              label={t('auth.confirmPasswordLabel')}
              placeholder="••••••••"
              {...form.getInputProps('confirmPassword')}
            />

            <Button type="submit" fullWidth loading={resetMutation.isPending}>
              {t('auth.resetPassword')}
            </Button>
          </Stack>
        </form>

        <Anchor component={Link} to="/login" size="sm" display="block" ta="center" mt="md">
          {t('auth.backToLogin')}
        </Anchor>
      </Paper>
    </Container>
  );
}
