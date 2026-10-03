// src/App.jsx
// -----------------------------------------------------------------
// Every route in the app, in one place.
//
// The shape is:
//   /                       public landing page
//   /login /register ...    public, and only when logged OUT
//   /patient/*              patients only
//   /doctor/*               doctors only
//   /admin/*                admins only
//   /access-denied          logged in, but not allowed
//   *                       404
//
// Each role area is one <Route> wrapped in <RequireRole>, so a new
// page added inside an area is protected automatically - there is no
// per-page guard to forget.
//
// Those guards are for navigation only. The API checks every request
// for itself; see components/RouteGuards.jsx.
// -----------------------------------------------------------------

import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import Layout from './components/Layout.jsx';
import { RequireRole, RequireAnonymous } from './components/RouteGuards.jsx';

import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/auth/ResetPasswordPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import AccessDeniedPage from './pages/AccessDeniedPage.jsx';

import ProfilePage from './pages/shared/ProfilePage.jsx';

import PatientDashboard from './pages/patient/PatientDashboard.jsx';
import BrowseDoctorsPage from './pages/patient/BrowseDoctorsPage.jsx';
import DoctorDetailPage from './pages/patient/DoctorDetailPage.jsx';
import BookAppointmentPage from './pages/patient/BookAppointmentPage.jsx';
import MyAppointmentsPage from './pages/patient/MyAppointmentsPage.jsx';
import MyReportsPage from './pages/patient/MyReportsPage.jsx';
import MyPrescriptionsPage from './pages/patient/MyPrescriptionsPage.jsx';

import DoctorDashboard from './pages/doctor/DoctorDashboard.jsx';
import DoctorAppointmentsPage from './pages/doctor/DoctorAppointmentsPage.jsx';
import DoctorPatientsPage from './pages/doctor/DoctorPatientsPage.jsx';
import DoctorPatientDetailPage from './pages/doctor/DoctorPatientDetailPage.jsx';
import PrescriptionFormPage from './pages/doctor/PrescriptionFormPage.jsx';
import AvailabilityPage from './pages/doctor/AvailabilityPage.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import ManageDoctorsPage from './pages/admin/ManageDoctorsPage.jsx';
import ManageSpecialtiesPage from './pages/admin/ManageSpecialtiesPage.jsx';
import AllAppointmentsPage from './pages/admin/AllAppointmentsPage.jsx';
import ManageUsersPage from './pages/admin/ManageUsersPage.jsx';
import AuditLogPage from './pages/admin/AuditLogPage.jsx';

export default function App() {
  return (
    <Routes>
      {/* Layout draws the header and footer; its <Outlet /> is where
          each page below is rendered. */}
      <Route element={<Layout />}>
        {/* ---------- public ---------- */}
        <Route path="/" element={<LandingPage />} />

        {/* RequireAnonymous: a signed-in user who opens /login is sent
            to their dashboard rather than shown a form they do not need. */}
        <Route
          path="/login"
          element={
            <RequireAnonymous>
              <LoginPage />
            </RequireAnonymous>
          }
        />
        <Route
          path="/register"
          element={
            <RequireAnonymous>
              <RegisterPage />
            </RequireAnonymous>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <RequireAnonymous>
              <ForgotPasswordPage />
            </RequireAnonymous>
          }
        />
        {/* Reset is NOT behind RequireAnonymous: someone may follow the
            emailed link while still logged in on another tab, and that
            should still work. */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route path="/access-denied" element={<AccessDeniedPage />} />

        {/* ---------- patient ---------- */}
        <Route
          path="/patient"
          element={
            <RequireRole roles={['patient']}>
              <RoleArea />
            </RequireRole>
          }
        >
          <Route index element={<PatientDashboard />} />
          <Route path="doctors" element={<BrowseDoctorsPage />} />
          <Route path="doctors/:doctorId" element={<DoctorDetailPage />} />
          <Route path="doctors/:doctorId/book" element={<BookAppointmentPage />} />
          <Route path="appointments" element={<MyAppointmentsPage />} />
          <Route path="reports" element={<MyReportsPage />} />
          <Route path="prescriptions" element={<MyPrescriptionsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* ---------- doctor ---------- */}
        <Route
          path="/doctor"
          element={
            <RequireRole roles={['doctor']}>
              <RoleArea />
            </RequireRole>
          }
        >
          <Route index element={<DoctorDashboard />} />
          <Route path="appointments" element={<DoctorAppointmentsPage />} />
          <Route
            path="appointments/:appointmentId/prescription"
            element={<PrescriptionFormPage />}
          />
          <Route path="patients" element={<DoctorPatientsPage />} />
          <Route path="patients/:patientUserId" element={<DoctorPatientDetailPage />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* ---------- admin ---------- */}
        <Route
          path="/admin"
          element={
            <RequireRole roles={['admin']}>
              <RoleArea />
            </RequireRole>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="doctors" element={<ManageDoctorsPage />} />
          <Route path="specialties" element={<ManageSpecialtiesPage />} />
          <Route path="appointments" element={<AllAppointmentsPage />} />
          <Route path="users" element={<ManageUsersPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* A link from the first version of this app. */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />

        {/* ---------- 404 ---------- */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

// A nested <Outlet />, so one role guard wraps a whole area instead of
// each page inside it. Used by all three areas.
function RoleArea() {
  return <Outlet />;
}
