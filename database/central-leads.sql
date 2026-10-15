-- Additive upgrade of Akasia's private lead collection; unrelated tables stay untouched.
alter table public.akasia_campaign_leads alter column phone drop not null;
alter table public.akasia_campaign_leads drop constraint akasia_campaign_leads_phone_check;
alter table public.akasia_campaign_leads add constraint akasia_campaign_leads_phone_check check (phone is null or phone ~ '^[1-9][0-9]{8,14}$');
alter table public.akasia_campaign_leads drop constraint akasia_campaign_leads_area_check;
alter table public.akasia_campaign_leads add constraint akasia_campaign_leads_area_check check (char_length(area) between 1 and 256);
alter table public.akasia_campaign_leads
  add column source_form text not null default 'campaign' check (source_form in ('campaign','body-concern-check','body-journey-match','body-goal-navigator')),
  add column external_id uuid,
  add column contact varchar(160),
  add column channel text not null default 'whatsapp' check (channel in ('whatsapp','email')),
  add column email varchar(160),
  add column city varchar(80),
  add column consultation_consent boolean default true,
  add column marketing_consent boolean not null default false,
  add column areas text[] generated always as (string_to_array(area, ' · ')) stored,
  add column details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object');
alter table public.akasia_campaign_settings add column lead_magnet_key_hash text;
create unique index akasia_campaign_leads_external on public.akasia_campaign_leads(source_form,external_id) where external_id is not null;
create index akasia_campaign_leads_form_time on public.akasia_campaign_leads(environment,source_form,created_at desc,id desc);
create index akasia_campaign_leads_areas on public.akasia_campaign_leads using gin(areas);

create or replace function public.akasia_campaign_facets(p_environment text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'total', (select count(*) from public.akasia_campaign_leads where environment = p_environment),
    'sources', (select coalesce(jsonb_agg(s.utm_source order by s.utm_source), '[]'::jsonb) from (select distinct utm_source from public.akasia_campaign_leads where environment = p_environment limit 500) s),
    'campaigns', (select coalesce(jsonb_agg(c.utm_campaign order by c.utm_campaign), '[]'::jsonb) from (select distinct utm_campaign from public.akasia_campaign_leads where environment = p_environment limit 500) c),
    'forms', (select coalesce(jsonb_agg(f.source_form order by f.source_form), '[]'::jsonb) from (select distinct source_form from public.akasia_campaign_leads where environment = p_environment) f),
    'areas', (select coalesce(jsonb_agg(a.area order by a.area), '[]'::jsonb) from (select distinct unnest(areas) as area from public.akasia_campaign_leads where environment = p_environment) a)
  );
$$;
revoke all on function public.akasia_campaign_facets(text) from public, anon, authenticated;
grant execute on function public.akasia_campaign_facets(text) to service_role;
