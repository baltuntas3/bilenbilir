import { useGame } from '../../context/GameContext';

const ANIMATION_DURATION = 3000;

export default function ReactionOverlay() {
  const { reactions } = useGame();

  if (reactions.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: 0,
      right: 0,
      top: 0,
      pointerEvents: 'none',
      zIndex: 1000,
      overflow: 'hidden',
    }}>
      {reactions.map((r) => {
        const hash = r.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const left = 10 + (hash % 80);

        return (
          <div
            key={r.id}
            style={{
              position: 'absolute',
              bottom: 0,
              left: `${left}%`,
              animation: `reaction-float-cyber ${ANIMATION_DURATION}ms ease-out forwards`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span style={{ fontSize: '2rem' }}>{r.reaction}</span>
            <span style={{
              fontSize: '0.55rem',
              fontFamily: 'var(--theme-font-display)',
              color: 'var(--theme-primary)',
              textShadow: 'var(--theme-glow-primary)',
              backgroundColor: 'var(--theme-surface)',
              padding: '2px 6px',
              borderRadius: 6,
              border: '1px solid var(--theme-border)',
              whiteSpace: 'nowrap',
              maxWidth: 80,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {r.nickname}
            </span>
          </div>
        );
      })}
    </div>
  );
}
