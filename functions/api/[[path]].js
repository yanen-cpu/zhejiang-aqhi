// Cloudflare Pages Functions: proxy /api/* to your Workers backend
// This makes https://zhejiang-aqhi.pages.dev/api/* work without custom domain routing.

const WORKER_BASE = 'https://zj-aqhi-worker.1779939926.workers.dev';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  // Keep the full /api/... path on the target
  const target = new URL(url.pathname + url.search, WORKER_BASE);

  // Clone method/headers/body for proxying
  const method = request.method;
  const headers = new Headers(request.headers);
  // Remove host header if present (will be set by fetch)
  headers.delete('host');

  const init = {
    method,
    headers,
  };
  if (method !== 'GET' && method !== 'HEAD') {
    const body = await request.arrayBuffer();
    init.body = body;
  }

  const resp = await fetch(target.toString(), init);
  // Pass-through response as-is
  return resp;
}
