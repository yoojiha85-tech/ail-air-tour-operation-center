-- MASTER ERP: legacy contract history + source reconciliation
-- Additive only; current operational reservation values are not overwritten.

alter table public.ops_contracts
  add column if not exists is_active boolean not null default false,
  add column if not exists source_type text not null default 'workspace',
  add column if not exists source_file_name text,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_reason text;

create unique index if not exists uq_ops_contracts_one_active
  on public.ops_contracts (reservation_id)
  where is_active;

create unique index if not exists uq_ops_quotes_one_selected
  on public.ops_quotes (reservation_id)
  where selected;

create table if not exists public.ops_source_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ops_organizations(id) on delete cascade,
  reservation_id uuid not null references public.ops_reservations(id) on delete cascade,
  source_type text not null,
  source_name text not null,
  field_key text not null,
  field_label text not null,
  source_value text,
  current_value text,
  severity text not null default 'medium',
  resolution_status text not null default 'open',
  resolution_note text,
  created_by uuid not null,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_id, source_type, source_name, field_key)
);

create index if not exists idx_ops_source_reconciliations_reservation
  on public.ops_source_reconciliations (organization_id, reservation_id, resolution_status, severity);

drop trigger if exists ops_source_reconciliations_set_updated_at on public.ops_source_reconciliations;
create trigger ops_source_reconciliations_set_updated_at
before update on public.ops_source_reconciliations
for each row execute function public.set_updated_at();

alter table public.ops_source_reconciliations enable row level security;

drop policy if exists ops_source_reconciliations_read on public.ops_source_reconciliations;
create policy ops_source_reconciliations_read on public.ops_source_reconciliations
for select to authenticated
using (private.ops_has_permission(organization_id, 'reservation_view'));

drop policy if exists ops_source_reconciliations_insert on public.ops_source_reconciliations;
create policy ops_source_reconciliations_insert on public.ops_source_reconciliations
for insert to authenticated
with check (
  created_by = auth.uid()
  and private.ops_has_permission(organization_id, 'reservation_edit')
);

drop policy if exists ops_source_reconciliations_update on public.ops_source_reconciliations;
create policy ops_source_reconciliations_update on public.ops_source_reconciliations
for update to authenticated
using (private.ops_has_permission(organization_id, 'reservation_edit'))
with check (private.ops_has_permission(organization_id, 'reservation_edit'));

drop policy if exists ops_source_reconciliations_delete on public.ops_source_reconciliations;
create policy ops_source_reconciliations_delete on public.ops_source_reconciliations
for delete to authenticated
using (private.ops_has_permission(organization_id, 'reservation_edit'));
