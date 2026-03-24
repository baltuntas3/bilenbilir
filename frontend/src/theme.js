import { createTheme } from '@mantine/core';

const shared = {
  fontFamily: 'var(--theme-font-body)',
  fontFamilyMonospace: 'JetBrains Mono, monospace',
  headings: {
    fontFamily: 'var(--theme-font-display)',
    sizes: {
      h1: { fontSize: '1.8rem', lineHeight: '1.4' },
      h2: { fontSize: '1.4rem', lineHeight: '1.4' },
      h3: { fontSize: '1.1rem', lineHeight: '1.4' },
      h4: { fontSize: '0.9rem', lineHeight: '1.4' },
    },
  },
  defaultRadius: 'md',
  colors: {
    dark: [
      '#C1C2C5', '#A6A7AB', '#909296', '#5c5f66', '#373A40',
      '#2C2E33', '#1a1a2e', '#12122a', '#0a0a1a', '#050510',
    ],
    neon: [
      '#e0fffe', '#b3fffc', '#80fffa', '#4dfff8', '#1afff6',
      '#00f0ff', '#00d4e0', '#00b8c2', '#009ca3', '#008085',
    ],
    medieval: [
      '#fdf6e3', '#f5e6bf', '#ebd49a', '#d9b96b', '#c9a043',
      '#a07828', '#8a6820', '#745818', '#5e4812', '#4a380c',
    ],
  },
  components: {
    Button: { defaultProps: { size: 'md' } },
    TextInput: { defaultProps: { size: 'md' } },
    PasswordInput: { defaultProps: { size: 'md' } },
  },
};

export const darkTheme = createTheme({ ...shared, primaryColor: 'neon' });
export const lightTheme = createTheme({ ...shared, primaryColor: 'medieval' });
