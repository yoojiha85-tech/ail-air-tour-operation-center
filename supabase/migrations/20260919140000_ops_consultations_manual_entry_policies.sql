-- Allow staff to record offline (phone / walk-in) consultations directly.
-- Previously only the public web form's service-role edge function
-- (submit-ail-consultation) could write to ops_consultations; authenticated
-- staff had no INSERT policy at all.

drop policy if exists ops_consultations_insert on public.ops_consultations;
create policy ops_consultations_insert on public.ops_consultations
for insert to authenticated
with check (private.ops_has_permission(organization_id, 'reservation_create'));

-- Let staff delete a mistaken entry, but only before it has been converted
-- into a reservation (reservation_id is null), to preserve history once a
-- consultation is actually part of a case.
drop policy if exists ops_consultations_delete on public.ops_consultations;
create policy ops_consultations_delete on public.ops_consultations
for delete to authenticated
using (
  private.ops_has_permission(organization_id, 'reservation_edit')
  and reservation_id is null
);
