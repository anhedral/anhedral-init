import { useAuth } from '@clerk/expo';
import { useMemo } from 'react';
import { APIClient } from '@/api/client';
import { apiBaseUrl } from '@/lib/config';

export function useAPI() {
  const { getToken } = useAuth();
  return useMemo(() => new APIClient(apiBaseUrl, getToken), [getToken]);
}
