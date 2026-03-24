import { useState, useCallback, useRef, useEffect } from 'react';
import { Group, UnstyledButton, Box } from '@mantine/core';
import { useGame } from '../../context/GameContext';

const ALLOWED_REACTIONS = ['\u{1F44F}', '\u{1F389}', '\u{1F62E}', '\u{1F602}', '\u{1F525}', '\u{2764}\u{FE0F}', '\u{1F44D}', '\u{1F4AF}'];
const COOLDOWN_MS = 1500;

export default function ReactionPicker() {
  const { sendReaction } = useGame();
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimerRef = useRef(null);

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
      className="safe-bottom"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 999,
        pointerEvents: 'none',
        padding: '0 8px 12px',
      }}
    >
      <Box
        style={{
          display: 'flex',
          gap: 2,
          backgroundColor: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          borderRadius: 20,
          padding: '6px 10px',
          pointerEvents: 'auto',
          opacity: cooldown ? 0.5 : 1,
          transition: 'opacity 0.2s, box-shadow 0.3s',
          boxShadow: cooldown ? 'none' : '0 0 10px rgba(0, 240, 255, 0.2)',
        }}
      >
        {ALLOWED_REACTIONS.map((reaction) => (
          <UnstyledButton
            key={reaction}
            onClick={() => handleReaction(reaction)}
            disabled={cooldown}
            style={{
              fontSize: '1.3rem',
              padding: '3px 4px',
              borderRadius: 8,
              cursor: cooldown ? 'default' : 'pointer',
              transition: 'transform 0.15s ease, filter 0.15s',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              if (!cooldown) {
                e.currentTarget.style.transform = 'scale(1.4)';
                e.currentTarget.style.filter = 'drop-shadow(0 0 4px var(--theme-primary))';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.filter = 'none';
            }}
          >
            {reaction}
          </UnstyledButton>
        ))}
      </Box>
    </Group>
  );
}
