import { Group, Button, Badge } from '@mantine/core';
import { useGame } from '../../context/GameContext';

const POWER_UP_CONFIG = [
  { type: 'FIFTY_FIFTY', label: '50:50', color: 'blue' },
  { type: 'DOUBLE_POINTS', label: 'Çift Puan', color: 'orange' },
  { type: 'TIME_EXTENSION', label: 'Süre Uzatma', color: 'green' },
];

export default function PowerUpBar() {
  const { powerUps, hasAnswered, usePowerUp } = useGame();

  return (
    <Group justify="center" gap="sm">
      {POWER_UP_CONFIG.map(({ type, label, color }) => (
        <Button
          key={type}
          variant="light"
          color={color}
          size="sm"
          disabled={!powerUps[type] || hasAnswered}
          onClick={() => usePowerUp(type)}
          rightSection={
            <Badge size="sm" circle color={color}>
              {powerUps[type] || 0}
            </Badge>
          }
        >
          {label}
        </Button>
      ))}
    </Group>
  );
}
