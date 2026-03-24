import { Paper, Text, Title, Badge, Group, Image, Stack, Center, Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export default function QuestionDisplay({
  question,
  questionIndex,
  totalQuestions,
  showImage = true,
  isLightning = false,
}) {
  const { t } = useTranslation();

  if (!question) return null;

  return (
    <Stack gap="md" className="fade-slide-in">
      {isLightning && (
        <Badge
          size="lg"
          variant="filled"
          color="violet"
          style={{
            alignSelf: 'center',
            fontFamily: 'var(--theme-font-display)',
            fontSize: '0.5rem',
            boxShadow: 'var(--theme-glow-accent)',
          }}
        >
          {'\u26A1'} {t('game.lightningActive')}
        </Badge>
      )}

      <Group justify="space-between" align="center">
        <Badge
          size="lg"
          variant="light"
          
          style={{
            fontFamily: 'var(--theme-font-display)',
            fontSize: '0.45rem',
          }}
        >
          {t('game.questionOf', { current: questionIndex + 1, total: totalQuestions })}
        </Badge>
        <Badge
          size="lg"
          variant="light"
          color="yellow"
          style={{
            fontFamily: 'var(--theme-font-display)',
            fontSize: '0.45rem',
          }}
        >
          {question.points} {t('game.pts')}
        </Badge>
      </Group>

      <Paper
        p="lg"
        radius="md"
        style={{
          background: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative corner accents */}
        <Box
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 20,
            height: 20,
            borderTop: '2px solid var(--theme-primary)',
            borderLeft: '2px solid var(--theme-primary)',
          }}
        />
        <Box
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 20,
            height: 20,
            borderTop: '2px solid var(--theme-primary)',
            borderRight: '2px solid var(--theme-primary)',
          }}
        />
        <Box
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: 20,
            height: 20,
            borderBottom: '2px solid var(--theme-primary)',
            borderLeft: '2px solid var(--theme-primary)',
          }}
        />
        <Box
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 20,
            height: 20,
            borderBottom: '2px solid var(--theme-primary)',
            borderRight: '2px solid var(--theme-primary)',
          }}
        />

        <Stack gap="md">
          <Title
            order={3}
            ta="center"
            style={{
              wordBreak: 'break-word',
              color: 'var(--theme-text)',
              lineHeight: 1.5,
            }}
          >
            {question.text}
          </Title>

          {showImage && question.imageUrl && (
            <Center>
              <Image
                src={question.imageUrl}
                alt="Question image"
                maw={400}
                radius="md"
                fallbackSrc="https://placehold.co/400x300?text=Image"
                style={{
                  border: '1px solid var(--theme-border)',
                }}
              />
            </Center>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
