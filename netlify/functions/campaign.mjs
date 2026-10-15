import { proxyRequest } from '../../server/proxy.mjs';
// Use Netlify's trusted context rather than caller-controlled request headers.
export default (request, context) => proxyRequest(request, { key: process.env.AKASIA_PROXY_KEY, ip: context.ip });
export const config = { path: ['/result', '/result/', '/api/leads', '/api/results/*'] };
