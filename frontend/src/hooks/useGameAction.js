import { useCallback } from 'react';
import { showToast } from '../utils/toast';

/**
 * Wraps an async game action with error handling.
 * Catches errors and shows them as toast notifications.
 *
 * @param {Function} action - The async action to wrap
 * @param {Object} [options] - Optional config
 * @param {Function} [options.onSuccess] - Called after successful execution
 * @returns {Function} Wrapped handler
 */
export function useGameAction(action, options = {}) {
  return useCallback(async () => {
    try {
      await action();
      if (options.onSuccess) options.onSuccess();
    } catch (error) {
      showToast.error(error.message);
    }
  }, [action, options.onSuccess]);
}
