// A small client for the OpenHabit REST API (/api/v1), authenticated with a personal API token.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createApi({ baseUrl, token, fetchImpl = fetch }) {
  if (!baseUrl) throw new Error('OPENHABIT_URL is not set (for example https://habits.example.com)');
  if (!token) throw new Error('OPENHABIT_TOKEN is not set (Account → API tokens in the web app)');
  const root = baseUrl.replace(/\/+$/, '') + '/api/v1';
  async function call(method, path, body) {
    const res = await fetchImpl(root + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!res.ok) throw new ApiError(res.status, json?.error ?? json?.errors?.join(', ') ?? `${method} ${path} failed with ${res.status}`);
    return json;
  }
  return {
    get: (p) => call('GET', p),
    put: (p, b) => call('PUT', p, b),
    post: (p, b) => call('POST', p, b),
    del: (p) => call('DELETE', p),
  };
}
