-- Every QC client and quality that has a live certificate, for the
-- /certificates Client and Quality filters. Security invoker: RLS applies.
create or replace function public.certificate_list_filter_options()
returns table (client_id uuid, client_name text, quality_id uuid, quality_name text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct
    s.client_id,
    coalesce(nullif(c.fantasy_name, ''), c.name) as client_name,
    s.quality_spec_id as quality_id,
    case when s.quality_spec_id is null then null
         else coalesce(nullif(cq.custom_name, ''), qt.name, 'Unknown') end as quality_name
  from certificates ce
  join samples s on s.id = ce.sample_id and s.deleted_at is null
  join companies c on c.id = s.client_id
  left join client_qualities cq on cq.id = s.quality_spec_id
  left join quality_templates qt on qt.id = cq.template_id;
$$;

grant execute on function public.certificate_list_filter_options() to authenticated;
