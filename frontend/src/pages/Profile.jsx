import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Stack, Group } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { showToast } from '../utils/toast';
import { usernameValidation, passwordValidation, requiredPasswordValidation, confirmPasswordValidation } from '../constants/validation';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Profile Form
  const profileForm = useForm({
    initialValues: {
      username: user?.username || '',
    },
    validate: {
      username: usernameValidation,
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data) => authService.updateProfile(data.username),
    onSuccess: (data) => {
      updateUser(data.user);
      showToast.success('Profile updated');
    },
  });

  // Password Form
  const passwordForm = useForm({
    initialValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
    validate: {
      currentPassword: requiredPasswordValidation,
      newPassword: passwordValidation,
      confirmNewPassword: confirmPasswordValidation('newPassword'),
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data) => authService.changePassword(data.currentPassword, data.newPassword),
    onSuccess: () => {
      passwordForm.reset();
      showToast.success('Password changed');
    },
  });

  // Delete Form
  const deleteForm = useForm({
    initialValues: {
      password: '',
    },
    validate: {
      password: requiredPasswordValidation,
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (data) => authService.deleteAccount(data.password),
    onSuccess: () => {
      navigate('/login');
    },
  });

  return (
    <Container size={600} my={40}>
      <Title mb="lg">Profile Settings</Title>

      {/* Profile Info Section */}
      <Paper withBorder shadow="md" p={30} radius="md" mb="lg">
        <Title order={3} mb="md">Profile Information</Title>
        <Text c="dimmed" size="sm" mb="md">Email: {user?.email}</Text>

        <form onSubmit={profileForm.onSubmit((values) => updateProfileMutation.mutate(values))}>
          <Stack>
            <TextInput
              label="Username"
              {...profileForm.getInputProps('username')}
            />

            <Button type="submit" loading={updateProfileMutation.isPending}>
              Update Profile
            </Button>
          </Stack>
        </form>
      </Paper>

      {/* Password Change Section */}
      <Paper withBorder shadow="md" p={30} radius="md" mb="lg">
        <Title order={3} mb="md">Change Password</Title>

        <form onSubmit={passwordForm.onSubmit((values) => changePasswordMutation.mutate(values))}>
          <Stack>
            <PasswordInput
              label="Current Password"
              {...passwordForm.getInputProps('currentPassword')}
            />

            <PasswordInput
              label="New Password"
              {...passwordForm.getInputProps('newPassword')}
            />

            <PasswordInput
              label="Confirm New Password"
              {...passwordForm.getInputProps('confirmNewPassword')}
            />

            <Button type="submit" loading={changePasswordMutation.isPending}>
              Change Password
            </Button>
          </Stack>
        </form>
      </Paper>

      {/* Delete Account Section */}
      <Paper withBorder shadow="md" p={30} radius="md" style={{ borderColor: 'var(--mantine-color-red-6)' }}>
        <Title order={3} mb="md" c="red">Danger Zone</Title>
        <Text c="dimmed" size="sm" mb="md">
          When you delete your account, all your data will be permanently deleted. This action cannot be undone.
        </Text>

        {!showDeleteConfirm ? (
          <Button color="red" variant="outline" onClick={() => setShowDeleteConfirm(true)}>
            Delete My Account
          </Button>
        ) : (
          <form onSubmit={deleteForm.onSubmit((values) => deleteAccountMutation.mutate(values))}>
            <Stack>
              <PasswordInput
                label="Enter your password to confirm"
                placeholder="Enter your password"
                {...deleteForm.getInputProps('password')}
              />

              <Group>
                <Button
                  variant="light"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    deleteForm.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button color="red" type="submit" loading={deleteAccountMutation.isPending}>
                  Permanently Delete Account
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Paper>
    </Container>
  );
}
