import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Container, Paper, Title, PasswordInput, Button, Text, Anchor, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { authService } from '../services/authService';
import { showToast } from '../utils/toast';
import { passwordValidation, confirmPasswordValidation } from '../constants/validation';

export default function ResetPassword() {
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
      showToast.success('Password changed successfully');
      setTimeout(() => navigate('/login'), 3000);
    },
  });

  if (!token) {
    return (
      <Container size={420} my={40}>
        <Title ta="center" mb="lg">Invalid Link</Title>
        <Paper withBorder shadow="md" p={30} radius="md">
          <Text ta="center" c="red" mb="md">
            The password reset link is invalid or missing.
          </Text>
          <Anchor component={Link} to="/forgot-password" size="sm" display="block" ta="center">
            Request New Link
          </Anchor>
        </Paper>
      </Container>
    );
  }

  if (success) {
    return (
      <Container size={420} my={40}>
        <Title ta="center" mb="lg">Password Reset</Title>
        <Paper withBorder shadow="md" p={30} radius="md">
          <Text ta="center" c="dimmed" mb="md">
            Your password has been changed successfully. Redirecting to sign in...
          </Text>
          <Anchor component={Link} to="/login" size="sm" display="block" ta="center">
            Sign In Now
          </Anchor>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size={420} my={40}>
      <Title ta="center" mb="lg">Set New Password</Title>

      <Paper withBorder shadow="md" p={30} radius="md">
        <form onSubmit={form.onSubmit((values) => resetMutation.mutate(values))}>
          <Stack>
            <PasswordInput
              label="New Password"
              placeholder="••••••••"
              {...form.getInputProps('password')}
            />

            <PasswordInput
              label="Confirm Password"
              placeholder="••••••••"
              {...form.getInputProps('confirmPassword')}
            />

            <Button type="submit" fullWidth loading={resetMutation.isPending}>
              Change Password
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
