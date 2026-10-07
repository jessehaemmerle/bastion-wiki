export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(method, url, body, opts = {}) {
  const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${url}`, init);
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Server – bist du offline?');
  }
  if (opts.raw) return res;
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const err = new ApiError(res.status, data?.error || `Fehler ${res.status}`, data);
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('bastion:unauthorized'));
    throw err;
  }
  if (res.headers.get('X-Bastion-Offline')) data.__offline = true;
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url, body) => request('DELETE', url, body),
  upload: (url, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    return request('POST', url, fd);
  },
};

export const qs = (params) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, v);
  const str = s.toString();
  return str ? `?${str}` : '';
};
