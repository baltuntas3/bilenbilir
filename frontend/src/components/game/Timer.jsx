import { RingProgress, Text, Center, Stack, Box } from '@mantine/core';

const COLORS = {
  safe: 'green',
  warning: 'yellow',
  danger: 'red',
};

export default function Timer({ remaining, total, isLightning = false }) {
  const percentage = total > 0 ? (remaining / total) * 100 : 0;

  const getColor = () => {
    if (isLightning) return 'violet';
    if (percentage > 50) return COLORS.safe;
    if (percentage > 25) return COLORS.warning;
    return COLORS.danger;
  };

  return (
    <Center>
      <Box
        style={isLightning ? {
          borderRadius: '50%',
          boxShadow: '0 0 20px rgba(139, 92, 246, 0.6), 0 0 40px rgba(139, 92, 246, 0.3)',
          animation: 'lightning-pulse 1s ease-in-out infinite',
        } : undefined}
      >
        <style>{`
          @keyframes lightning-pulse {
            0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.6), 0 0 40px rgba(139, 92, 246, 0.3); }
            50% { box-shadow: 0 0 30px rgba(139, 92, 246, 0.8), 0 0 60px rgba(139, 92, 246, 0.5); }
          }
        `}</style>
        <RingProgress
          size={120}
          thickness={12}
          roundCaps
          sections={[{ value: percentage, color: getColor() }]}
          label={
            <Center>
              <Stack gap={0} align="center">
                <Text size="xl" fw={700}>
                  {isLightning && '\u26A1'}{remaining}
                </Text>
                <Text size="xs" c="dimmed">
                  seconds
                </Text>
              </Stack>
            </Center>
          }
        />
      </Box>
    </Center>
  );
}
