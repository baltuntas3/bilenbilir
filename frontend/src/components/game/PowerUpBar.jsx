import { useState } from 'react';
import { Group, UnstyledButton, Text, Badge, Stack, Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../context/GameContext';

const POWER_UP_CONFIG = [
  {
    type: 'FIFTY_FIFTY',
    labelKey: 'powerUp.fiftyFifty',
    emoji: '\u2702\uFE0F',
    color: 'var(--theme-primary)',
    glow: 'var(--theme-glow-primary)',
  },
  {
    type: 'DOUBLE_POINTS',
    labelKey: 'powerUp.doublePoints',
    emoji: '\u{1F4A0}',
    color: 'var(--theme-warning)',
    glow: 'var(--theme-glow-warning)',
  },
  {
    type: 'TIME_EXTENSION',
    labelKey: 'powerUp.timeExtension',
    emoji: '\u23F0',
    color: 'var(--theme-success)',
    glow: 'var(--theme-glow-success)',
  },
];

export default function PowerUpBar() {
  const { t } = useTranslation();
  const { powerUps, hasAnswered, usePowerUp } = useGame();
  const [activating, setActivating] = useState(null);

  const handleUse = (type) => {
    if (activating) return;
    setActivating(type);
    usePowerUp(type);
    setTimeout(() => setActivating(null), 1500);
  };

  return (
    <Group justify="center" gap="sm">
      {POWER_UP_CONFIG.map(({ type, labelKey, emoji, color, glow }) => {
        const count = powerUps[type] || 0;
        const isDisabled = !count || hasAnswered;
        const isActivating = activating === type;

        return (
          <UnstyledButton
            key={type}
            disabled={isDisabled}
            onClick={() => handleUse(type)}
            className={isActivating ? 'power-explode' : ''}
            style={{
              border: `1px solid ${isDisabled ? 'var(--theme-border)' : color}`,
              borderRadius: 12,
              padding: '8px 14px',
              background: isDisabled ? 'var(--theme-bg)' : 'var(--theme-surface)',
              boxShadow: isDisabled ? 'none' : glow,
              opacity: isDisabled ? 0.4 : 1,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative',
            }}
          >
            <Stack gap={2} align="center">
              <Text style={{ fontSize: '1.2rem' }}>{emoji}</Text>
              <Text
                size="xs"
                fw={700}
                style={{
                  fontFamily: 'var(--theme-font-display)',
                  fontSize: '0.5rem',
                  color: isDisabled ? 'var(--theme-text-dim)' : color,
                }}
              >
                {t(labelKey)}
              </Text>
            </Stack>
            {count > 0 && (
              <Box
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  size="xs"
                  fw={700}
                  style={{
                    color: 'var(--theme-bg)',
                    fontSize: '0.6rem',
                    fontFamily: 'var(--theme-font-display)',
                  }}
                >
                  {count}
                </Text>
              </Box>
            )}
          </UnstyledButton>
        );
      })}
    </Group>
  );
}
