export function createStore({ url, key, fetcher = fetch }) {
  const base = url.replace(/\/$/, '') + '/rest/v1/';
  async function call(path, options = {}) {
    const response = await fetcher(base + path, { ...options, headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }), 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Storage request failed');
    return response;
  }
  return {
    async getConfig() {
      return (await (await call('akasia_campaign_settings?id=eq.main&select=password_salt,password_hash,session_secret,proxy_key_hash')).json())[0];
    },
    async consumeLimit(bucket, limit, seconds) {
      return await (await call('rpc/akasia_campaign_rate_limit', { method: 'POST', body: JSON.stringify({ p_bucket: bucket, p_limit: limit, p_seconds: seconds }) })).json();
    },
    async insertLead(lead) {
      await call('akasia_campaign_leads?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(lead) });
    },
    async listLeads(filters) {
      const query = new URLSearchParams({ select: 'id,created_at,name,phone,area,utm_source,utm_medium,utm_campaign,utm_content,utm_term,utm_id,source_host', environment: 'eq.' + filters.environment, order: 'created_at.' + filters.order + ',id.' + filters.order, limit: String(filters.limit), offset: String(filters.offset) });
      if (filters.after) query.append('created_at', 'gte.' + filters.after);
      if (filters.before) query.append('created_at', 'lt.' + filters.before);
      if (filters.area) query.set('area', 'eq.' + filters.area);
      if (filters.source) query.set('utm_source', filters.source === '__none__' ? 'is.null' : 'eq.' + filters.source);
      if (filters.campaign) query.set('utm_campaign', filters.campaign === '__none__' ? 'is.null' : 'eq.' + filters.campaign);
      if (filters.q) {
        const search = /^[+\d\s-]+$/.test(filters.q) ? filters.q.replace(/[\s-]/g, '').replace(/^0/, '62').replace(/^\+/, '') : filters.q;
        query.set('or', `(name.ilike.*${search}*,phone.ilike.*${search}*)`);
      }
      const response = await call('akasia_campaign_leads?' + query, { headers: { Prefer: 'count=exact' } });
      return { rows: await response.json(), total: Number((response.headers.get('content-range') || '0/0').split('/')[1]) || 0, page: filters.page, limit: filters.limit };
    },
    async getFacets(environment) {
      return await (await call('rpc/akasia_campaign_facets', { method: 'POST', body: JSON.stringify({ p_environment: environment }) })).json();
    },
  };
}
