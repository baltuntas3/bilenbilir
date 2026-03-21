import { Link, useNavigate } from 'react-router-dom';
import { AppShell, Group, Button, Title, Container, Menu, ActionIcon, Avatar, Text } from '@mantine/core';
import { IconHome, IconUser, IconLogout, IconSettings, IconTrophy, IconSchool, IconChartBar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';

export default function Layout({ children }) {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between">
            <Title
              order={4}
              component={Link}
              to="/"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              Bilenbilir
            </Title>

            <Group gap="sm">
              <LanguageSwitcher />
              <ThemeToggle />

              {isAuthenticated ? (
                <Menu position="bottom-end" shadow="md">
                  <Menu.Target>
                    <ActionIcon variant="subtle" size="lg" radius="xl">
                      <Avatar size="sm" color="blue" radius="xl">
                        {user?.username?.charAt(0).toUpperCase()}
                      </Avatar>
                    </ActionIcon>
                  </Menu.Target>

                  <Menu.Dropdown>
                    <Menu.Label>
                      <Text size="sm" fw={500}>{user?.username}</Text>
                      <Text size="xs" c="dimmed">{user?.email}</Text>
                    </Menu.Label>
                    <Menu.Divider />
                    <Menu.Item
                      component={Link}
                      to="/"
                      leftSection={<IconHome size={14} />}
                    >
                      {t('nav.home')}
                    </Menu.Item>
                    <Menu.Item
                      component={Link}
                      to="/profile"
                      leftSection={<IconSettings size={14} />}
                    >
                      {t('nav.profileSettings')}
                    </Menu.Item>
                    <Menu.Item
                      component={Link}
                      to="/tournaments"
                      leftSection={<IconTrophy size={14} />}
                    >
                      Turnuvalar
                    </Menu.Item>
                    <Menu.Item
                      component={Link}
                      to="/classrooms"
                      leftSection={<IconSchool size={14} />}
                    >
                      Sınıflar
                    </Menu.Item>
                    <Menu.Item
                      component={Link}
                      to="/analytics"
                      leftSection={<IconChartBar size={14} />}
                    >
                      Analitik
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<IconLogout size={14} />}
                      onClick={handleLogout}
                    >
                      {t('auth.logout')}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              ) : (
                <>
                  <Button variant="subtle" component={Link} to="/login" size="sm">
                    {t('auth.signIn')}
                  </Button>
                  <Button component={Link} to="/register" size="sm">
                    {t('auth.signUp')}
                  </Button>
                </>
              )}
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
