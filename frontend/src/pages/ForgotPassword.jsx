import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Paper, Title, TextInput, Button, Text, Anchor, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { authService } from '../services/authService';
import { emailValidation } from '../constants/validation';

export default function ForgotPassword() {
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
        <Title ta="center" mb="lg">Email Sent</Title>
        <Paper withBorder shadow="md" p={30} radius="md">
          <Text ta="center" c="dimmed" mb="md">
            If an account exists with this email address, a password reset link has been sent.
          </Text>
          <Anchor component={Link} to="/login" size="sm" display="block" ta="center">
            Back to Sign In
          </Anchor>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size={420} my={40}>
      <Title ta="center" mb="lg">Forgot Password</Title>

      <Paper withBorder shadow="md" p={30} radius="md">
        <Text c="dimmed" size="sm" ta="center" mb="md">
          Enter your email address and we'll send you a password reset link.
        </Text>

        <form onSubmit={form.onSubmit((values) => forgotMutation.mutate(values))}>
          <Stack>
            <TextInput
              label="Email"
              placeholder="example@email.com"
              {...form.getInputProps('email')}
            />

            <Button type="submit" fullWidth loading={forgotMutation.isPending}>
              Send Reset Link
            </Button>
          </Stack>
        </form>

        <Anchor component={Link} to="/login" size="sm" display="block" ta="center" mt="md">
          Back to Sign In
        </Anchor>
      </Paper>
    </Container>
  );
}
