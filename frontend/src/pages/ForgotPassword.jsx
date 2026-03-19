import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Paper, Title, TextInput, Button, Text, Anchor, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/authService';
import { emailValidation } from '../constants/validation';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [success, setSuccess] = useState(false);

  const form = useForm({
    initialValues: {
      email: '',
    },
    validate: {
      email: emailValidation,
    },
  });

  const forgotMutation = useMutation({
    mutationFn: (data) => authService.forgotPassword(data.email),
    onSuccess: () => setSuccess(true),
  });

  if (success) {
    return (
      <Container size={420} my={40}>
        <Title ta="center" mb="lg">{t('auth.forgotPasswordTitle')}</Title>
        <Paper withBorder shadow="md" p={30} radius="md">
          <Text ta="center" c="dimmed" mb="md">
            {t('auth.resetLinkSent')}
          </Text>
          <Anchor component={Link} to="/login" size="sm" display="block" ta="center">
            {t('auth.backToLogin')}
          </Anchor>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size={420} my={40}>
      <Title ta="center" mb="lg">{t('auth.forgotPasswordTitle')}</Title>

      <Paper withBorder shadow="md" p={30} radius="md">
        <Text c="dimmed" size="sm" ta="center" mb="md">
          Enter your email address and we'll send you a password reset link.
        </Text>

        <form onSubmit={form.onSubmit((values) => forgotMutation.mutate(values))}>
          <Stack>
            <TextInput
              label={t('auth.email')}
              placeholder="example@email.com"
              {...form.getInputProps('email')}
            />

            <Button type="submit" fullWidth loading={forgotMutation.isPending}>
              {t('auth.sendResetLink')}
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
