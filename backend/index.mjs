import { createHandler } from '../server/core.mjs';
import { createStore } from '../server/store.mjs';

// Credentials are injected by Supabase into the Edge Function environment.
// Neither key nor results credentials are forwarded to the browser or host proxy.
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const key = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const store = createStore({ url: Deno.env.get('SUPABASE_URL'), key });
Deno.serve(createHandler({ store }));
