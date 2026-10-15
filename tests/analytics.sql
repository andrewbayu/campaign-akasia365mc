-- Synthetic rows exist only inside this transaction; no production records change.
begin;
insert into public.akasia_campaign_leads(id,created_at,name,phone,email,area,consent,privacy_version,environment,source_host,source_form,consultation_consent,utm_source,utm_campaign)
select gen_random_uuid(),'2026-10-14T17:00:00Z'::timestamptz+i*interval '1 hour','QA Insights','6281200000000','qa-insights@example.com','Lengan · Perut & pinggang',true,'qa','preview','qa-analytics','body-concern-check',i%2=0,case when i%3=0 then null else 'meta' end,'qa-insights-transaction' from generate_series(0,29) i;
insert into public.akasia_campaign_leads(id,created_at,name,phone,area,consent,privacy_version,environment,source_host,source_form,consultation_consent,utm_campaign)
values(gen_random_uuid(),'2026-10-18T17:00:00Z','QA Insights','6281200000000','Lengan · Perut & pinggang',true,'qa','preview','qa-analytics','body-concern-check',true,'qa-insights-transaction');
do $$
declare data jsonb;
begin
  data:=public.akasia_campaign_analytics(p_environment=>'preview',p_campaign=>'qa-insights-transaction');
  assert (data->>'total')::int=31,'aggregate must include all rows, beyond one table page';
  assert (data->>'followup')::int=16,'follow-up consent count';
  assert (data->>'with_utm')::int=20,'missing attribution remains unknown';
  assert jsonb_array_length(data->'trend')=5,'zero-filled Jakarta calendar days';
  assert (data->'trend'->2->>'count')::int=0,'no-submission day is zero';
  assert (select sum((item->>'count')::int) from jsonb_array_elements(data->'areas') item)=62,'multiple area choices counted separately';
  data:=public.akasia_campaign_analytics(p_environment=>'preview',p_campaign=>'qa-insights-transaction',p_after=>'2026-10-14T17:00:00Z',p_before=>'2026-10-15T17:00:00Z',p_area=>'Perut & pinggang',p_form=>'body-concern-check',p_search=>'62812');
  assert (data->>'total')::int=24,'inclusive Jakarta day start, exclusive next-day start';
  assert data->'trend'->0->>'date'='2026-10-15','bucket uses Jakarta date';
  data:=public.akasia_campaign_analytics(p_environment=>'preview',p_campaign=>'qa-insights-transaction',p_source=>'__none__');
  assert (data->>'total')::int=11,'unknown source filter';
  data:=public.akasia_campaign_analytics(p_environment=>'preview',p_campaign=>'qa-insights-transaction',p_consultation=>'no');
  assert (data->>'total')::int=15,'consent filter';
  data:=public.akasia_campaign_analytics(p_environment=>'preview',p_campaign=>'qa-insights-transaction',p_search=>'qa-insights@example.com');
  assert (data->>'total')::int=30,'email search';
  data:=public.akasia_campaign_analytics(p_environment=>'production',p_campaign=>'qa-insights-transaction');
  assert (data->>'total')::int=0 and data->'trend'='[]'::jsonb and data->'areas'='[]'::jsonb,'production isolated from QA, safe empty charts';
end;
$$;
rollback;
