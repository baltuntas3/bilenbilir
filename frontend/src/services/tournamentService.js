import api from './api';

const tournamentService = {
  create: (data) => api.post('/tournaments', data).then(r => r.data),
  getMyTournaments: () => api.get('/tournaments/my').then(r => r.data),
  getById: (id) => api.get(`/tournaments/${id}`).then(r => r.data),
  addRound: (id, quizId) => api.post(`/tournaments/${id}/rounds`, { quizId }).then(r => r.data),
  removeRound: (id, index) => api.delete(`/tournaments/${id}/rounds/${index}`).then(r => r.data),
  start: (id) => api.post(`/tournaments/${id}/start`).then(r => r.data),
  completeRound: (id, roundIndex, results) => api.post(`/tournaments/${id}/complete-round`, { roundIndex, results }).then(r => r.data),
  nextRound: (id) => api.post(`/tournaments/${id}/next-round`).then(r => r.data),
  delete: (id) => api.delete(`/tournaments/${id}`).then(r => r.data),
};

export default tournamentService;
