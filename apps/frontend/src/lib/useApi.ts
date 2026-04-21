'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from './api';
import { useAuth } from './auth';

export interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Tiny GET helper bound to the current session. Re-fetches when `path`
 * changes or `reload()` is called. Returns `{data, error, loading, reload}`.
 */
export function useApi<T>(path: string | null): UseApiResult<T> {
  const { session } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path || !session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<T>(path, { token: session.token })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, session?.token, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}
