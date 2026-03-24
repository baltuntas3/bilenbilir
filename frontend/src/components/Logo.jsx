import { useMantineColorScheme } from '@mantine/core';

export default function Logo({ size = 32 }) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  // Simple, clean "B?" monogram inside a rounded square
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className="logo-mark"
    >
      {/* Background rounded rect */}
      <rect
        x="2" y="2" width="36" height="36" rx="8"
        fill={isDark ? '#1a1a2e' : '#fff'}
        stroke="var(--theme-primary)"
        strokeWidth="2"
      />

      {/* "B" letter */}
      <text
        x="12"
        y="29"
        fontFamily="var(--theme-font-display)"
        fontSize="22"
        fontWeight="700"
        fill="var(--theme-primary)"
      >
        B
      </text>

      {/* "?" small, offset */}
      <text
        x="26"
        y="18"
        fontFamily="var(--theme-font-display)"
        fontSize="13"
        fontWeight="700"
        fill={isDark ? 'var(--theme-accent)' : 'var(--theme-secondary)'}
      >
        ?
      </text>
    </svg>
  );
}
