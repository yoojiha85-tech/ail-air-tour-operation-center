-- Staff access hardening (PREVIEW ONLY until PR approval)
-- Keeps existing MASTER/member rows intact. No employee record is deleted or rewritten.
-- Production application should be done only after preview approval.

-- 1) Prevent duplicate pending signup requests for the same organization/email.
create unique index if not exists ops_signup_requests_one_pending_email
on public.ops_signup_requests (organization_id, lower(email))
where status = 'pending';

-- 2) Staff/member administration becomes MASTER-only at the RLS layer.
drop policy if exists member_manage_staff on public.ops_members;
drop policy if exists member_read on public.ops_members;

create policy member_read_self_or_master
on public.ops_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.ops_is_master(organization_id)
);

-- Existing master policy remains responsible for updates to other members:
-- master_manage_other_members

drop policy if exists staff_invite_manage on public.ops_staff_invites;

create policy staff_invite_master_manage
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
      and member.role = 'master'
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
      and member.role = 'master'
  )
);

-- 3) Approved invite is valid for seven days.
-- Legacy staff applications remain only as a safety net; the official UI flow is
-- signup request -> MASTER approval -> approved account creation.
create or replace function private.ops_create_staff_application()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  target_org uuid;
  applicant_name text;
  matched_invite public.ops_staff_invites%rowtype;
begin
  if new.email is null then return new; end if;

  select o.id into target_org
  from public.ops_organizations o
  where o.name = '아일항공여행사'
  order by o.created_at
  limit 1;

  if target_org is null then return new; end if;

  if exists (
    select 1 from public.ops_members m
    where m.organization_id = target_org and m.user_id = new.id
  ) then return new; end if;

  select * into matched_invite
  from public.ops_staff_invites i
  where i.organization_id = target_org
    and lower(i.email) = lower(new.email)
    and i.active = true
    and i.created_at >= now() - interval '7 days'
  order by i.created_at desc
  limit 1;

  if found then
    insert into public.ops_members(
      organization_id,user_id,role,display_name,active,email,permissions
    ) values (
      target_org,new.id,matched_invite.role,matched_invite.display_name,true,
      lower(new.email),
      coalesce(matched_invite.permissions,'{}'::jsonb) - 'staff_manage'
    )
    on conflict(organization_id,user_id) do update
    set role=excluded.role,
        display_name=excluded.display_name,
        active=true,
        email=excluded.email,
        permissions=excluded.permissions;

    update public.ops_staff_invites
    set active = false
    where id = matched_invite.id;

    return new;
  end if;

  -- Legacy fallback only. This path is not exposed as the official signup flow.
  applicant_name := trim(coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into public.ops_staff_applications(
    organization_id,user_id,email,display_name,phone,department,position,application_reason,status
  ) values (
    target_org,new.id,lower(new.email),applicant_name,
    nullif(trim(new.raw_user_meta_data->>'phone'),''),
    nullif(trim(new.raw_user_meta_data->>'department'),''),
    nullif(trim(new.raw_user_meta_data->>'position'),''),
    nullif(trim(new.raw_user_meta_data->>'application_reason'),''),
    'pending'
  )
  on conflict (organization_id,user_id) do nothing;

  return new;
end
$function$;
