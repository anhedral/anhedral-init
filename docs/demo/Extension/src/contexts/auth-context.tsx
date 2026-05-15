import * as React from 'react';
import { ClerkProvider, useAuth as useClerkAuth, useUser } from '@clerk/chrome-extension';
import { APIClient } from '../lib/api';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL || 'http://localhost:8081';

function getExtensionUrl(path: string) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

const SIDEPANEL_URL = getExtensionUrl('sidepanel.html');

type AuthState = {
  isSignedIn: boolean;
  isLoading: boolean;
  userId: string | null;
  subscription: {
    status: 'idle' | 'loading' | 'active' | 'inactive' | 'error';
    canAccess: boolean;
    inTrial?: boolean;
    trialEndsAt?: string;
    expiresAt?: string;
    method?: 'trialing' | 'redeemed' | 'paid' | null;
    managementUrl?: string;
    cancelAtPeriodEnd?: boolean;
    error?: string;
  };
};

type AuthContextValue = AuthState & {
  signOut: () => Promise<void>;
  refreshSubscription: (opts?: { refresh?: boolean }) => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, userId, signOut, getToken } = useClerkAuth();
  const { user } = useUser();

  const [subscription, setSubscription] = React.useState<AuthState['subscription']>({
    status: 'idle',
    canAccess: false,
  });

  const apiRef = React.useRef<APIClient | null>(null);

  React.useEffect(() => {
    if (isSignedIn && getToken) {
      apiRef.current = new APIClient(getToken);
    } else {
      apiRef.current = null;
    }
  }, [isSignedIn, getToken]);

  const checkSubscription = React.useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (!apiRef.current || !isSignedIn) {
        setSubscription({ status: 'idle', canAccess: false });
        return;
      }
      setSubscription(prev => ({ ...prev, status: 'loading' }));
      try {
        const result = await apiRef.current.getSubscriptionEntitlements(opts);
        const isPro = result.pro;
        const inTrial = result.inTrial;
        setSubscription({
          status: isPro ? 'active' : 'inactive',
          canAccess: isPro,
          inTrial,
          trialEndsAt: result.trialEndsAt,
          expiresAt: result.expiresAt,
          method: result.method,
          managementUrl: result.managementUrl,
          cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        });
      } catch (error) {
        setSubscription({
          status: 'error',
          canAccess: false,
          error: error instanceof Error ? error.message : 'Failed to check subscription',
        });
      }
    },
    [isSignedIn],
  );

  React.useEffect(() => {
    if (isSignedIn && isLoaded) {
      void checkSubscription({ refresh: true });
    }
  }, [isSignedIn, isLoaded, checkSubscription]);

  const handleSignOut = React.useCallback(async () => {
    setSubscription({ status: 'idle', canAccess: false });
    await signOut();
  }, [signOut]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      isSignedIn: !!isSignedIn,
      isLoading: !isLoaded,
      userId: userId || null,
      subscription,
      signOut: handleSignOut,
      refreshSubscription: (opts?: { refresh?: boolean }) => checkSubscription(opts),
    }),
    [isSignedIn, isLoaded, userId, subscription, handleSignOut, checkSubscription],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl={SIDEPANEL_URL}
      signInFallbackRedirectUrl={SIDEPANEL_URL}
      signUpFallbackRedirectUrl={SIDEPANEL_URL}
    >
      <AuthProviderInner>{children}</AuthProviderInner>
    </ClerkProvider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { WEBSITE_URL };
