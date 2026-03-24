import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AppShell,
  Group,
  Button,
  Title,
  Container,
  Menu,
  ActionIcon,
  Avatar,
  Text,
  Burger,
  Drawer,
  Stack,
  Divider,
  NavLink,
  Box,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
  IconHome,
  IconUser,
  IconLogout,
  IconSettings,
  IconTrophy,
  IconSchool,
  IconChartBar,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useMantineColorScheme } from '@mantine/core';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';
import Logo from './Logo';

export default function Layout({ children, onToggleTheme, colorScheme: _cs }) {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] = useDisclosure(false);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { colorScheme } = useMantineColorScheme();
  const isLight = colorScheme === 'light';

  const handleLogout = async () => {
    await logout();
    closeDrawer();
    navigate('/login');
  };

  const navItems = [
    { to: '/', label: t('nav.home'), icon: IconHome },
    { to: '/profile', label: t('nav.profileSettings'), icon: IconSettings },
    { to: '/tournaments', label: t('nav.tournaments'), icon: IconTrophy },
    { to: '/classrooms', label: t('nav.classrooms'), icon: IconSchool },
    { to: '/analytics', label: t('nav.analytics'), icon: IconChartBar },
  ];

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header
        className={isLight ? 'medieval-header' : ''}
        style={{
          background: 'var(--theme-surface)',
          borderBottom: '1px solid var(--theme-border)',
        }}
      >
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between">
            <Group gap="xs" component={Link} to="/" style={{ textDecoration: 'none' }}>
              <Logo size={isMobile ? 28 : 34} />
              <Title
                order={4}
                className={`theme-text-primary display-font display-font-sm ${isLight ? 'gold-shimmer' : ''}`}
                style={{
                  textDecoration: 'none',
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: isMobile ? '0.75rem' : '1rem',
                }}
              >
                BILENBILIR
              </Title>
            </Group>

            {/* Desktop navigation */}
            {!isMobile && (
              <Group gap="sm">
                <LanguageSwitcher />
                <ThemeToggle onToggle={onToggleTheme} />

                {isAuthenticated ? (
                  <Menu position="bottom-end" shadow="md">
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        size="lg"
                        radius="xl"
                        style={{ border: '1px solid var(--theme-primary)' }}
                      >
                        <Avatar size="sm"  radius="xl">
                          {user?.username?.charAt(0).toUpperCase()}
                        </Avatar>
                      </ActionIcon>
                    </Menu.Target>

                    <Menu.Dropdown
                      style={{
                        background: 'var(--theme-surface)',
                        border: '1px solid var(--theme-border)',
                      }}
                    >
                      <Menu.Label>
                        <Text size="sm" fw={500}>{user?.username}</Text>
                        <Text size="xs" c="dimmed">{user?.email}</Text>
                      </Menu.Label>
                      <Menu.Divider />
                      {navItems.map((item) => (
                        <Menu.Item
                          key={item.to}
                          component={Link}
                          to={item.to}
                          leftSection={<item.icon size={14} />}
                        >
                          {item.label}
                        </Menu.Item>
                      ))}
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
                    <Button
                      variant="subtle"
                      component={Link}
                      to="/login"
                      size="sm"
                      
                    >
                      {t('auth.signIn')}
                    </Button>
                    <Button
                      component={Link}
                      to="/register"
                      size="sm"
                      
                      style={{ boxShadow: 'var(--theme-glow-primary)' }}
                    >
                      {t('auth.signUp')}
                    </Button>
                  </>
                )}
              </Group>
            )}

            {/* Mobile hamburger */}
            {isMobile && (
              <Burger
                opened={drawerOpened}
                onClick={toggleDrawer}
                size="sm"
                color="var(--theme-primary)"
              />
            )}
          </Group>
        </Container>
      </AppShell.Header>

      {/* Mobile drawer */}
      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        size="75%"
        padding="md"
        title={
          <Text
            className="theme-text-primary"
            style={{ fontFamily: 'var(--theme-font-display)', fontSize: '0.7rem' }}
          >
            {t('nav.menu')}
          </Text>
        }
        styles={{
          content: { background: 'var(--theme-surface)' },
          header: { background: 'var(--theme-surface)', borderBottom: '1px solid var(--theme-border)' },
        }}
        zIndex={10000}
      >
        <Stack gap="xs">
          {isAuthenticated && (
            <Box
              p="sm"
              mb="xs"
              style={{
                border: '1px solid var(--theme-border)',
                borderRadius: 8,
                background: 'var(--theme-bg)',
              }}
            >
              <Group gap="sm">
                <Avatar size="md"  radius="xl">
                  {user?.username?.charAt(0).toUpperCase()}
                </Avatar>
                <div>
                  <Text size="sm" fw={500}>{user?.username}</Text>
                  <Text size="xs" c="dimmed">{user?.email}</Text>
                </div>
              </Group>
            </Box>
          )}

          {isAuthenticated ? (
            <>
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  component={Link}
                  to={item.to}
                  label={item.label}
                  leftSection={<item.icon size={18} color="var(--theme-primary)" />}
                  onClick={closeDrawer}
                  style={{ borderRadius: 8 }}
                />
              ))}

              <Divider my="sm" color="var(--theme-border)" />

              <Group gap="sm" justify="center">
                <LanguageSwitcher />
                <ThemeToggle onToggle={onToggleTheme} />
              </Group>

              <Divider my="sm" color="var(--theme-border)" />

              <NavLink
                label={t('auth.logout')}
                leftSection={<IconLogout size={18} />}
                onClick={handleLogout}
                color="red"
                style={{ borderRadius: 8 }}
              />
            </>
          ) : (
            <>
              <Group gap="sm" justify="center" mb="sm">
                <LanguageSwitcher />
                <ThemeToggle onToggle={onToggleTheme} />
              </Group>
              <Button
                fullWidth
                variant="subtle"
                component={Link}
                to="/login"
                onClick={closeDrawer}
                
              >
                {t('auth.signIn')}
              </Button>
              <Button
                fullWidth
                component={Link}
                to="/register"
                onClick={closeDrawer}
                
                style={{ boxShadow: 'var(--theme-glow-primary)' }}
              >
                {t('auth.signUp')}
              </Button>
            </>
          )}
        </Stack>
      </Drawer>

      <AppShell.Main style={{ background: 'var(--theme-bg)' }}>
        <div className="fade-slide-in">
          {children}
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
