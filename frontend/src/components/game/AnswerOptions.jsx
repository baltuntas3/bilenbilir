import { SimpleGrid, Button, Text, Stack, Progress, Badge, Group } from '@mantine/core';
import { IconCheck, IconX, IconUsers } from '@tabler/icons-react';

const OPTION_COLORS = ['blue', 'orange', 'green', 'grape'];
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function AnswerOptions({
  options,
  onSelect,
  disabled,
  selectedIndex,
  correctIndex,
  showResults,
  distribution,
  totalPlayers,
}) {
  const getButtonVariant = (index) => {
    if (!showResults) {
      return selectedIndex === index ? 'filled' : 'light';
    }
    if (index === correctIndex) {
      return 'filled';
    }
    if (selectedIndex === index && index !== correctIndex) {
      return 'filled';
    }
    return 'light';
  };

  const getButtonColor = (index) => {
    if (!showResults) {
      return OPTION_COLORS[index];
    }
    if (index === correctIndex) {
      return 'green';
    }
    if (selectedIndex === index && index !== correctIndex) {
      return 'red';
    }
    return 'gray';
  };

  const getIcon = (index) => {
    if (!showResults) return null;
    if (index === correctIndex) {
      return <IconCheck size={20} />;
    }
    if (selectedIndex === index && index !== correctIndex) {
      return <IconX size={20} />;
    }
    return null;
  };

  const getDistributionInfo = (index) => {
    if (!showResults || !distribution) return null;
    const count = distribution[index] || 0;
    const percentage = totalPlayers > 0 ? Math.round((count / totalPlayers) * 100) : 0;
    return { count, percentage };
  };

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      {options.map((option, index) => {
        const distInfo = getDistributionInfo(index);
        const isCorrect = index === correctIndex;

        return (
          <Button
            key={index}
            size="xl"
            variant={getButtonVariant(index)}
            color={getButtonColor(index)}
            onClick={() => onSelect(index)}
            disabled={disabled || selectedIndex !== null}
            leftSection={
              <Text fw={700} size="lg">
                {OPTION_LABELS[index]}
              </Text>
            }
            rightSection={getIcon(index)}
            styles={{
              root: {
                height: 'auto',
                padding: '1rem',
              },
              inner: {
                justifyContent: 'flex-start',
              },
              label: {
                whiteSpace: 'normal',
                textAlign: 'left',
                flex: 1,
              },
            }}
          >
            <Stack gap={4} style={{ width: '100%' }}>
              <Text size="md" style={{ wordBreak: 'break-word' }}>
                {option}
              </Text>
              {distInfo && (
                <Stack gap={4}>
                  <Group gap="xs">
                    <IconUsers size={14} />
                    <Text size="xs">
                      {distInfo.count} ({distInfo.percentage}%)
                    </Text>
                  </Group>
                  <Progress
                    value={distInfo.percentage}
                    size="sm"
                    color={isCorrect ? 'green' : 'gray'}
                    style={{ width: '100%' }}
                  />
                </Stack>
              )}
            </Stack>
          </Button>
        );
      })}
    </SimpleGrid>
  );
}
