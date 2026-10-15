-- Private aggregate only. Uses the same filters as the lead table, without pagination.
create or replace function public.akasia_campaign_analytics(
  p_environment text, p_after timestamptz default null, p_before timestamptz default null,
  p_area text default null, p_form text default null, p_consultation text default null,
  p_source text default null, p_campaign text default null, p_search text default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
with filtered as materialized (
  select created_at,source_form,areas,utm_source,consultation_consent
  from public.akasia_campaign_leads
  where environment=p_environment
    and (p_after is null or created_at>=p_after) and (p_before is null or created_at<p_before)
    and (p_area is null or areas @> array[p_area]) and (p_form is null or source_form=p_form)
    and (p_consultation is null or (p_consultation='yes' and consultation_consent=true) or (p_consultation='no' and consultation_consent=false) or (p_consultation='unknown' and consultation_consent is null))
    and (p_source is null or (p_source='__none__' and utm_source is null) or (p_source<>'__none__' and utm_source=p_source))
    and (p_campaign is null or (p_campaign='__none__' and utm_campaign is null) or (p_campaign<>'__none__' and utm_campaign=p_campaign))
    and (p_search is null or name ilike '%'||p_search||'%' or phone ilike '%'||p_search||'%' or email ilike '%'||p_search||'%' or contact ilike '%'||p_search||'%')
), bounds as (
  select min(created_at at time zone 'Asia/Jakarta') as first_at,max(created_at at time zone 'Asia/Jakarta') as last_at from filtered
), grain as (
  select *,case when last_at::date-first_at::date<=60 then 'day' when last_at::date-first_at::date<=365 then 'week' else 'month' end as unit from bounds
), ticks as (
  select generate_series(date_trunc(unit,first_at),date_trunc(unit,last_at),case unit when 'day' then interval '1 day' when 'week' then interval '1 week' else interval '1 month' end) as bucket from grain
), daily as (
  select date_trunc(g.unit,f.created_at at time zone 'Asia/Jakarta') as bucket,count(*) as count from filtered f cross join grain g group by 1
), trend as (
  select to_char(t.bucket,'YYYY-MM-DD') as date,coalesce(d.count,0) as count from ticks t left join daily d using(bucket) order by t.bucket
), forms as (
  select source_form as key,count(*) as count from filtered group by 1 order by 2 desc,1
), source_counts as (
  select utm_source as key,count(*) as count from filtered group by 1
), ranked_sources as (
  select *,row_number() over(order by count desc,key nulls first) as rank from source_counts
), sources as (
  select case when rank<=6 or key is null then key else null end as key,
    (rank>6 and key is not null) as other,sum(count)::bigint as count from ranked_sources group by 1,2 order by 3 desc,1 nulls first
), area_counts as (
  select area as key,count(*) as count from filtered cross join lateral unnest(areas) area group by 1
), ranked_areas as (
  select *,row_number() over(order by count desc,key) as rank from area_counts
), areas as (
  select case when rank<=6 then key else null end as key,(rank>6) as other,sum(count)::bigint as count from ranked_areas group by 1,2 order by 3 desc,1
)
select jsonb_build_object(
  'total',(select count(*) from filtered),
  'followup',(select count(*) from filtered where consultation_consent=true),
  'with_utm',(select count(*) from filtered where utm_source is not null),
  'grain',(select unit from grain),'timezone','Asia/Jakarta',
  'trend',coalesce((select jsonb_agg(to_jsonb(trend)) from trend),'[]'::jsonb),
  'forms',coalesce((select jsonb_agg(to_jsonb(forms)) from forms),'[]'::jsonb),
  'sources',coalesce((select jsonb_agg(to_jsonb(sources)) from sources),'[]'::jsonb),
  'areas',coalesce((select jsonb_agg(to_jsonb(areas)) from areas),'[]'::jsonb)
);
$$;
revoke all on function public.akasia_campaign_analytics(text,timestamptz,timestamptz,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.akasia_campaign_analytics(text,timestamptz,timestamptz,text,text,text,text,text,text) to service_role;
