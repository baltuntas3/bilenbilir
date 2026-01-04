import { QueryClient } from '@tanstack/react-query';
import { showToast, getErrorMessage } from '../utils/toast';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 dakika
    },
    mutations: {
      onError: (error) => {
        showToast.error(getErrorMessage(error));
      }
    }
  }
});
