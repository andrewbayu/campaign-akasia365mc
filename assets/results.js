(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
    const data = await response.json();
    if (!response.ok) { if (response.status === 401 && !path.endsWith('/login')) location.replace('/result'); throw new Error(data.error || 'Data gagal dimuat. Coba lagi.'); }
    return data;
  }
  const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if ($('login-form')) {
    $('login-form').addEventListener('submit', async event => {
      event.preventDefault(); const button = event.target.querySelector('button');
      button.disabled = true; button.textContent = 'Memeriksa…'; $('login-error').textContent = '';
      try { await post('/api/results/login', { password: $('password').value }); location.replace('/result'); }
      catch (error) { $('login-error').textContent = error.message || 'Tidak dapat masuk. Coba lagi.'; button.disabled = false; button.textContent = 'Masuk →'; }
    });
    return;
  }
  if (!$('filters')) return;
  let page = 1, limit = 25, serial = 0, controller;
  const filters = $('filters'), formatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  const parameters = () => { const query = new URLSearchParams(new FormData(filters)); for (const [key, value] of [...query]) if (!value) query.delete(key); query.set('page', String(page)); query.set('limit', String(limit)); return query; };
  const initial = new URLSearchParams(location.search);
  for (const field of filters.elements) if (field.name && initial.has(field.name)) field.value = initial.get(field.name);
  if ([25, 50, 100].includes(Number(initial.get('limit')))) limit = Number(initial.get('limit'));
  $('page-size').value = String(limit);
  function options(id, values, placeholder, selected) {
    const select = $(id); select.replaceChildren(new Option(placeholder, ''));
    for (const value of values) select.add(new Option(value ?? 'Tanpa UTM', value ?? '__none__'));
    if (selected && ![...select.options].some(option => option.value === selected)) select.add(new Option(selected === '__none__' ? 'Tanpa UTM' : selected, selected));
    select.value = selected || '';
  }
  function textCell(row, value, extra) {
    const cell = document.createElement('td'); cell.textContent = value || '—';
    if (extra) { const small = document.createElement('small'); small.textContent = extra; cell.append(small); }
    row.append(cell); return cell;
  }
  async function load() {
    const current = ++serial; controller?.abort(); controller = new AbortController();
    $('data-status').textContent = 'Memuat data…'; $('results-error').textContent = '';
    $('previous').disabled = true; $('next').disabled = true; $('refresh').disabled = true;
    $('lead-rows').replaceChildren(); $('empty-state').hidden = true;
    const query = parameters(), source = $('source').value || initial.get('source') || '', campaign = $('campaign').value || initial.get('campaign') || '';
    if (source) query.set('source', source); if (campaign) query.set('campaign', campaign);
    initial.delete('source'); initial.delete('campaign');
    try {
      const [data, facets] = await Promise.all([api('/api/results/data?' + query, { signal: controller.signal }), api('/api/results/facets?environment=' + encodeURIComponent($('environment').value), { signal: controller.signal })]);
      if (serial !== current) return;
      if (page > 1 && !data.rows.length && data.total) { page = Math.ceil(data.total / limit); return load(); }
      options('source', facets.sources, 'Semua sumber', source); options('campaign', facets.campaigns, 'Semua campaign', campaign);
      $('total-count').textContent = new Intl.NumberFormat('id-ID').format(facets.total);
      $('filtered-count').textContent = new Intl.NumberFormat('id-ID').format(data.total);
      const fragment = document.createDocumentFragment();
      for (const lead of data.rows) {
        const row = document.createElement('tr');
        textCell(row, formatter.format(new Date(lead.created_at)), 'WIB'); textCell(row, lead.name);
        const cell = textCell(row, ''); cell.replaceChildren(); const link = document.createElement('a');
        link.textContent = '+' + lead.phone; link.href = 'https://wa.me/' + encodeURIComponent(lead.phone); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'phone-link'; cell.append(link);
        textCell(row, lead.area); textCell(row, lead.utm_source || 'Tanpa UTM', lead.utm_medium); textCell(row, lead.utm_campaign); textCell(row, lead.utm_content); textCell(row, lead.utm_term, lead.utm_id ? 'ID: ' + lead.utm_id : '');
        fragment.append(row);
      }
      $('lead-rows').replaceChildren(fragment); $('empty-state').hidden = data.rows.length !== 0;
      $('data-status').textContent = data.total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, data.total)} dari ${data.total}` : '0 submission';
      $('page-label').textContent = `Halaman ${page} / ${Math.max(1, Math.ceil(data.total / limit))}`;
      $('previous').disabled = page === 1; $('next').disabled = page * limit >= data.total;
      // Search contains personal information; never persist it in the browser URL.
      const shareable = new URLSearchParams(query); shareable.delete('q'); history.replaceState(null, '', '/result' + (shareable.size ? '?' + shareable : ''));
    } catch (error) {
      if (serial === current && error.name !== 'AbortError') { $('results-error').textContent = error.message || 'Data gagal dimuat.'; $('data-status').textContent = 'Gagal memuat data'; $('total-count').textContent = '—'; $('filtered-count').textContent = '—'; }
    } finally { if (serial === current) $('refresh').disabled = false; }
  }
  filters.addEventListener('submit', event => { event.preventDefault(); page = 1; load(); });
  filters.addEventListener('reset', () => { initial.delete('source'); initial.delete('campaign'); setTimeout(() => { filters.elements.environment.value = 'production'; filters.elements.order.value = 'newest'; page = 1; load(); }, 0); });
  $('environment').addEventListener('change', () => { $('source').value = ''; $('campaign').value = ''; page = 1; load(); });
  $('refresh').addEventListener('click', load);
  $('previous').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('next').addEventListener('click', () => { page++; load(); });
  $('page-size').addEventListener('change', () => { limit = Number($('page-size').value); page = 1; load(); });
  $('logout').addEventListener('click', async () => { try { await post('/api/results/logout', {}); location.replace('/result'); } catch (error) { $('results-error').textContent = error.message; } });
  $('utm-form').addEventListener('submit', event => {
    event.preventDefault(); const url = new URL('/', location.origin);
    for (const [key, value] of new FormData(event.target)) if (value.trim()) url.searchParams.set(key, value.trim());
    $('utm-link').value = url.toString(); $('utm-output').hidden = false; $('copy-status').textContent = '';
  });
  $('copy-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('utm-link').value); $('copy-status').textContent = 'Tautan tersalin.'; }
    catch { $('utm-link').select(); $('copy-status').textContent = 'Pilih dan salin tautan di atas.'; }
  });
  load();
})();
