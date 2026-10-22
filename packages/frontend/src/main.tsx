import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/globals.css';
import { applyProviderClass } from '@/lib/providers';
import { toast } from '@/hooks/use-toast';
import { applyTheme, getStoredTheme } from '@/stores/appearanceStore';
import { I18nProvider } from '@/lib/i18n';

// Initialize theme before render to prevent flash
function initializeTheme() {
  applyTheme(getStoredTheme());
}

initializeTheme();

// Keep the app shell visually Cooder regardless of the selected CLI provider.
function initializeProvider() {
  applyProviderClass('cooder');
}

initializeProvider();

function initializeClientPerformance() {
  const root = document.documentElement;
  const syncVisibility = () => {
    // Marks a hidden tab; nothing is styled by it, code may read it.
    root.classList.toggle('cooder-page-hidden', document.hidden);
  };
  document.addEventListener('visibilitychange', syncVisibility, { passive: true });
  syncVisibility();
}

initializeClientPerformance();

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

registerServiceWorker();

const queryClient = new QueryClient({
  // Backstop for mutations without their own onError. A failed rename, star or
  // delete used to be swallowed entirely: the optimistic UI snapped back with no
  // explanation, which reads as the app losing the click. A mutation that does
  // handle its own errors opts out by setting `meta.silenceErrorToast`.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError || mutation.meta?.silenceErrorToast) return;
      toast({
        title: 'Action failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
