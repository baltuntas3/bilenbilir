import { Link, useParams } from 'react-router-dom';
import { Container, Title, Paper, Text, Group, Badge, Button, Stack, Card, Center, Loader, TextInput, CopyButton, ActionIcon, Tooltip } from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IconEdit, IconPlayerPlay, IconDownload, IconShare, IconCheck, IconCopy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { quizService } from '../services/quizService';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../utils/toast';
import StarRating from '../components/StarRating';

export default function QuizDetail() {
  const { id, slug } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Determine if loading by slug or by id
  const isSlugMode = !!slug && !id;
  const queryKey = isSlugMode ? ['quiz', 'slug', slug] : ['quiz', id];

  const { data: quiz, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => isSlugMode ? quizService.getBySlug(slug) : quizService.getById(id),
  });

  const quizId = quiz?.id || quiz?._id || id;

  const { data: questions = [] } = useQuery({
    queryKey: ['quiz', quizId, 'questions'],
    queryFn: () => quizService.getQuestions(quizId),
    enabled: !!quizId && !!quiz,
  });

  const { data: ratingData } = useQuery({
    queryKey: ['quiz', quizId, 'rating'],
    queryFn: () => quizService.getQuizRating(quizId),
    enabled: !!quizId && !!quiz,
  });

  const rateMutation = useMutation({
    mutationFn: (rating) => quizService.rateQuiz(quizId, rating),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', quizId, 'rating'] });
      queryClient.invalidateQueries({ queryKey: queryKey });
      showToast.success(t('quiz.ratingSubmitted', 'Rating submitted'));
    },
    onError: () => {
      showToast.error(t('common.error'));
    },
  });

  if (isLoading) {
    return (
      <Center py="xl" mt={100}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (error) {
    return (
      <Container size="lg" my={40}>
        <Paper withBorder p="xl" ta="center">
          <Text c="red" mb="md">Failed to load quiz</Text>
          <Button component={Link} to="/quizzes">Back to Quizzes</Button>
        </Paper>
      </Container>
    );
  }

  const isOwner = user && quiz?.createdBy === user.id;
  const shareUrl = quiz?.slug ? `${window.location.origin}/quiz/share/${quiz.slug}` : null;

  const handleExport = async () => {
    try {
      const exportData = await quizService.export(quizId);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${quiz.title.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast.success('Quiz exported');
    } catch {
      showToast.error('Failed to export quiz');
    }
  };

  const handleRate = (value) => {
    if (!user) {
      showToast.error(t('auth.loginRequired', 'Please login to rate'));
      return;
    }
    rateMutation.mutate(value);
  };

  return (
    <Container size="lg" my={40}>
      <Paper withBorder shadow="md" p={30} radius="md" mb="lg">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={2}>{quiz.title}</Title>
            <Group gap="xs" mt="xs">
              <Badge color={quiz.isPublic ? 'green' : 'gray'}>
                {quiz.isPublic ? 'Public' : 'Private'}
              </Badge>
              {quiz.category && quiz.category !== 'Diğer' && (
                <Badge color="violet" variant="light">{quiz.category}</Badge>
              )}
              <Badge color="blue">{questions.length} questions</Badge>
              <Text size="sm" c="dimmed">Played {quiz.playCount || 0} times</Text>
            </Group>
            {quiz.tags && quiz.tags.length > 0 && (
              <Group gap={4} mt="xs">
                {quiz.tags.map((tag) => (
                  <Badge key={tag} size="sm" variant="outline" color="gray">{tag}</Badge>
                ))}
              </Group>
            )}
          </div>
          <Group>
            {shareUrl && (
              <CopyButton value={shareUrl}>
                {({ copied, copy }) => (
                  <Button
                    variant="light"
                    color={copied ? 'teal' : 'blue'}
                    leftSection={copied ? <IconCheck size={16} /> : <IconShare size={16} />}
                    onClick={() => {
                      copy();
                      showToast.success(t('quiz.linkCopied', 'Link copied!'));
                    }}
                  >
                    {copied ? t('quiz.linkCopied', 'Link copied!') : t('quiz.share', 'Share')}
                  </Button>
                )}
              </CopyButton>
            )}
            {isOwner && (
              <Button
                variant="light"
                color="gray"
                leftSection={<IconDownload size={16} />}
                onClick={handleExport}
              >
                Export
              </Button>
            )}
            {isOwner && (
              <Button
                component={Link}
                to={`/quizzes/${quizId}/edit`}
                variant="light"
                leftSection={<IconEdit size={16} />}
              >
                Edit
              </Button>
            )}
            {isOwner && (
              <Button
                component={Link}
                to={`/host/${quizId}`}
                leftSection={<IconPlayerPlay size={16} />}
                disabled={questions.length === 0}
              >
                Host Game
              </Button>
            )}
          </Group>
        </Group>

        {quiz.description && (
          <Text c="dimmed" mb="md">{quiz.description}</Text>
        )}

        {/* Share Link Section */}
        {shareUrl && (
          <Paper withBorder p="sm" radius="sm" mb="md">
            <Text size="sm" fw={500} mb="xs">{t('quiz.shareLink', 'Share Link')}</Text>
            <Group gap="xs">
              <TextInput
                value={shareUrl}
                readOnly
                style={{ flex: 1 }}
                size="sm"
              />
              <CopyButton value={shareUrl}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? t('quiz.linkCopied', 'Link copied!') : t('common.copy', 'Copy')}>
                    <ActionIcon
                      color={copied ? 'teal' : 'gray'}
                      variant="subtle"
                      onClick={() => {
                        copy();
                        if (!copied) showToast.success(t('quiz.linkCopied', 'Link copied!'));
                      }}
                    >
                      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
          </Paper>
        )}

        {/* Rating Section */}
        <Paper withBorder p="sm" radius="sm">
          <Group justify="space-between">
            <Group gap="sm">
              <Text size="sm" fw={500}>{t('quiz.rating', 'Rating')}:</Text>
              <StarRating
                value={ratingData?.average || quiz.averageRating || 0}
                count={ratingData?.count || quiz.ratingCount || 0}
                readOnly
                size="sm"
              />
            </Group>
            {user && (
              <Group gap="sm">
                <Text size="sm" c="dimmed">{t('quiz.rate', 'Rate')}:</Text>
                <StarRating
                  value={ratingData?.userRating || 0}
                  onChange={handleRate}
                  size="sm"
                />
              </Group>
            )}
          </Group>
        </Paper>
      </Paper>

      <Title order={3} mb="md">Questions</Title>

      {questions.length === 0 ? (
        <Paper withBorder p="xl" ta="center">
          <Text c="dimmed" mb="md">No questions yet.</Text>
          {isOwner && (
            <Button component={Link} to={`/quizzes/${quizId}/edit`}>
              Add Questions
            </Button>
          )}
        </Paper>
      ) : (
        <Stack gap="md">
          {questions.map((question, index) => (
            <Card key={question.id || question._id} withBorder padding="md">
              <Group justify="space-between" mb="xs">
                <Text fw={500}>
                  {index + 1}. {question.text}
                </Text>
                <Group gap="xs">
                  <Badge size="sm" variant="light">{question.timeLimit}s</Badge>
                  <Badge size="sm" variant="light">{question.points} pts</Badge>
                </Group>
              </Group>

              <Stack gap={4}>
                {question.options.map((option, optIndex) => {
                  const isCorrect = isOwner && optIndex === question.correctAnswerIndex;
                  return (
                    <Text
                      key={optIndex}
                      size="sm"
                      c={isCorrect ? 'green' : 'dimmed'}
                      fw={isCorrect ? 500 : 400}
                    >
                      {String.fromCharCode(65 + optIndex)}. {option}
                      {isCorrect && ' ✓'}
                    </Text>
                  );
                })}
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
    </Container>
  );
}
