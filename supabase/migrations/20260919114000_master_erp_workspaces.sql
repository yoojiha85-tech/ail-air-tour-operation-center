-- MASTER ERP: Quote → Contract → ReservationCase → Finance foundation
-- Additive migration. Existing production tables and data remain intact.

create table if not exists public.ops_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ops_organizations(id) on delete cascade,
  reservation_id uuid not null references public.ops_reservations(id) on delete cascade,
  quote_code text not null,
  title text not null default '견적안',
  status text not null default 'draft',
  currency text not null default 'KRW',
  selected boolean not null default false,
  valid_until date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, quote_code)
);

create table if not exists public.ops_quote_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ops_organizations(id) on delete cascade,
  quote_id uuid not null references public.ops_quotes(id) on delete cascade,
  reservation_id uuid not null references public.ops_reservations(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  total_amount numeric not null default 0 check (total_amount >= 0),
  customer_note text,
  internal_note text,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (quote_id, version_no)
);

create table if not exists public.ops_quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ops_organizations(id) on delete cascade,
  quote_version_id uuid not null references public.ops_quote_versions(id) on delete cascade,
  item_type text not null default 'other',
  item_name text not null,
  description text,
  quantity numeric not null default 1 check (quantity >= 0),
  unit_price numeric not null default 0,
  amount numeric not null default 0,
  sort_order integer not null default 0,
  customer_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ops_organizations(id) on delete cascade,
  reservation_id uuid not null references public.ops_reservations(id) on delete cascade,
  quote_id uuid references public.ops_quotes(id) on delete set null,
  quote_version_id uuid references public.ops_quote_versions(id) on delete set null,
  contract_code text not null,
  version_no integer not null default 1 check (version_no > 0),
  status text not null default 'draft',
  contract_date date,
  total_amount numeric not null default 0 check (total_amount >= 0),
  deposit_amount numeric not null default 0 check (deposit_amount >= 0),
  interim_amount numeric not null default 0 check (interim_amount >= 0),
  balance_amount numeric not null default 0 check (balance_amount >= 0),
  balance_due_date date,
  special_terms text,
  cancellation_terms text,
  snapshot jsonb not null default '{}'::jsonb,
  signed_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, contract_code, version_no)
);

create table if not exists public.ops_reservation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ops_organizations(id) on delete cascade,
  reservation_id uuid not null references public.ops_reservations(id) on delete cascade,
  request_code text not null,
  status text not null default 'draft',
  requested_at timestamptz,
  requested_by uuid,
  note text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, request_code)
);

create table if not exists public.ops_reservation_request_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ops_organizations(id) on delete cascade,
  request_id uuid not null references public.ops_reservation_requests(id) on delete cascade,
  reservation_id uuid not null references public.ops_reservations(id) on delete cascade,
  service_type text not null default 'other',
  supplier_name text,
  request_detail text,
  status text not null default 'requested',
  confirmation_no text,
  deadline timestamptz,
  confirmed_at timestamptz,
  currency text not null default 'KRW',
  foreign_amount numeric not null default 0,
  cost_amount numeric not null default 0,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ops_reservations
  add column if not exists case_stage text not null default 'reservation',
  add column if not exists case_status text not null default 'active',
  add column if not exists selected_quote_id uuid references public.ops_quotes(id) on delete set null,
  add column if not exists active_contract_id uuid references public.ops_contracts(id) on delete set null;

create index if not exists idx_ops_quotes_reservation on public.ops_quotes (organization_id, reservation_id, created_at desc);
create index if not exists idx_ops_quote_versions_quote on public.ops_quote_versions (quote_id, version_no desc);
create index if not exists idx_ops_quote_items_version on public.ops_quote_items (quote_version_id, sort_order);
create index if not exists idx_ops_contracts_reservation on public.ops_contracts (organization_id, reservation_id, created_at desc);
create index if not exists idx_ops_reservation_requests_reservation on public.ops_reservation_requests (organization_id, reservation_id, created_at desc);
create index if not exists idx_ops_reservation_request_items_request on public.ops_reservation_request_items (request_id, sort_order);

drop trigger if exists ops_quotes_set_updated_at on public.ops_quotes;
create trigger ops_quotes_set_updated_at
before update on public.ops_quotes
for each row execute function public.set_updated_at();

drop trigger if exists ops_contracts_set_updated_at on public.ops_contracts;
create trigger ops_contracts_set_updated_at
before update on public.ops_contracts
for each row execute function public.set_updated_at();

drop trigger if exists ops_reservation_requests_set_updated_at on public.ops_reservation_requests;
create trigger ops_reservation_requests_set_updated_at
before update on public.ops_reservation_requests
for each row execute function public.set_updated_at();

drop trigger if exists ops_reservation_request_items_set_updated_at on public.ops_reservation_request_items;
create trigger ops_reservation_request_items_set_updated_at
before update on public.ops_reservation_request_items
for each row execute function public.set_updated_at();

