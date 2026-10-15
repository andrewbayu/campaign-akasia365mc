import { SECURITY_HEADERS } from './core.mjs';
const BACKEND_URL = 'https://jpjsycnbamvxnwmziedh.supabase.co/functions/v1/akasia-campaign';
export async function proxyRequest(request, { key, ip } = {}) {
  if (!key || !ip) return Response.json({ error: 'Layanan belum tersedia. Silakan coba lagi.' }, { status: 503, headers: SECURITY_HEADERS });
  const url = new URL(request.url);
  const route = url.searchParams.get('__route') || url.pathname;
  if (!/^\/(result\/?|api\/leads|api\/results\/(login|logout|data|facets|analytics))$/.test(route)) return new Response('Not found', { status: 404 });
  url.searchParams.delete('__route');
  const headers = new Headers();
  for (const name of ['cookie', 'origin', 'content-type']) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  headers.set('x-campaign-route', route);
  headers.set('x-campaign-host', url.host);
  headers.set('x-campaign-ip', ip);
  headers.set('x-campaign-proxy-key', key);
  try {
    const response = await fetch(BACKEND_URL + '?' + url.searchParams, { method: request.method, headers, ...(request.method !== 'GET' && request.method !== 'HEAD' ? { body: await request.arrayBuffer() } : {}), redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const outgoing = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) outgoing.set(name, value);
    // Supabase serves HTML as plain text on its shared domain. The application
    // proxy owns this trusted server-rendered page and restores its MIME type.
    if (route.replace(/\/$/, '') === '/result' && response.status === 200) outgoing.set('Content-Type', 'text/html; charset=utf-8');
    outgoing.delete('content-length'); outgoing.delete('content-encoding');
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    console.error('campaign_backend_unavailable');
    return Response.json({ error: 'Layanan belum tersedia. Silakan coba lagi.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
