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
import { theme } from './theme';

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <RoomProvider>
              <TimerProvider>
                <GameProvider>
                  <ErrorBoundary>
                    <Layout>
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
