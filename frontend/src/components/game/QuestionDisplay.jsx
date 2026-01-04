import { Paper, Text, Title, Badge, Group, Image, Stack, Center } from '@mantine/core';

export default function QuestionDisplay({
  question,
  questionIndex,
  totalQuestions,
  showImage = true,
}) {
  if (!question) return null;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Badge size="lg" variant="light">
          Question {questionIndex + 1} of {totalQuestions}
        </Badge>
        <Badge size="lg" variant="light" color="orange">
          {question.points} pts
        </Badge>
      </Group>

      <Paper p="xl" radius="md" withBorder>
        <Stack gap="md">
          <Title order={3} ta="center" style={{ wordBreak: 'break-word' }}>
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
              />
            </Center>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
