-- Migration 20261118000001: seller requests and the buyer's final word
--
-- The seller email of an approved PSS can ask the seller to send a sample to
-- the buyer (a pre-approval: Wolthers approved it, the buyer has the final
-- word) and to report the stuffing date, time and place. Which of the two is
-- asked by default is a setting per buyer (qc_client_settings) that a single
-- quality can override (client_qualities, NULL = inherit from the buyer).
-- final_word_fixed locks the choice so the composer cannot change it; for a
-- pre-approval the destination address stays changeable.
--
-- The ticks of one contract are stored on its own sample row in
-- samples.seller_requests (jsonb: buyer_sample, stuffing, set_by, set_at).
-- It is per contract row and is never synced between siblings.
--
-- DDL only, every statement is idempotent.
--
-- lock_timeout: it alters the hot samples table and adds FKs to
-- company_addresses. Rather than queue behind a long transaction (and block
-- every reader queued behind it), give up after 5s; re-paste when it is quiet.

set lock_timeout = '5s';

alter table public.samples add column if not exists seller_requests jsonb;

alter table public.qc_client_settings
  add column if not exists final_word text not null default 'wolthers' check (final_word in ('wolthers','pre_approval')),
  add column if not exists final_word_fixed boolean not null default false,
  add column if not exists buyer_sample_address_id uuid references public.company_addresses(id) on delete set null,
  add column if not exists stuffing_request text not null default 'off' check (stuffing_request in ('off','prechecked','fixed_on'));

alter table public.client_qualities
  add column if not exists final_word text check (final_word in ('wolthers','pre_approval')),
  add column if not exists final_word_fixed boolean,
  add column if not exists buyer_sample_address_id uuid references public.company_addresses(id) on delete set null,
  add column if not exists stuffing_request text check (stuffing_request in ('off','prechecked','fixed_on'));
