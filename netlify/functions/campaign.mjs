import { proxyRequest } from '../../server/proxy.mjs';
export default proxyRequest;
export const config = { path: ['/result', '/result/', '/api/leads', '/api/results/*'] };
