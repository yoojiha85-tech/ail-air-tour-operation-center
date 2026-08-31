-- A master can demote another master to a non-master role, but never change self.
-- Non-master staff managers remain limited to non-master accounts.
drop policy if exists "member_manage" on public.ops_members;

create policy "member_manage_staff"
on public.ops_members
for all
to authenticated
using (
  not private.ops_is_master(organization_id)
  and private.ops_has_permission(organization_id, 'staff_manage')
  and role <> 'master'
  and user_id <> (select auth.uid())
)
with check (
  not private.ops_is_master(organization_id)
  and private.ops_has_permission(organization_id, 'staff_manage')
  and role <> 'master'
  and user_id <> (select auth.uid())
);

create policy "master_manage_other_members"
on public.ops_members
for update
to authenticated
using (
  private.ops_is_master(organization_id)
  and user_id <> (select auth.uid())
)
with check (
  private.ops_is_master(organization_id)
  and user_id <> (select auth.uid())
);

create or replace function private.protect_ops_member_identity_and_master()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Member identity cannot be changed.' using errcode = 'check_violation';
  end if;

  if old.role = 'master'
     and old.active is true
     and (new.role <> 'master' or new.active is not true)
     and not exists (
       select 1
       from public.ops_members as remaining_member
       where remaining_member.organization_id = old.organization_id
         and remaining_member.user_id <> old.user_id
         and remaining_member.role = 'master'
         and remaining_member.active is true
     ) then
    raise exception 'At least one active master account must remain.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_ops_member_identity_and_master() from public;

drop trigger if exists protect_ops_member_identity_and_master on public.ops_members;

create trigger protect_ops_member_identity_and_master
before update on public.ops_members
for each row
execute function private.protect_ops_member_identity_and_master();
