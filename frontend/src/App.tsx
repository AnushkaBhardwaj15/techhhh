import { lazy, Suspense, useEffect, useState } from 'react';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { getMe, logout } from './lib/api/auth';
import { ApiError } from './lib/api/client';
import { useAuthUiStore } from './features/auth/authStore';
import { roleHomePath } from './features/auth/routing';
import { queryClient } from './lib/queryClient';
import { ErrorMessage, LoadingMessage } from './components/Feedback';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ParticipantNav } from './components/navigation/ParticipantNav';
import { AdminTopBar } from './components/navigation/AdminTopBar';
import type { AuthenticatedUser } from './types/auth';
import './styles/global.css';

const LandingPage = lazy(() => import('./features/landing/LandingPage').then((module) => ({ default: module.LandingPage })));
const LoginPage = lazy(() => import('./features/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const AdminDashboard = lazy(() => import('./features/admin/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));
const AdminLayout = lazy(() => import('./features/admin/AdminLayout').then((module) => ({ default: module.AdminLayout })));
const AdminEventManagement = lazy(() => import('./features/admin/AdminEventManagement').then((module) => ({ default: module.AdminEventManagement })));
const AdminRounds = lazy(() => import('./features/admin/AdminRounds').then((module) => ({ default: module.AdminRounds })));
const AdminQuestions = lazy(() => import('./features/admin/AdminQuestions').then((module) => ({ default: module.AdminQuestions })));
const AdminParticipants = lazy(() => import('./features/admin/AdminParticipants').then((module) => ({ default: module.AdminParticipants })));
const AdminDrawControl = lazy(() => import('./features/admin/AdminDrawControl').then((module) => ({ default: module.AdminDrawControl })));
const AdminClaims = lazy(() => import('./features/admin/AdminClaims').then((module) => ({ default: module.AdminClaims })));
const AdminWinners = lazy(() => import('./features/admin/AdminWinners').then((module) => ({ default: module.AdminWinners })));
const AdminAdministrators = lazy(() => import('./features/admin/AdminAdministrators').then((module) => ({ default: module.AdminAdministrators })));
const AdminAudit = lazy(() => import('./features/admin/AdminAudit').then((module) => ({ default: module.AdminAudit })));
const AdminSystem = lazy(() => import('./features/admin/AdminSystem').then((module) => ({ default: module.AdminSystem })));
const ParticipantLobby = lazy(() => import('./features/participant/ParticipantLobby').then((module) => ({ default: module.ParticipantLobby })));
const ParticipantTicket = lazy(() => import('./features/participant/ParticipantTicket').then((module) => ({ default: module.ParticipantTicket })));
const ParticipantGame = lazy(() => import('./features/participant/ParticipantGame').then((module) => ({ default: module.ParticipantGame })));
const ParticipantClaims = lazy(() => import('./features/participant/ParticipantClaims').then((module) => ({ default: module.ParticipantClaims })));
const ParticipantResults = lazy(() => import('./features/participant/ParticipantResults').then((module) => ({ default: module.ParticipantResults })));
const LiveDisplay = lazy(() => import('./features/live/LiveDisplay').then((module) => ({ default: module.LiveDisplay })));

