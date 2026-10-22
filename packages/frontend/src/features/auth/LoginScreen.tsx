import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBasicAuthStore } from '@/stores/basicAuthStore';
import { useAuthStore } from '@/stores/authStore';
import { ProviderLogo } from '@/components/branding/ProviderLogo';
import { UI_PROVIDER_META } from '@/lib/providers';
import { api } from '@/services/api';
import { useI18n } from '@/lib/i18n';

const PROXY_ERROR_MESSAGES: Record<string, string> = {
  disabled: 'Proxy sign-in is disabled on this instance.',
  missing_email_header: 'Authelia sign-in reached the app, but no email header was forwarded.',
  email_not_allowed: 'Your Authelia email is not allowed on this instance.',
};

export function LoginScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useBasicAuthStore();
  const { setToken, isAuthenticated, isLoading: isAuthLoading } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fromState = (
    location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null
  )?.from;
  const from =
    fromState?.pathname && fromState.pathname !== '/login'
      ? `${fromState.pathname}${fromState.search ?? ''}${fromState.hash ?? ''}`
      : '/';
  const proxyError = new URLSearchParams(location.search).get('proxy_error');
  const displayedError =
    error || (proxyError ? PROXY_ERROR_MESSAGES[proxyError] || proxyError : null);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthLoading, isAuthenticated, navigate, from]);

  useEffect(() => {
    if (proxyError || isAuthLoading || isAuthenticated) return;

    let cancelled = false;
    api
      .get<{
        success: boolean;
        data: { enabled: boolean };
      }>('/auth/proxy/status')
      .then((response) => {
        if (cancelled || !response.data.success || !response.data.data.enabled) return;
        const params = new URLSearchParams({ returnTo: from });
        window.location.replace(`/auth/proxy?${params.toString()}`);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [from, isAuthLoading, isAuthenticated, proxyError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const result = await login(username, password);

    if (result.success && result.token) {
      await setToken(result.token);
      navigate(from, { replace: true });
    } else {
      setError(result.error || t('auth.loginFailed'));
    }

    setIsLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex flex-col items-center text-center">
            <img src="/favicon.svg" alt="" className="mb-5 h-11 w-11 object-contain" />
            <h1 className="text-2xl font-semibold tracking-tight">{t('auth.signInTitle')}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t('auth.tagline')}</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-xl border border-border bg-card p-6"
          >
            {displayedError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>{displayedError}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium">
                {t('auth.username')}
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                {t('auth.password')}
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="h-10 w-full gap-2"
              disabled={isLoading || !username || !password}
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? t('auth.signingIn') : t('auth.continue')}
            </Button>
          </form>
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-6 pb-8 text-xs text-muted-foreground">
        {(['codex', 'opencode', 'pi', 'claude'] as const).map((provider) => (
          <span key={provider} className="inline-flex items-center gap-1.5">
            <ProviderLogo provider={provider} className="h-3.5 w-3.5 opacity-70" alt="" />
            {UI_PROVIDER_META[provider].label}
          </span>
        ))}
      </footer>
    </div>
  );
}
