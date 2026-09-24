-- Migration: create split_history table
-- Stores completed bill splits. Immutable once inserted — no updates or deletes.

create table if not exists public.split_history (
  id           uuid          primary key default gen_random_uuid(),
  created_at   timestamptz   not null    default now(),
  subtotal     numeric(10,2) not null,
  tax          numeric(10,2) not null,
  tip          numeric(10,2) not null,
  total        numeric(10,2) not null,
  participants integer       not null,
  shares       numeric(10,2)[] not null
);

-- Index on created_at to support ORDER BY created_at DESC efficiently
create index if not exists split_history_created_at_idx
  on public.split_history (created_at desc);

comment on table public.split_history is
  'Completed bill splits recorded by the SplitStack engine.';
comment on column public.split_history.shares is
  'Ordered array of per-participant shares in dollars. Length equals participants.';
