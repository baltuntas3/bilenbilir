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

  getQuizPerformance: async (quizId) => {
    const response = await api.get(`/stats/quiz/${quizId}`);
    return response.data;
  },
};
