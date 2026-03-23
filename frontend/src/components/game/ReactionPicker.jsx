import { useState, useCallback, useRef, useEffect } from 'react';
import { Group, UnstyledButton } from '@mantine/core';
import { useGame } from '../../context/GameContext';

const ALLOWED_REACTIONS = ['\u{1F44F}', '\u{1F389}', '\u{1F62E}', '\u{1F602}', '\u{1F525}', '\u{2764}\u{FE0F}', '\u{1F44D}', '\u{1F4AF}'];
const COOLDOWN_MS = 1500;

export default function ReactionPicker() {
  const { sendReaction } = useGame();
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimerRef = useRef(null);

  // Clear timeout on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  const handleReaction = useCallback((reaction) => {
    if (cooldown) return;
    sendReaction(reaction);
    setCooldown(true);
    cooldownTimerRef.current = setTimeout(() => setCooldown(false), COOLDOWN_MS);
  }, [cooldown, sendReaction]);

  return (
    <Group
      justify="center"
      gap="xs"
      style={{
        position: 'fixed',
        bottom: 16,
        left: 0,
        right: 0,
        zIndex: 999,
        pointerEvents: 'none',
      }}
    >
      <Group
        gap={4}
        style={{
          backgroundColor: 'var(--mantine-color-body)',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 24,
          padding: '6px 12px',
          pointerEvents: 'auto',
          opacity: cooldown ? 0.6 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        {ALLOWED_REACTIONS.map((reaction) => (
          <UnstyledButton
            key={reaction}
            onClick={() => handleReaction(reaction)}
            disabled={cooldown}
            style={{
              fontSize: '1.4rem',
              padding: '4px 6px',
              borderRadius: 8,
              cursor: cooldown ? 'default' : 'pointer',
              transition: 'transform 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!cooldown) e.currentTarget.style.transform = 'scale(1.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {reaction}
          </UnstyledButton>
        ))}
      </Group>
    </Group>
  );
}
