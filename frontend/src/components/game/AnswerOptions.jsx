import { SimpleGrid, Button, Text, Stack } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';

const OPTION_COLORS = ['blue', 'orange', 'green', 'grape'];
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function AnswerOptions({
  options,
  onSelect,
  disabled,
  selectedIndex,
  correctIndex,
  showResults,
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

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      {options.map((option, index) => (
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
          <Stack gap={0}>
            <Text size="md" style={{ wordBreak: 'break-word' }}>
              {option}
            </Text>
          </Stack>
        </Button>
      ))}
    </SimpleGrid>
  );
}
