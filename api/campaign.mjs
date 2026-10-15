import { proxyRequest } from '../server/proxy.mjs';
// Vercel overwrites x-forwarded-for at its edge to prevent client spoofing.
export default { fetch: request => proxyRequest(request, { key: process.env.AKASIA_PROXY_KEY, ip: request.headers.get('x-forwarded-for')?.split(',')[0].trim() }) };
