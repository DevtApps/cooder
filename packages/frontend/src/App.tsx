import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useBasicAuthStore } from '@/stores/basicAuthStore';
import { useSocket } from '@/hooks/useSocket';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/toaster';
import { useI18n } from '@/lib/i18n';

// Lazy load pages for code splitting
const LoginScreen = lazy(() =>
  import('@/features/auth/LoginScreen').then((m) => ({ default: m.LoginScreen }))
);
const ConnectScreen = lazy(() =>
  import('@/features/auth/ConnectScreen').then((m) => ({ default: m.ConnectScreen }))
);
const AuthCallbackScreen = lazy(() =>
  import('@/features/auth/AuthCallbackScreen').then((m) => ({ default: m.AuthCallbackScreen }))
);
const ClaudeCallbackScreen = lazy(() =>
  import('@/features/auth/ClaudeCallbackScreen').then((m) => ({ default: m.ClaudeCallbackScreen }))
);
const SetupScreen = lazy(() =>
  import('@/features/auth/SetupScreen').then((m) => ({ default: m.SetupScreen }))
);
// New frontend (features/), mounted under /next while it reaches parity.
const AppShell = lazy(() =>
  import('@/features/shell/AppShell').then((m) => ({ default: m.AppShell }))
);
const HomeScreen = lazy(() =>
  import('@/features/home/HomeScreen').then((m) => ({ default: m.HomeScreen }))
);
const SessionScreen = lazy(() =>
  import('@/features/session/SessionScreen').then((m) => ({ default: m.SessionScreen }))
);
const AnalyticsScreen = lazy(() =>
  import('@/features/analytics/AnalyticsScreen').then((m) => ({ default: m.AnalyticsScreen }))
);
const SettingsScreen = lazy(() =>
  import('@/features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen }))
);

// Bookmarks from when the new interface lived under /next.
function LegacyNextRedirect() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/next/, '') || '/';
  return <Navigate to={`${rest}${location.search}${location.hash}`} replace />;
}

// Loading fallback component
function PageLoader() {
  const { t } = useI18n();
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="text-sm text-muted-foreground">{t('common.loading')}...</span>
      </div>
    </div>
  );
}

// Route that requires basic auth (if enabled)
function BasicAuthRoute({ children }: { children: React.ReactNode }) {
  const { isBasicAuthenticated, isBasicAuthEnabled, isLoading } = useBasicAuthStore();
  const { isAuthenticated, isLoading: isUserLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading || isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // If basic auth is disabled, allow access
  if (isBasicAuthEnabled === false) {
    return <>{children}</>;
  }

  // If basic auth is enabled but not authenticated, redirect to basic login
  if (isBasicAuthEnabled === true && !isBasicAuthenticated && !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const {
    isBasicAuthenticated,
    isBasicAuthEnabled,
    isLoading: isBasicLoading,
  } = useBasicAuthStore();
  const location = useLocation();

  // Initialize socket connection when authenticated
  useSocket();

  if (isLoading || isBasicLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // First check basic auth if enabled
  if (isBasicAuthEnabled === true && !isBasicAuthenticated && !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { initializeAuth: initializeBasicAuth } = useBasicAuthStore();
  const { initializeAuth: initializeUserAuth } = useAuthStore();

  // Initialize both auth stores on mount. Running them in parallel lets the
  // UI finish loading as soon as persisted tokens are verified against the
  // backend, avoiding a flash of the login page on new tabs.
  useEffect(() => {
    initializeBasicAuth();
    initializeUserAuth();
  }, [initializeBasicAuth, initializeUserAuth]);

  return (
    <>
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/basic-login" element={<Navigate to="/login" replace />} />
            <Route
              path="/connect"
              element={
                <BasicAuthRoute>
                  <ConnectScreen />
                </BasicAuthRoute>
              }
            />
            <Route
              path="/setup"
              element={
                <ProtectedRoute>
                  <SetupScreen />
                </ProtectedRoute>
              }
            />
            <Route path="/auth/callback" element={<AuthCallbackScreen />} />
            <Route path="/auth/claude/callback" element={<ClaudeCallbackScreen />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<HomeScreen />} />
              <Route path="session/:id" element={<SessionScreen />} />
              <Route path="analytics" element={<AnalyticsScreen />} />
              <Route path="settings" element={<SettingsScreen />} />
              <Route path="settings/:section" element={<SettingsScreen />} />
              {/* Addresses from the previous interface keep working. */}
              <Route path="admin/*" element={<Navigate to="/settings/admin" replace />} />
              <Route path="monitor" element={<Navigate to="/" replace />} />
              <Route path="operations" element={<Navigate to="/" replace />} />
              <Route path="classic" element={<Navigate to="/" replace />} />
            </Route>
            <Route path="/next/*" element={<LegacyNextRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <Toaster />
    </>
  );
}
