import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from './api.js';

/** Sets breadcrumbs / current space / active page in the surrounding layout */
export function useChrome(crumbs, spaceKey = null, pageId = null) {
  const ctx = useOutletContext();
  const crumbKey = JSON.stringify(crumbs);
  useEffect(() => {
    ctx?.setCrumbs(crumbs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crumbKey]);
  useEffect(() => { ctx?.setCurrentSpace(spaceKey); }, [spaceKey, ctx]);
  useEffect(() => { ctx?.setActivePageId(pageId); }, [pageId, ctx]);
}

/** Minimal data loader: { data, error, loading, reload, setData } */
export function useFetch(url, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get(url)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error) => !cancelled && setState({ data: null, error, loading: false }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);
  return {
    ...state,
    reload: () => setTick((t) => t + 1),
    setData: (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })),
  };
}
