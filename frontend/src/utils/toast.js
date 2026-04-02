import { notifications } from '@mantine/notifications';

/**
 * Show a notification. When an `id` is provided, any existing notification with
 * the same id is replaced instead of stacking a duplicate.
 */
const show = (title, message, color, id) => {
  const opts = { title, message, color };
  if (id) {
    opts.id = id;
    // Update-or-create: hide first to avoid stacking, then show fresh
    notifications.hide(id);
  }
  notifications.show(opts);
};

export const showToast = {
  success: (message, id) => show('Success', message, 'green', id),
  error: (message, id) => show('Error', message, 'red', id),
  warning: (message, id) => show('Warning', message, 'yellow', id),
  info: (message, id) => show('Info', message, 'blue', id),
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
