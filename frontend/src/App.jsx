import { useState, useCallback } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import { queryClient } from './lib/queryClient';
import { AuthProvider } from './context/AuthContext';
import { RoomProvider } from './context/RoomContext';
import { TimerProvider } from './context/TimerContext';
import { GameProvider } from './context/GameContext';
import AppRoutes from './routes';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { darkTheme, lightTheme } from './theme';

function getSavedScheme() {
  try {
    return localStorage.getItem('mantine-color-scheme-value') || 'dark';
  } catch {
    return 'dark';
  }
}

export default function App() {
  const [colorScheme, setColorScheme] = useState(getSavedScheme);

  const toggleColorScheme = useCallback(() => {
    setColorScheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('mantine-color-scheme-value', next); } catch {}
      return next;
    });
  }, []);

  const theme = colorScheme === 'light' ? lightTheme : darkTheme;

  return (
    <MantineProvider theme={theme} forceColorScheme={colorScheme}>
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <RoomProvider>
              <TimerProvider>
                <GameProvider>
                  <ErrorBoundary>
                    <Layout onToggleTheme={toggleColorScheme} colorScheme={colorScheme}>
                      <AppRoutes />
                    </Layout>
                  </ErrorBoundary>
                </GameProvider>
              </TimerProvider>
            </RoomProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}
