create table if not exists public.akasia_campaign_leads (
  id uuid primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  phone text not null check (phone ~ '^628[0-9]{7,12}$' and char_length(phone) <= 15),
  area text not null check (area in ('Perut Bawah', 'Lengan Atas', 'Paha (Dalam/Luar)', 'Pinggang / Flank')),
  consent boolean not null check (consent = true),
  privacy_version text not null,
  environment text not null check (environment in ('production','preview')),
  source_host text not null,
  utm_source varchar(256), utm_medium varchar(256), utm_campaign varchar(256),
  utm_content varchar(256), utm_term varchar(256), utm_id varchar(256),
  page_url varchar(2048), referrer varchar(512)
);
create index if not exists akasia_campaign_leads_time on public.akasia_campaign_leads (environment, created_at desc, id desc);
create index if not exists akasia_campaign_leads_area on public.akasia_campaign_leads (environment, area);
create index if not exists akasia_campaign_leads_source on public.akasia_campaign_leads (environment, utm_source);
create index if not exists akasia_campaign_leads_campaign on public.akasia_campaign_leads (environment, utm_campaign);

create table if not exists public.akasia_campaign_settings (
  id text primary key check (id = 'main'),
  password_salt text not null,
  password_hash text not null,
  session_secret text not null,
  proxy_key_hash text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.akasia_campaign_limits (
  bucket text primary key,
  window_start timestamptz not null,
  hits integer not null default 1
);

alter table public.akasia_campaign_leads enable row level security;
alter table public.akasia_campaign_settings enable row level security;
alter table public.akasia_campaign_limits enable row level security;
revoke all on public.akasia_campaign_leads, public.akasia_campaign_settings, public.akasia_campaign_limits from public, anon, authenticated;
grant select, insert, update, delete on public.akasia_campaign_leads, public.akasia_campaign_settings, public.akasia_campaign_limits to service_role;

-- Only the backend's service role can execute these functions. SECURITY INVOKER
-- preserves caller privileges; there is no public RLS bypass or read policy.
create or replace function public.akasia_campaign_rate_limit(p_bucket text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_hits integer; v_start timestamptz;
begin
  if p_limit < 1 or p_seconds < 1 or char_length(p_bucket) > 160 then return false; end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  insert into public.akasia_campaign_limits(bucket, window_start, hits) values (p_bucket, v_start, 1)
  on conflict (bucket) do update set
    hits = case when public.akasia_campaign_limits.window_start = v_start then public.akasia_campaign_limits.hits + 1 else 1 end,
    window_start = v_start returning hits into v_hits;
  delete from public.akasia_campaign_limits where window_start < now() - interval '2 days';
  return v_hits <= p_limit;
end;
$$;
create or replace function public.akasia_campaign_facets(p_environment text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'total', (select count(*) from public.akasia_campaign_leads where environment = p_environment),
    'sources', (select coalesce(jsonb_agg(s.utm_source order by s.utm_source), '[]'::jsonb) from (select distinct utm_source from public.akasia_campaign_leads where environment = p_environment limit 500) s),
    'campaigns', (select coalesce(jsonb_agg(c.utm_campaign order by c.utm_campaign), '[]'::jsonb) from (select distinct utm_campaign from public.akasia_campaign_leads where environment = p_environment limit 500) c)
  );
$$;
revoke all on function public.akasia_campaign_rate_limit(text, integer, integer), public.akasia_campaign_facets(text) from public, anon, authenticated;
grant execute on function public.akasia_campaign_rate_limit(text, integer, integer), public.akasia_campaign_facets(text) to service_role;
