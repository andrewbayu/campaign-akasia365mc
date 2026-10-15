# Submission records and protected results

The existing form opens WhatsApp without storing leads. Historical submissions cannot be recovered from this application. Start recording new, consented submissions after activation; keep the approved WhatsApp number and message unchanged.

## Flow

Capture the latest tagged arrival's UTM source, medium, campaign, content, term and ID in session storage. Keep attribution across navigation within that tab, but never merge fields from separate campaign links. Submit name, WhatsApp, selected area, consent and attribution to a same-origin API. Save first, then continue to WhatsApp and fire the existing Lead event. Retrying the same submission must not duplicate the record. A failed save preserves the form and offers retry.

## Storage and hosting

Use dedicated Akasia tables in the user-selected Supabase project. Public roles cannot read or write these tables. A Supabase Edge Function owns validation, persistence, authentication and filtered queries. It uses the platform's injected server credential, never a key shipped to the browser. Small Vercel and Netlify functions proxy the same-origin routes to that backend; there are no database credentials in either site's static build.

Build public files from an explicit allowlist into `dist`. Backend source, tests, migrations, local credentials and documentation are excluded. Deploy previews are labeled as test submissions and excluded from the default production view.

## Access and results

`/result` renders a login screen until a valid server-verified session exists. The password is hashed with PBKDF2; sessions use signed, expiring HttpOnly/Secure/SameSite cookies. API data routes require the same session. Add durable login throttling, request validation, no-store headers and logout. No lead data or password is embedded in HTML or browser storage.

After login, show a paginated table with time in Asia/Jakarta, name, WhatsApp, selected area and UTM columns. Filter by date range, area, source and campaign; search name or phone; allow newest/oldest sorting. Provide an optional UTM link builder. Render all visitor-controlled values as text.

## Verification

Exercise unauthorized access, incorrect/expired/tampered sessions, login throttling, logout, input validation, submission idempotency, tracking-failure resilience, UTM persistence and Jakarta date boundaries. Verify both hosting adapters, deployment isolation and public build contents. Use synthetic data for end-to-end checks and remove it afterward. Production activation requires the storage-project choice and administrator password setup.
