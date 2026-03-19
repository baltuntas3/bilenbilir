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
      <style>{`
        @keyframes reaction-float {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          70% {
            opacity: 0.8;
            transform: translateY(-60vh) scale(1.1);
          }
          100% {
            opacity: 0;
            transform: translateY(-80vh) scale(0.8);
          }
        }
      `}</style>
      {reactions.map((r) => {
        // Deterministic horizontal position from id
        const hash = r.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const left = 10 + (hash % 80); // 10% to 90%

        return (
          <div
            key={r.id}
            style={{
              position: 'absolute',
              bottom: 0,
              left: `${left}%`,
              animation: `reaction-float ${ANIMATION_DURATION}ms ease-out forwards`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span style={{ fontSize: '2rem' }}>{r.reaction}</span>
            <span style={{
              fontSize: '0.65rem',
              color: 'var(--mantine-color-dimmed)',
              backgroundColor: 'var(--mantine-color-body)',
              padding: '1px 6px',
              borderRadius: 8,
              whiteSpace: 'nowrap',
              maxWidth: 80,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              opacity: 0.8,
            }}>
              {r.nickname}
            </span>
          </div>
        );
      })}
    </div>
  );
}
