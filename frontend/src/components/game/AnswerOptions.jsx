import { memo } from 'react';
import { SimpleGrid, UnstyledButton, Text, Stack, Progress, Group, Box } from '@mantine/core';
import { IconCheck, IconX, IconUsers } from '@tabler/icons-react';

const OPTION_COLORS = [
  { neon: 'var(--theme-opt-a)', glow: 'var(--theme-glow-primary)' },
  { neon: 'var(--theme-opt-b)', glow: 'var(--theme-glow-secondary)' },
  { neon: 'var(--theme-opt-c)', glow: 'var(--theme-glow-success)' },
  { neon: 'var(--theme-opt-d)', glow: 'var(--theme-glow-warning)' },
  { neon: 'var(--theme-opt-e)', glow: 'var(--theme-glow-accent)' },
  { neon: 'var(--theme-opt-f)', glow: 'var(--theme-glow-primary)' },
];

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

const MANTINE_COLORS = ['cyan', 'pink', 'green', 'yellow', 'grape', 'cyan'];

function AnswerOptions({
  options,
  onSelect,
  disabled,
  selectedIndex,
  correctIndex,
  showResults,
  distribution,
  totalPlayers,
  eliminatedOptions = [],
}) {
  const getDistributionInfo = (index) => {
    if (!showResults || !distribution) return null;
    const count = distribution[index] || 0;
    const percentage = totalPlayers > 0 ? Math.round((count / totalPlayers) * 100) : 0;
    return { count, percentage };
  };

  return (
    <SimpleGrid cols={{ base: 2, sm: 2 }} spacing="sm">
      {options.map((option, index) => {
        const distInfo = getDistributionInfo(index);
        const isCorrect = showResults && index === correctIndex;
        const isWrong = showResults && selectedIndex === index && index !== correctIndex;
        const isSelected = selectedIndex === index;
        const isEliminated = eliminatedOptions.includes(index);
        const colors = OPTION_COLORS[index] || OPTION_COLORS[0];

        let borderColor = 'var(--theme-border)';
        let bgColor = 'var(--theme-surface)';
        let glowStyle = 'none';
        let textColor = colors.neon;

        if (isCorrect) {
          borderColor = 'var(--theme-success)';
          bgColor = 'rgba(57, 255, 20, 0.1)';
          glowStyle = 'var(--theme-glow-success)';
          textColor = 'var(--theme-success)';
        } else if (isWrong) {
          borderColor = 'var(--theme-secondary)';
          bgColor = 'rgba(255, 45, 149, 0.1)';
          glowStyle = 'var(--theme-glow-secondary)';
          textColor = 'var(--theme-secondary)';
        } else if (isEliminated) {
          borderColor = 'var(--theme-border)';
          bgColor = 'var(--theme-bg)';
          textColor = 'var(--theme-text-dim)';
        } else if (isSelected) {
          borderColor = colors.neon;
          bgColor = `${colors.neon}11`;
          glowStyle = colors.glow;
        }

        return (
          <UnstyledButton
            key={index}
            onClick={() => onSelect(index)}
            disabled={disabled || selectedIndex !== null || isEliminated}
            className={`slide-up slide-up-d${index + 1} ${isWrong ? 'shake' : ''} ${isCorrect ? 'score-pop' : ''}`}
            style={{
              border: `2px solid ${borderColor}`,
              borderRadius: 12,
              padding: '0.75rem',
              background: bgColor,
              boxShadow: glowStyle,
              opacity: isEliminated ? 0.3 : 1,
              cursor: disabled || selectedIndex !== null || isEliminated ? 'default' : 'pointer',
              transition: 'all 0.2s ease',
              minHeight: 70,
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => {
              if (!disabled && selectedIndex === null && !isEliminated) {
                e.currentTarget.style.borderColor = colors.neon;
                e.currentTarget.style.boxShadow = colors.glow;
                e.currentTarget.style.transform = 'scale(1.02)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected && !isCorrect && !isWrong) {
                e.currentTarget.style.borderColor = isEliminated ? 'var(--theme-border)' : 'var(--theme-border)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'scale(1)';
              }
            }}
          >
            <Group gap="sm" wrap="nowrap" style={{ width: '100%' }} align="flex-start">
              <Box
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: `1px solid ${textColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: isSelected || isCorrect || isWrong ? `${textColor}22` : 'transparent',
                }}
              >
                {isCorrect ? (
                  <IconCheck size={18} style={{ color: 'var(--theme-success)' }} />
                ) : isWrong ? (
                  <IconX size={18} style={{ color: 'var(--theme-secondary)' }} />
                ) : (
                  <Text
                    fw={700}
                    size="sm"
                    style={{
                      fontFamily: 'var(--theme-font-display)',
                      fontSize: '0.6rem',
                      color: textColor,
                      textDecoration: isEliminated ? 'line-through' : 'none',
                    }}
                  >
                    {OPTION_LABELS[index]}
                  </Text>
                )}
              </Box>

              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Text
                  size="sm"
                  fw={500}
                  style={{
                    wordBreak: 'break-word',
                    color: isEliminated ? 'var(--theme-text-dim)' : 'var(--theme-text)',
                    textDecoration: isEliminated ? 'line-through' : 'none',
                    lineHeight: 1.3,
                  }}
                >
                  {option}
                </Text>
                {distInfo && (
                  <Stack gap={2}>
                    <Group gap={4}>
                      <IconUsers size={12} style={{ color: 'var(--theme-text-dim)' }} />
                      <Text size="xs" style={{ color: 'var(--theme-text-dim)' }}>
                        {distInfo.count} ({distInfo.percentage}%)
                      </Text>
                    </Group>
                    <Progress
                      value={distInfo.percentage}
                      size="xs"
                      color={isCorrect ? 'neonGreen' : MANTINE_COLORS[index]}
                      style={{ width: '100%' }}
                    />
                  </Stack>
                )}
              </Stack>
            </Group>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}

// Memo skips re-renders when sibling state (e.g., players array) changes
// without affecting this component's actual inputs.
export default memo(AnswerOptions);
