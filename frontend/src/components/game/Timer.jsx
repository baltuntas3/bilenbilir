import { RingProgress, Text, Center, Stack } from '@mantine/core';

const COLORS = {
  safe: 'green',
  warning: 'yellow',
  danger: 'red',
};

export default function Timer({ remaining, total }) {
  const percentage = total > 0 ? (remaining / total) * 100 : 0;

  const getColor = () => {
    if (percentage > 50) return COLORS.safe;
    if (percentage > 25) return COLORS.warning;
    return COLORS.danger;
  };

  return (
    <Center>
      <RingProgress
        size={120}
        thickness={12}
        roundCaps
        sections={[{ value: percentage, color: getColor() }]}
        label={
          <Center>
            <Stack gap={0} align="center">
              <Text size="xl" fw={700}>
                {remaining}
              </Text>
              <Text size="xs" c="dimmed">
                seconds
              </Text>
            </Stack>
          </Center>
        }
      />
    </Center>
  );
}
