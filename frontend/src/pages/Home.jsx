import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Title, Text, Stack, SimpleGrid, Card, Group, Box, ThemeIcon, PinInput, Button, Divider } from '@mantine/core';
import { IconSearch, IconPlus, IconList, IconUsers, IconChartBar, IconLogin } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useMantineColorScheme } from '@mantine/core';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

const CARD_CONFIGS = [
  {
    to: '/join',
    icon: IconUsers,
    color: '--theme-primary',
    glow: '--theme-glow-primary',
    titleKey: 'home.joinGame',
    descKey: 'home.joinGameDesc',
    delay: 1,
  },
  {
    to: '/quizzes',
    icon: IconSearch,
    color: '--theme-secondary',
    glow: '--theme-glow-secondary',
    titleKey: 'home.exploreQuizzes',
    descKey: 'home.exploreQuizzesDesc',
    delay: 2,
  },
  {
    to: '/my-quizzes',
    icon: IconList,
    color: '--theme-accent',
    glow: '--theme-glow-accent',
    titleKey: 'home.myQuizzes',
    descKey: 'home.myQuizzesDesc',
    delay: 3,
  },
  {
    to: '/quizzes/create',
    icon: IconPlus,
    color: '--theme-success',
    glow: '--theme-glow-success',
    titleKey: 'home.createQuiz',
    descKey: 'home.createQuizDesc',
    delay: 4,
  },
  {
    to: '/stats',
    icon: IconChartBar,
    color: '--theme-warning',
    glow: '--theme-glow-warning',
    titleKey: 'home.gameStats',
    descKey: 'home.gameStatsDesc',
    delay: 5,
  },
];

function AuthenticatedHome({ user, t, isLight }) {
  return (
    <Container size="lg" my={40} className="fade-slide-in">
      <Stack align="center" gap="md" mb="xl">
        <Logo size={56} />
        <Title
          ta="center"
          className={`theme-text-primary ${isLight ? 'gold-shimmer' : ''}`}
          style={{ fontSize: 'clamp(1rem, 4vw, 1.8rem)' }}
        >
          {t('home.welcome', { username: user?.username })}
        </Title>
        <Text c="dimmed" ta="center" size="lg" style={{ color: 'var(--theme-text-dim)' }}>
          {t('home.subtitle')}
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        {CARD_CONFIGS.map(({ to, icon: Icon, color, glow, titleKey, descKey, delay }) => (
          <Card
            key={to}
            component={Link}
            to={to}
            padding="lg"
            className={`slide-up slide-up-d${delay}`}
            style={{
              textDecoration: 'none',
              background: 'var(--theme-surface)',
              border: `1px solid var(--theme-border)`,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              overflow: 'visible',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = `var(${color})`;
              e.currentTarget.style.boxShadow = `var(${glow})`;
              e.currentTarget.style.transform = 'translateY(-4px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--theme-border)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <Group>
              <ThemeIcon
                size={50}
                radius="md"
                variant="light"

                style={{
                  border: `1px solid var(${color})`,
                  boxShadow: `var(${glow})`,
                }}
              >
                <Icon size={28} style={{ color: `var(${color})` }} />
              </ThemeIcon>
              <div style={{ flex: 1 }}>
                <Text fw={700} size="lg" style={{ color: `var(${color})` }}>
                  {t(titleKey)}
                </Text>
                <Text size="sm" style={{ color: 'var(--theme-text-dim)' }}>
                  {t(descKey)}
                </Text>
              </div>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Container>
  );
}

function LandingPage({ t, isLight }) {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');

  const handlePinSubmit = () => {
    if (pin.length === 6) {
      navigate(`/join?pin=${pin}`);
    }
  };

  return (
    <Container size="xs" py={60} className="fade-slide-in">
      <Stack align="center" gap="xl">
        <Logo size={72} />
        <Title
          ta="center"
          className={`theme-text-primary ${isLight ? 'gold-shimmer' : ''}`}
          style={{ fontSize: 'clamp(1.2rem, 5vw, 2rem)' }}
        >
          {t('home.heroTitle')}
        </Title>
        <Text ta="center" size="lg" style={{ color: 'var(--theme-text-dim)' }}>
          {t('home.heroSubtitle')}
        </Text>

        <Card
          padding="xl"
          radius="md"
          style={{
            width: '100%',
            maxWidth: 400,
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-primary)',
            boxShadow: 'var(--theme-glow-primary)',
          }}
        >
          <Stack align="center" gap="md">
            <Box
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--theme-primary)',
                boxShadow: 'var(--theme-glow-primary)',
                background: 'rgba(0, 240, 255, 0.05)',
              }}
            >
              <IconUsers size={32} style={{ color: 'var(--theme-primary)' }} />
            </Box>

            <Text fw={600} size="lg" style={{ color: 'var(--theme-primary)' }}>
              {t('home.joinGame')}
            </Text>

            <PinInput
              length={6}
              size="md"
              type="number"
              value={pin}
              onChange={setPin}
              onComplete={handlePinSubmit}
              placeholder=""
              styles={{
                root: { gap: 6 },
                input: {
                  width: 42,
                  minWidth: 0,
                  background: 'var(--theme-bg)',
                  border: '1px solid var(--theme-primary)',
                  color: 'var(--theme-primary)',
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '1rem',
                  caretColor: 'var(--theme-primary)',
                  '&:focus': {
                    borderColor: 'var(--theme-primary)',
                    boxShadow: 'var(--theme-glow-primary)',
                  },
                },
              }}
            />

            <Button
              fullWidth
              size="md"
              onClick={handlePinSubmit}
              disabled={pin.length !== 6}
              style={{
                boxShadow: pin.length === 6 ? 'var(--theme-glow-primary)' : 'none',
                transition: 'box-shadow 0.3s ease',
              }}
            >
              {t('home.joinGame')}
            </Button>
          </Stack>
        </Card>

        <Divider
          label={t('home.orSignIn')}
          labelPosition="center"
          color="var(--theme-border)"
          styles={{ label: { color: 'var(--theme-text-dim)' } }}
          style={{ width: '100%', maxWidth: 400 }}
        />

        <Group gap="sm">
          <Button
            variant="light"
            component={Link}
            to="/login"
            leftSection={<IconLogin size={16} />}
          >
            {t('auth.signIn')}
          </Button>
          <Button
            variant="subtle"
            component={Link}
            to="/register"
          >
            {t('auth.signUp')}
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const { t } = useTranslation();
  const { colorScheme } = useMantineColorScheme();
  const isLight = colorScheme === 'light';

  if (isAuthenticated) {
    return <AuthenticatedHome user={user} t={t} isLight={isLight} />;
  }

  return <LandingPage t={t} isLight={isLight} />;
}
