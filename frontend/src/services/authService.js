import api, { setAuthToken } from './api';

export const authService = {
  register: async (email, password, username) => {
    const response = await api.post('/auth/register', { email, password, username });
    if (response.data.token) {
      setAuthToken(response.data.token);
    }
    return response.data;
  },

  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    if (response.data.token) {
      setAuthToken(response.data.token);
    }
    return response.data;
  },

  logout: async () => {
    const response = await api.post('/auth/logout');
    setAuthToken(null);
    return response.data;
  },

  getMe: async () => {
    const { getAuthToken } = await import('./api');
    if (!getAuthToken()) return null;
    const response = await api.get('/auth/me');
    return response.data;
  },

  updateProfile: async (username) => {
    const response = await api.put('/auth/profile', { username });
    return response.data;
  },

  changePassword: async (currentPassword, newPassword) => {
    const response = await api.put('/auth/change-password', { currentPassword, newPassword });
    return response.data;
  },

  forgotPassword: async (email) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (token, newPassword) => {
    const response = await api.post('/auth/reset-password', { token, newPassword });
    return response.data;
  },

  deleteAccount: async (password) => {
    const response = await api.delete('/auth/account', { data: { password } });
    return response.data;
  }
};
