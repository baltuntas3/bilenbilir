import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Stack, Group } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { showToast } from '../utils/toast';
import { usernameValidation, passwordValidation, requiredPasswordValidation, confirmPasswordValidation } from '../constants/validation';

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
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
    onSuccess: async () => {
      await logout();
      navigate('/login');
    },
  });

  return (
    <Container size={600} my={40}>
      <Title mb="lg">{t('profile.title')}</Title>

      {/* Profile Info Section */}
      <Paper withBorder shadow="md" p={30} radius="md" mb="lg">
        <Title order={3} mb="md">{t('auth.profileInfo')}</Title>
        <Text c="dimmed" size="sm" mb="md">{t('auth.email')}: {user?.email}</Text>

        <form onSubmit={profileForm.onSubmit((values) => updateProfileMutation.mutate(values))}>
          <Stack>
            <TextInput
              label={t('auth.username')}
              {...profileForm.getInputProps('username')}
            />

            <Button type="submit" loading={updateProfileMutation.isPending}>
              {t('auth.updateProfile')}
            </Button>
          </Stack>
        </form>
      </Paper>

      {/* Password Change Section */}
      <Paper withBorder shadow="md" p={30} radius="md" mb="lg">
        <Title order={3} mb="md">{t('auth.changePassword')}</Title>

        <form onSubmit={passwordForm.onSubmit((values) => changePasswordMutation.mutate(values))}>
          <Stack>
            <PasswordInput
              label={t('auth.currentPassword')}
              {...passwordForm.getInputProps('currentPassword')}
            />

            <PasswordInput
              label={t('auth.newPassword')}
              {...passwordForm.getInputProps('newPassword')}
            />

            <PasswordInput
              label={t('auth.confirmNewPassword')}
              {...passwordForm.getInputProps('confirmNewPassword')}
            />

            <Button type="submit" loading={changePasswordMutation.isPending}>
              {t('auth.changePassword')}
            </Button>
          </Stack>
        </form>
      </Paper>

      {/* Delete Account Section */}
      <Paper withBorder shadow="md" p={30} radius="md" style={{ borderColor: 'var(--mantine-color-red-6)' }}>
        <Title order={3} mb="md" c="red">{t('profile.dangerZone')}</Title>
        <Text c="dimmed" size="sm" mb="md">
          {t('profile.dangerZoneDesc')}
        </Text>

        {!showDeleteConfirm ? (
          <Button color="red" variant="outline" onClick={() => setShowDeleteConfirm(true)}>
            {t('profile.deleteMyAccount')}
          </Button>
        ) : (
          <form onSubmit={deleteForm.onSubmit((values) => deleteAccountMutation.mutate(values))}>
            <Stack>
              <PasswordInput
                label={t('auth.enterPasswordToConfirm')}
                placeholder={t('auth.enterPassword')}
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
                  {t('common.cancel')}
                </Button>
                <Button color="red" type="submit" loading={deleteAccountMutation.isPending}>
                  {t('profile.permanentlyDelete')}
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Paper>
    </Container>
  );
}