function ProtectedLayout({ allowed }: { allowed: AuthenticatedUser['role'][] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
      queryClient.clear();
      identityChanged();
      navigate('/login', { replace: true });
    } catch {
      setLogoutError('We could not end your session. Check your connection and try again.');
    } finally {
      setLoggingOut(false);
    }
  }

  const sessionVersion = useAuthUiStore((state) => state.sessionVersion);
  const session = useQuery({ queryKey: ['auth', 'me', sessionVersion], queryFn: ({ signal }) => getMe(signal) });
  useEffect(() => {
    if (session.error instanceof ApiError && session.error.status === 401) queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
  }, [session.error, queryClient]);
  if (session.isPending) return <LoadingMessage />;
  if (session.error instanceof ApiError && session.error.status === 401) return <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search + location.hash }} />;
  if (session.error instanceof ApiError && session.error.status === 403) return <ErrorMessage>Access to this account is not permitted.</ErrorMessage>;
  if (session.error) return <ErrorMessage>Connection failed. Refresh to try again.</ErrorMessage>;
  const user = session.data;
  if (!user || !user.role) return <ErrorMessage>We could not identify this account's role. Contact your event administrator.</ErrorMessage>;
  if (!allowed.includes(user.role)) return <Navigate to={roleHomePath(user.role)} replace />;

  return (
    <div className="role-page">
      {user.role === 'PARTICIPANT' ? (
        <ParticipantNav user={user} onLogout={handleLogout} isLoggingOut={loggingOut} />
      ) : (
        <AdminTopBar user={user} onLogout={handleLogout} isLoggingOut={loggingOut} />
      )}
      {logoutError && (
        <div role="alert" style={{ padding: '8px 24px', background: '#f9e5df', color: '#842e28', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700 }}>
          {logoutError}
        </div>
      )}
      <Outlet context={user} />
    </div>
  );
}

function LoginRoute() {
  const sessionVersion = useAuthUiStore((state) => state.sessionVersion);
  const session = useQuery({ queryKey: ['auth', 'me', sessionVersion], queryFn: ({ signal }) => getMe(signal) });
  if (session.isPending) return <LoadingMessage />;
  if (session.data) return <Navigate to={roleHomePath(session.data.role)} replace />;
  if (session.error instanceof ApiError && session.error.status === 403) return <ErrorMessage>Access to this account is not permitted.</ErrorMessage>;
  if (session.error instanceof Error && session.error.name === 'ZodError') return <ErrorMessage>We could not identify this account's role. Contact your event administrator.</ErrorMessage>;
  if (session.error && !(session.error instanceof ApiError && session.error.status === 401)) return <ErrorMessage>Connection failed. Refresh to try again.</ErrorMessage>;
  return <LoginPage />;
}

function AdminAdministratorsRoute() {
  const user = useOutletContext<AuthenticatedUser>();
  return user.role === 'SUPER_ADMIN' ? <AdminAdministrators user={user} /> : <Navigate to="/admin" replace />;
}

function SuperAdminSystemRoute() {
  const user = useOutletContext<AuthenticatedUser>();
  return user.role === 'SUPER_ADMIN' ? <AdminSystem /> : <Navigate to="/admin" replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingMessage>Loading page…</LoadingMessage>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/live" element={<LiveDisplay />} />
        <Route path="/display" element={<LiveDisplay />} />
        <Route path="/display/round" element={<LiveDisplay />} />
        <Route path="/display/winner" element={<LiveDisplay />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route element={<ProtectedLayout allowed={['PARTICIPANT']} />}>
          <Route path="/participant" element={<Navigate to="/participant/lobby" replace />} />
          <Route path="/participant/lobby" element={<ParticipantLobby />} />
          <Route path="/participant/ticket" element={<ParticipantTicket />} />
          <Route path="/participant/game" element={<ParticipantGame />} />
          <Route path="/participant/claims" element={<ParticipantClaims />} />
          <Route path="/participant/results" element={<ParticipantResults />} />
        </Route>
        <Route element={<ProtectedLayout allowed={['ADMIN', 'SUPER_ADMIN']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="event" element={<AdminEventManagement />} />
            <Route path="events" element={<Navigate to="/admin/event" replace />} />
            <Route path="rounds" element={<AdminRounds />} />
            <Route path="questions" element={<AdminQuestions />} />
            <Route path="participants" element={<AdminParticipants />} />
            <Route path="draw-control" element={<AdminDrawControl />} />
            <Route path="claims" element={<AdminClaims />} />
            <Route path="winners" element={<AdminWinners />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="administrators" element={<AdminAdministratorsRoute />} />
            <Route path="system" element={<SuperAdminSystemRoute />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

