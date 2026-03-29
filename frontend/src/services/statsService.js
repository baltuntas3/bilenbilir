import api from './api';

export const statsService = {
  getDashboard: async () => {
    const response = await api.get('/stats/dashboard');
    return response.data;
  },

  getSessions: async (page = 1, limit = 20) => {
    const response = await api.get('/stats/sessions', { params: { page, limit } });
    return response.data;
  },

  getSessionDetail: async (id) => {
    const response = await api.get(`/stats/sessions/${id}`);
    return response.data;
  },

  getWeakTopics: async () => {
    const response = await api.get('/stats/weak-topics');
    return response.data;
  },
};
