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
      <Route path="/quizzes/:id" element={<QuizDetail />} />

      {/* Protected Routes */}
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/my-quizzes" element={<ProtectedRoute><MyQuizzes /></ProtectedRoute>} />
      <Route path="/quizzes/create" element={<ProtectedRoute><QuizCreate /></ProtectedRoute>} />
      <Route path="/quizzes/:id/edit" element={<ProtectedRoute><QuizEdit /></ProtectedRoute>} />
    </Routes>
  );
}
