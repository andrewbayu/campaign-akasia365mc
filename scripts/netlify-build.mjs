// Keep the existing live site if its server connection has not been configured.
if (!process.env.AKASIA_PROXY_KEY) {
  console.error('AKASIA_PROXY_KEY must be configured before deploying this feature to Netlify. Existing production remains active.');
  process.exit(1);
}
await import('./build.mjs');
