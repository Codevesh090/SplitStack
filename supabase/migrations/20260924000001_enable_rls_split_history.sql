-- Migration: enable RLS on split_history
-- Enables Row Level Security and adds a permissive policy for anonymous access.
-- This allows the app to read and insert without authentication.
-- Tighten these policies when user authentication is added.

alter table public.split_history enable row level security;

-- Allow anyone to insert a new split record
create policy "allow_insert"
  on public.split_history
  for insert
  with check (true);

-- Allow anyone to read split history
create policy "allow_select"
  on public.split_history
  for select
  using (true);
