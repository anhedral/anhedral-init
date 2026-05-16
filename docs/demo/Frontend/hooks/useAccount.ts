import { useAuth } from '@clerk/expo';
import * as React from 'react';
import { useAPI } from '@/hooks/useAPI';

export type AccountSummary = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  imageUrl?: string | null;
};

export function useAccount() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useAPI();
  const [account, setAccount] = React.useState<AccountSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!isLoaded || !isSignedIn) {
      setAccount(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.getMe();
      setAccount(response.user);
      return response.user;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load account');
      return null;
    } finally {
      setLoading(false);
    }
  }, [api, isLoaded, isSignedIn]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    account,
    loading,
    error,
    refresh,
  };
}
