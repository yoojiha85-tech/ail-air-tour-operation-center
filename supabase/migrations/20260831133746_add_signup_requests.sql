create table if not exists public.ops_signup_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  full_name text not null check (char_length(trim(full_name)) between 2 and 100),
  email text not null check (char_length(trim(email)) between 3 and 320),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_by uuid
);

create index if not exists ops_signup_requests_org_status_requested_idx
  on public.ops_signup_requests (organization_id, status, requested_at desc);

alter table public.ops_signup_requests enable row level security;

revoke all on public.ops_signup_requests from anon;
revoke all on public.ops_signup_requests from authenticated;
grant insert on public.ops_signup_requests to anon;
grant select, update on public.ops_signup_requests to authenticated;

drop policy if exists "Anonymous users can submit signup requests" on public.ops_signup_requests;
create policy "Anonymous users can submit signup requests"
  on public.ops_signup_requests for insert to anon
  with check (status = 'pending' and approved_at is null and approved_by is null and rejected_at is null and rejected_by is null);

drop policy if exists "Masters can view signup requests" on public.ops_signup_requests;
create policy "Masters can view signup requests"
  on public.ops_signup_requests for select to authenticated
  using (exists (select 1 from public.ops_members member where member.organization_id = ops_signup_requests.organization_id and member.user_id = (select auth.uid()) and member.role = 'master'));

drop policy if exists "Masters can decide signup requests" on public.ops_signup_requests;
create policy "Masters can decide signup requests"
  on public.ops_signup_requests for update to authenticated
  using (exists (select 1 from public.ops_members member where member.organization_id = ops_signup_requests.organization_id and member.user_id = (select auth.uid()) and member.role = 'master'))
  with check (status in ('approved', 'rejected') and exists (select 1 from public.ops_members member where member.organization_id = ops_signup_requests.organization_id and member.user_id = (select auth.uid()) and member.role = 'master'));
