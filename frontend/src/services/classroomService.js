import api from './api';

const classroomService = {
  create: (data) => api.post('/classrooms', data).then(r => r.data),
  getMyClassrooms: () => api.get('/classrooms/my').then(r => r.data),
  getById: (id) => api.get(`/classrooms/${id}`).then(r => r.data),
  removeStudent: (id, nickname) => api.delete(`/classrooms/${id}/students/${encodeURIComponent(nickname)}`).then(r => r.data),
  assignQuiz: (id, quizId, dueDate) => api.post(`/classrooms/${id}/assign`, { quizId, dueDate }).then(r => r.data),
  removeAssignment: (id, index) => api.delete(`/classrooms/${id}/assign/${index}`).then(r => r.data),
  delete: (id) => api.delete(`/classrooms/${id}`).then(r => r.data),
};

export default classroomService;
