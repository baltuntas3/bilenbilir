import api from './api';

export const quizService = {
  // Quiz CRUD
  create: async (title, description = '', isPublic = false) => {
    const response = await api.post('/quizzes', { title, description, isPublic });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/quizzes/${id}`);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/quizzes/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    await api.delete(`/quizzes/${id}`);
  },

  // Quiz Lists
  getPublic: async (page = 1, limit = 20) => {
    const response = await api.get('/quizzes', { params: { page, limit } });
    return response.data;
  },

  getMy: async (page = 1, limit = 20) => {
    const response = await api.get('/quizzes/my', { params: { page, limit } });
    return response.data;
  },

  search: async (query, page = 1, limit = 20) => {
    const response = await api.get('/quizzes/search', { params: { q: query, page, limit } });
    return response.data;
  },

  // Questions
  getQuestions: async (quizId) => {
    const response = await api.get(`/quizzes/${quizId}/questions`);
    return response.data;
  },

  addQuestion: async (quizId, questionData) => {
    const response = await api.post(`/quizzes/${quizId}/questions`, questionData);
    return response.data;
  },

  updateQuestion: async (quizId, questionId, questionData) => {
    const response = await api.put(`/quizzes/${quizId}/questions/${questionId}`, questionData);
    return response.data;
  },

  deleteQuestion: async (quizId, questionId) => {
    await api.delete(`/quizzes/${quizId}/questions/${questionId}`);
  },

  reorderQuestions: async (quizId, questionOrder) => {
    const response = await api.put(`/quizzes/${quizId}/questions/reorder`, { questionOrder });
    return response.data;
  },

  // Import/Export
  export: async (quizId) => {
    const response = await api.get(`/quizzes/${quizId}/export`);
    return response.data;
  },

  import: async (data, isPublic = false) => {
    const response = await api.post('/quizzes/import', { data, isPublic });
    return response.data;
  },
};
