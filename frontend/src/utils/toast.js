import { notifications } from '@mantine/notifications';

export const showToast = {
  success: (message) => {
    notifications.show({
      title: 'Success',
      message,
      color: 'green',
    });
  },

  error: (message) => {
    notifications.show({
      title: 'Error',
      message,
      color: 'red',
    });
  },

  warning: (message) => {
    notifications.show({
      title: 'Warning',
      message,
      color: 'yellow',
    });
  },

  info: (message) => {
    notifications.show({
      title: 'Info',
      message,
      color: 'blue',
    });
  }
};

/**
 * Extracts API error message
 * @param {Error} error - Axios error or normal error
 * @returns {string} Error message
 */
export function getErrorMessage(error) {
  if (error?.response?.data?.error) {
    return error.response.data.error;
  }
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.message) {
    return error.message;
  }
  return 'An error occurred';
}