alter table public.ops_quotes enable row level security;
alter table public.ops_quote_versions enable row level security;
alter table public.ops_quote_items enable row level security;
alter table public.ops_contracts enable row level security;
alter table public.ops_reservation_requests enable row level security;
alter table public.ops_reservation_request_items enable row level security;

drop policy if exists ops_quotes_read on public.ops_quotes;
create policy ops_quotes_read on public.ops_quotes for select to authenticated
using (private.ops_has_permission(organization_id, 'reservation_view'));

drop policy if exists ops_quotes_insert on public.ops_quotes;
create policy ops_quotes_insert on public.ops_quotes for insert to authenticated
with check (created_by = auth.uid() and private.ops_has_permission(organization_id, 'reservation_edit'));

drop policy if exists ops_quotes_update on public.ops_quotes;
create policy ops_quotes_update on public.ops_quotes for update to authenticated
using (private.ops_has_permission(organization_id, 'reservation_edit'))
with check (private.ops_has_permission(organization_id, 'reservation_edit'));

drop policy if exists ops_quotes_delete on public.ops_quotes;
create policy ops_quotes_delete on public.ops_quotes for delete to authenticated
using (private.ops_has_permission(organization_id, 'reservation_edit'));

drop policy if exists ops_quote_versions_read on public.ops_quote_versions;
create policy ops_quote_versions_read on public.ops_quote_versions for select to authenticated
using (private.ops_has_permission(organization_id, 'reservation_view'));

drop policy if exists ops_quote_versions_insert on public.ops_quote_versions;
create policy ops_quote_versions_insert on public.ops_quote_versions for insert to authenticated
with check (created_by = auth.uid() and private.ops_has_permission(organization_id, 'reservation_edit'));

drop policy if exists ops_quote_items_read on public.ops_quote_items;
create policy ops_quote_items_read on public.ops_quote_items for select to authenticated
using (private.ops_has_permission(organization_id, 'reservation_view'));

drop policy if exists ops_quote_items_write on public.ops_quote_items;
create policy ops_quote_items_write on public.ops_quote_items for all to authenticated
using (private.ops_has_permission(organization_id, 'reservation_edit'))
with check (private.ops_has_permission(organization_id, 'reservation_edit'));

drop policy if exists ops_contracts_read on public.ops_contracts;
create policy ops_contracts_read on public.ops_contracts for select to authenticated
using (private.ops_has_permission(organization_id, 'reservation_view'));

drop policy if exists ops_contracts_insert on public.ops_contracts;
create policy ops_contracts_insert on public.ops_contracts for insert to authenticated
with check (created_by = auth.uid() and private.ops_has_permission(organization_id, 'reservation_edit'));

drop policy if exists ops_contracts_update on public.ops_contracts;
create policy ops_contracts_update on public.ops_contracts for update to authenticated
using (private.ops_has_permission(organization_id, 'reservation_edit'))
with check (private.ops_has_permission(organization_id, 'reservation_edit'));

drop policy if exists ops_contracts_delete on public.ops_contracts;
create policy ops_contracts_delete on public.ops_contracts for delete to authenticated
using (private.ops_has_permission(organization_id, 'reservation_edit'));

drop policy if exists ops_reservation_requests_read on public.ops_reservation_requests;
create policy ops_reservation_requests_read on public.ops_reservation_requests for select to authenticated
using (private.ops_has_permission(organization_id, 'reservation_view'));

drop policy if exists ops_reservation_requests_insert on public.ops_reservation_requests;
create policy ops_reservation_requests_insert on public.ops_reservation_requests for insert to authenticated
with check (created_by = auth.uid() and private.ops_has_permission(organization_id, 'reservation_edit'));

drop policy if exists ops_reservation_requests_update on public.ops_reservation_requests;
create policy ops_reservation_requests_update on public.ops_reservation_requests for update to authenticated
using (private.ops_has_permission(organization_id, 'reservation_edit'))
with check (private.ops_has_permission(organization_id, 'reservation_edit'));

drop policy if exists ops_reservation_requests_delete on public.ops_reservation_requests;
create policy ops_reservation_requests_delete on public.ops_reservation_requests for delete to authenticated
using (private.ops_has_permission(organization_id, 'reservation_edit'));

drop policy if exists ops_reservation_request_items_read on public.ops_reservation_request_items;
create policy ops_reservation_request_items_read on public.ops_reservation_request_items for select to authenticated
using (private.ops_has_permission(organization_id, 'reservation_view'));

drop policy if exists ops_reservation_request_items_write on public.ops_reservation_request_items;
create policy ops_reservation_request_items_write on public.ops_reservation_request_items for all to authenticated
using (private.ops_has_permission(organization_id, 'reservation_edit'))
with check (private.ops_has_permission(organization_id, 'reservation_edit'));
