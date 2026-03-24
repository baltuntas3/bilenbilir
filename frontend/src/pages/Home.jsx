import { Link } from 'react-router-dom';
import { Container, Title, Text, Stack, SimpleGrid, Card, Group, Box, ThemeIcon } from '@mantine/core';
import { IconSearch, IconPlus, IconList, IconUsers, IconChartBar } from '@tabler/icons-react';
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

export default function Home() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { colorScheme } = useMantineColorScheme();
  const isLight = colorScheme === 'light';

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
