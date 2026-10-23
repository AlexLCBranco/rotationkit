import { useEffect, useState } from 'react';

export type Async<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ok'; value: T };

/** Run an async loader when deps change; while deps differ from the loaded ones it reports loading. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): Async<T> {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ key: string; value: Async<T> }>({ key: '', value: { status: 'loading' } });
  useEffect(() => {
    let live = true;
    load().then(
      (value) => live && setState({ key, value: { status: 'ok', value } }),
      (e: unknown) => live && setState({ key, value: { status: 'error', error: e instanceof Error ? e.message : String(e) } }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.value : { status: 'loading' };
}

export function remember(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
