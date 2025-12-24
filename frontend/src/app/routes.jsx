// src/app/routes.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import GuestRoute from "../components/GuestRoute";

// Pages chung
import Home from "../pages/Home";
import Login from "../pages/Login";
import ProfilePage from "../pages/Profile";
import NotFound from "../pages/NotFound";
import CommunicateCenter from "../pages/CommunicateCenter";
import AdminCommunity from "../components/admin/AdminCommunity";

// Layouts
import AdminLayout from "../components/admin/AdminLayout";
import LearnerLayout from "../components/learner/LearnerLayout";
import MentorLayout from "../components/mentor/MentorLayout";

// Admin pages
import AdminDashboard from "../components/admin/AdminDashboard";
import ReportsPage from "../components/admin/ReportsPage";
import UsersList from "../components/admin/UsersList";
import PackagesList from "../components/admin/PackagesList";
import PurchasesList from "../components/admin/PurchasesList";
import PurchasesPage from "../components/admin/PurchasesPage";
import SupportTickets from "../components/admin/SupportTickets";

// Learner pages
import LearningCatalog from "../components/learner/LearningCatalog";
import LearnerDashboard from "../components/learner/LearnerDashboard";
import SpeakingPractice from "../components/learner/SpeakingPractice";
import Challenges from "../components/learner/Challenges";
import ChallengeDetail from "../components/learner/ChallengeDetail";
import LearnerFeedback from "../components/learner/LearnerFeedback";

// Mentor pages
import MentorDashboard from "../components/mentor/MentorDashboard";
import AssessmentPanel from "../components/mentor/AssessmentPanel";
import ChallengeCreator from "../components/mentor/ChallengeCreator";
import MentorSchedules from "../components/mentor/MentorSchedules";
import MentorLearners from "../components/mentor/MentorLearners";
import MentorResources from "../components/mentor/MentorResources";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Home />} />
      <Route
        path="/login"
        element={
          <GuestRoute>
            <Login />
          </GuestRoute>
        }
      />

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout />   {/* Layout có theme-admin */}
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<UsersList />} />
        <Route path="packages" element={<PackagesList />} />
        <Route path="purchases" element={<PurchasesList />} />
        <Route path="purchases/:id" element={<PurchasesPage />} />
        <Route path="learners/:id/purchases" element={<PurchasesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="support" element={<SupportTickets />} />
        <Route path="communicate" element={<CommunicateCenter />} />
        <Route path="communicate/manage" element={<AdminCommunity />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Route>

      {/* Learner routes */}
      <Route
        path="/learn"
        element={
          <ProtectedRoute requiredRole="learner">
            <LearnerLayout /> {/* Layout có theme-learner */}
          </ProtectedRoute>
        }
      >
        <Route index element={<LearningCatalog />} />
        <Route path="dashboard" element={<LearnerDashboard />} />
        <Route path="catalog" element={
          <LearningCatalog />
        } />
        <Route path="practice" element={
          <SpeakingPractice />
        } />
        <Route path="challenges" element={
          <Challenges />
        } />
        <Route path="challenges/:id" element={
          <ChallengeDetail />
        } />
        <Route path="feedback" element={
          <LearnerFeedback />
        } />
        <Route path="communicate" element={
          <CommunicateCenter />
        } />
        <Route path="profile" element={
          <ProfilePage />
        } />
        <Route path="*" element={<Navigate to="/learn/dashboard" replace />} />
      </Route>

      {/* Mentor routes */}
      <Route
        path="/mentor"
        element={
          <ProtectedRoute requiredRole="mentor">
            <MentorLayout />  {/* Layout có theme-mentor */}
          </ProtectedRoute>
        }
      >
        <Route index element={<MentorDashboard />} />
        <Route path="dashboard" element={<MentorDashboard />} />
        <Route path="assessment" element={
          <AssessmentPanel />
        } />
        <Route path="challenge-creator" element={
          <ChallengeCreator />
        } />
        <Route path="schedules" element={
          <MentorSchedules />
        } />
        <Route path="learners" element={
          <MentorLearners />
        } />
        <Route path="resources" element={
          <MentorResources />
        } />
        <Route path="communicate" element={
          <CommunicateCenter />
        } />
        <Route path="profile" element={
          <ProfilePage />
        } />
        <Route path="*" element={<Navigate to="/mentor/dashboard" replace />} />
      </Route>

      {/* Fallback chung */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
