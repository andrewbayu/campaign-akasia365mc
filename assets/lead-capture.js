(() => {
  'use strict';
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];
  const storageKey = 'akasia_campaign_attribution_v1', url = new URL(location.href);
  let attribution = {}, pending;
  function clean(value) { return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 256) : ''; }
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    for (const key of keys) if (clean(stored[key])) attribution[key] = clean(stored[key]);
  } catch { /* Capture still works when browser storage is unavailable. */ }
  if (keys.some(key => url.searchParams.has(key))) {
    attribution = {};
    for (const key of keys) if (clean(url.searchParams.get(key))) attribution[key] = clean(url.searchParams.get(key));
    try { sessionStorage.setItem(storageKey, JSON.stringify(attribution)); } catch { /* In-memory attribution remains available. */ }
  }
  window.akasiaLeadCapture = {
    async submit(fields) {
      const fingerprint = JSON.stringify([fields.name.trim(), fields.phone.trim(), fields.area]);
      // A retry after a timeout or repeated click reuses the same submission ID.
      if (!pending || pending.fingerprint !== fingerprint) pending = { fingerprint, id: crypto.randomUUID() };
      const page = new URL(url.pathname, url.origin);
      for (const key of keys) if (url.searchParams.has(key)) page.searchParams.set(key, clean(url.searchParams.get(key)));
      const response = await fetch('/api/leads', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, id: pending.id, utm: { ...attribution }, page_url: page.toString(), referrer: document.referrer || '' }), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error(data.error || 'Data belum tersimpan. Silakan coba lagi.');
      return true;
    },
  };
})();
