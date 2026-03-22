import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import ProtectedRoute from './ProtectedRoute';
import PublicRoute from './PublicRoute';

// Lazy-loaded page components
const Login = lazy(() => import('../pages/Login'));
const Register = lazy(() => import('../pages/Register'));
const ForgotPassword = lazy(() => import('../pages/ForgotPassword'));
const ResetPassword = lazy(() => import('../pages/ResetPassword'));

const Home = lazy(() => import('../pages/Home'));
const Profile = lazy(() => import('../pages/Profile'));

const Quizzes = lazy(() => import('../pages/Quizzes'));
const MyQuizzes = lazy(() => import('../pages/MyQuizzes'));
const QuizCreate = lazy(() => import('../pages/QuizCreate'));
const QuizDetail = lazy(() => import('../pages/QuizDetail'));
const QuizEdit = lazy(() => import('../pages/QuizEdit'));

const JoinGame = lazy(() => import('../pages/JoinGame'));
const HostLobby = lazy(() => import('../pages/HostLobby'));
const HostGame = lazy(() => import('../pages/HostGame'));
const PlayerGame = lazy(() => import('../pages/PlayerGame'));
const SpectatorGame = lazy(() => import('../pages/SpectatorGame'));

const GameStats = lazy(() => import('../pages/GameStats'));
const GameSessionDetail = lazy(() => import('../pages/GameSessionDetail'));
const GameReplay = lazy(() => import('../pages/GameReplay'));
const AnalyticsDashboard = lazy(() => import('../pages/AnalyticsDashboard'));

const Tournaments = lazy(() => import('../pages/Tournaments'));
const TournamentDetail = lazy(() => import('../pages/TournamentDetail'));

const Classrooms = lazy(() => import('../pages/Classrooms'));
const ClassroomDetail = lazy(() => import('../pages/ClassroomDetail'));

function PageLoader() {
  return (
    <Center py="xl" mt={100}>
      <Loader size="lg" />
    </Center>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
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
    </Suspense>
  );
}
