import { useCallback, useEffect, useState } from 'react';

export function useRemoteData<T>(fetcher: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: string; fetcher?: typeof fetcher; revision: number }>({ data: null, error: '', revision: -1 });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => fetcher(controller.signal)).then((data) => {
      if (!controller.signal.aborted) setState({ data, error: '', fetcher, revision });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setState((previous) => ({
          data: previous.data,
          fetcher,
          revision,
          error: error instanceof Error ? error.message : 'No se pudieron cargar los datos.',
        }));
      }
    });
    return () => controller.abort();
  }, [fetcher, revision]);
  const loading = state.fetcher !== fetcher || state.revision !== revision;
  // Mantener los datos anteriores durante una recarga evita que la pantalla
  // desaparezca mientras Render responde. El indicador local comunica que
  // hay una actualización en curso.
  return { data: state.data, error: loading ? '' : state.error, loading,
    retry: useCallback(() => setRevision((value) => value + 1), []) };
}
