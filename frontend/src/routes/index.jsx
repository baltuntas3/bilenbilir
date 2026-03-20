import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import PublicRoute from './PublicRoute';

// Auth Pages
import Login from '../pages/Login';
import Register from '../pages/Register';
import ForgotPassword from '../pages/ForgotPassword';
import ResetPassword from '../pages/ResetPassword';

// App Pages
import Home from '../pages/Home';
import Profile from '../pages/Profile';

// Quiz Pages
import Quizzes from '../pages/Quizzes';
import MyQuizzes from '../pages/MyQuizzes';
import QuizCreate from '../pages/QuizCreate';
import QuizDetail from '../pages/QuizDetail';
import QuizEdit from '../pages/QuizEdit';

// Game Pages
import JoinGame from '../pages/JoinGame';
import HostLobby from '../pages/HostLobby';
import HostGame from '../pages/HostGame';
import PlayerGame from '../pages/PlayerGame';
import SpectatorGame from '../pages/SpectatorGame';

// Stats Pages
import GameStats from '../pages/GameStats';
import GameSessionDetail from '../pages/GameSessionDetail';
import GameReplay from '../pages/GameReplay';
import AnalyticsDashboard from '../pages/AnalyticsDashboard';

// Tournament Pages
import Tournaments from '../pages/Tournaments';
import TournamentDetail from '../pages/TournamentDetail';

// Classroom Pages
import Classrooms from '../pages/Classrooms';
import ClassroomDetail from '../pages/ClassroomDetail';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Public Quiz Routes */}
      <Route path="/quizzes" element={<Quizzes />} />
      <Route path="/quiz/share/:slug" element={<QuizDetail />} />
      <Route path="/quizzes/:id" element={<QuizDetail />} />

      {/* Protected Routes */}
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/my-quizzes" element={<ProtectedRoute><MyQuizzes /></ProtectedRoute>} />
      <Route path="/quizzes/create" element={<ProtectedRoute><QuizCreate /></ProtectedRoute>} />
      <Route path="/quizzes/:id/edit" element={<ProtectedRoute><QuizEdit /></ProtectedRoute>} />

      {/* Stats Routes */}
      <Route path="/stats" element={<ProtectedRoute><GameStats /></ProtectedRoute>} />
      <Route path="/stats/session/:id" element={<ProtectedRoute><GameSessionDetail /></ProtectedRoute>} />
      <Route path="/stats/replay/:id" element={<ProtectedRoute><GameReplay /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><AnalyticsDashboard /></ProtectedRoute>} />

      {/* Tournament Routes */}
      <Route path="/tournaments" element={<ProtectedRoute><Tournaments /></ProtectedRoute>} />
      <Route path="/tournaments/:id" element={<ProtectedRoute><TournamentDetail /></ProtectedRoute>} />

      {/* Classroom Routes */}
      <Route path="/classrooms" element={<ProtectedRoute><Classrooms /></ProtectedRoute>} />
      <Route path="/classrooms/:id" element={<ProtectedRoute><ClassroomDetail /></ProtectedRoute>} />

      {/* Game Routes */}
      <Route path="/join" element={<JoinGame />} />
      <Route path="/play" element={<PlayerGame />} />
      <Route path="/spectate" element={<SpectatorGame />} />
      <Route path="/host/:quizId" element={<ProtectedRoute><HostLobby /></ProtectedRoute>} />
      <Route path="/host" element={<ProtectedRoute><HostGame /></ProtectedRoute>} />
    </Routes>
  );
}
