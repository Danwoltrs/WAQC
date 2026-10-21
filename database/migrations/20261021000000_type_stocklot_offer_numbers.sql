-- Type and stocklot samples: brokerage offers, no contract (Daniel 2026-10-21).
--
-- 1. A visible running number shared by type AND stocklot samples, so a sample
--    we sent can be found again later: TS-0001/26, TS-0002/26 ... resetting each
--    year like the certificate line. It is NOT the internal SAN- number (that
--    stays a hidden backend key, CLAUDE.md); this one is meant to be shown,
--    printed and quoted to the buyer.
-- 2. quality_description: the open quality text the trader types (the offer
--    wording). quality_name keeps the short first line for lists and labels.
-- 3. qc_in_house: whether the lab cups / grades the sample here. Usually not
--    for offers; when it is, the intake offers the QR tin label. Defaults to
--    true so every existing sample keeps behaving exactly as before.
--
-- The number is assigned by a BEFORE INSERT trigger from a per-year counter
-- row (row lock on upsert), so two people saving at once never collide.

alter table public.samples
  add column if not exists offer_seq integer,
  add column if not exists offer_year smallint,
  add column if not exists quality_description text,
  add column if not exists qc_in_house boolean not null default true;

alter table public.samples
  add column if not exists offer_number text generated always as (
    case
      when offer_seq is null or offer_year is null then null
      else 'TS-' || lpad(offer_seq::text, 4, '0') || '/' || right(offer_year::text, 2)
    end
  ) stored;

create unique index if not exists samples_offer_number_unique
  on public.samples (offer_year, offer_seq)
  where offer_seq is not null;

create index if not exists samples_offer_number_idx
  on public.samples (offer_number)
  where offer_number is not null;

create table if not exists public.offer_sample_counters (
  year smallint primary key,
  last_seq integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Only the trigger (security definer) touches the counter.
alter table public.offer_sample_counters enable row level security;

create or replace function public.assign_offer_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year smallint;
  v_seq integer;
begin
  if new.offer_seq is not null then
    return new;
  end if;
  if new.sample_type is null or new.sample_type::text not in ('type', 'stocklot') then
    return new;
  end if;
  -- Contract siblings of a lab unit are the same physical sample.
  if new.lab_source_sample_id is not null then
    return new;
  end if;

  v_year := extract(year from timezone('America/Sao_Paulo', coalesce(new.created_at, now())))::smallint;

  insert into public.offer_sample_counters as c (year, last_seq, updated_at)
  values (v_year, 1, now())
  on conflict (year) do update
    set last_seq = c.last_seq + 1,
        updated_at = now()
  returning c.last_seq into v_seq;

  new.offer_seq := v_seq;
  new.offer_year := v_year;
  return new;
end;
$$;

drop trigger if exists trg_assign_offer_number on public.samples;
create trigger trg_assign_offer_number
  before insert or update of sample_type on public.samples
  for each row
  execute function public.assign_offer_number();

-- Backfill: type / stocklot lab units already registered, in the order they
-- came in, per year. Only offer_seq/offer_year are set, so the trigger above
-- (which fires on sample_type) does not run.
with ranked as (
  select
    id,
    extract(year from timezone('America/Sao_Paulo', coalesce(created_at, now())))::smallint as y,
    row_number() over (
      partition by extract(year from timezone('America/Sao_Paulo', coalesce(created_at, now())))
      order by created_at nulls last, id
    ) as rn
  from public.samples
  where sample_type::text in ('type', 'stocklot')
    and lab_source_sample_id is null
    and deleted_at is null
    and offer_seq is null
)
update public.samples s
set offer_seq = r.rn::integer,
    offer_year = r.y
from ranked r
where s.id = r.id;

insert into public.offer_sample_counters (year, last_seq)
select offer_year, max(offer_seq)
from public.samples
where offer_seq is not null
group by offer_year
on conflict (year) do update
  set last_seq = greatest(public.offer_sample_counters.last_seq, excluded.last_seq),
      updated_at = now();
