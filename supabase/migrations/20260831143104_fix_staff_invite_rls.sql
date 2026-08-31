drop policy if exists "staff_invite_manage" on public.ops_staff_invites;

create policy "staff_invite_manage"
  on public.ops_staff_invites
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.ops_members member
      where member.organization_id = ops_staff_invites.organization_id
        and member.user_id = (select auth.uid())
        and member.active is true
        and (
          member.role = 'master'
          or coalesce((member.permissions ->> 'staff_manage')::boolean, false)
        )
    )
  )
  with check (
    invited_by = (select auth.uid())
    and exists (
      select 1
      from public.ops_members member
      where member.organization_id = ops_staff_invites.organization_id
        and member.user_id = (select auth.uid())
        and member.active is true
        and (
          member.role = 'master'
          or coalesce((member.permissions ->> 'staff_manage')::boolean, false)
        )
    )
  );
