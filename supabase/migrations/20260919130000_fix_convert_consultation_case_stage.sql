-- QA fix: convert_consultation_to_reservation() did not set case_stage, so it
-- fell back to the ops_reservations table default of 'reservation' (the
-- "confirmed reservation" stage). That made a freshly converted web
-- consultation, which has no quote/contract/reservation request yet, show up
-- in the CASE Control Center's stage bar as if consultation/quote/contract/
-- request were already done.
-- Fix: explicitly set case_stage to 'quote' (consultation just finished, next
-- step is the quote) and case_status to 'active' on creation.

create or replace function public.convert_consultation_to_reservation(p_consultation_id uuid)
returns table(reservation_id uuid, reservation_code text, product_type text)
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  c public.ops_consultations%rowtype;
  v_product_type text;
  v_reservation_code text;
  v_travelers integer;
  v_reservation_id uuid;
begin
  select * into c
  from public.ops_consultations
  where id = p_consultation_id
  for update;

  if not found then
    raise exception '상담 접수 건을 찾을 수 없습니다.';
  end if;

  if c.reservation_id is not null then
    return query
      select r.id, r.reservation_code, r.product_type
      from public.ops_reservations r
      where r.id = c.reservation_id;
    return;
  end if;

  if not private.ops_has_permission(c.organization_id, 'reservation_create'::text) then
    raise exception '예약 생성 권한이 없습니다.';
  end if;
  if not private.ops_has_permission(c.organization_id, 'reservation_edit'::text) then
    raise exception '상담 전환 권한이 없습니다.';
  end if;

  v_product_type := case
    when c.request_type like '%허니문%' then 'honeymoon'
    when c.request_type like '%단체%' then 'group'
    when c.request_type like '%항공%' then 'air'
    else 'package'
  end;

  v_travelers := greatest(1, coalesce(nullif(regexp_replace(coalesce(c.traveler_count,''), '[^0-9]', '', 'g'), '')::integer, 2));
  v_reservation_code := 'AIL-R-' || regexp_replace(c.request_code, '^AIL-Q-', '');

  if exists(
    select 1
    from public.ops_reservations r0
    where r0.organization_id = c.organization_id
      and r0.reservation_code = v_reservation_code
  ) then
    v_reservation_code := v_reservation_code || '-' || to_char(clock_timestamp(),'HH24MISS');
  end if;

  insert into public.ops_reservations(
    organization_id,reservation_code,product_type,title,destination,customer_name,customer_phone,
    departure_date,traveler_count,status,settlement_status,sale_amount,memo,created_by,reservation_channel,
    case_stage,case_status
  ) values (
    c.organization_id,v_reservation_code,v_product_type,
    concat_ws(' ', nullif(c.destination,''), nullif(c.request_type,'')),
    c.destination,c.customer_name,c.phone,c.departure_date,v_travelers,
    'inquiry','unsettled',0,
    concat_ws(E'\n',
      '웹 상담 접수 전환: ' || c.request_code,
      case when c.budget is not null then '예상예산: ' || c.budget end,
      case when c.wedding_date is not null then '예식일: ' || c.wedding_date::text end,
      case when c.request_memo is not null then '요청사항: ' || c.request_memo end
    ),
    auth.uid(),'web_consultation',
    'quote','active'
  ) returning id into v_reservation_id;

  update public.ops_consultations
  set reservation_id=v_reservation_id,
      status='converted',
      converted_at=now(),
      converted_by=auth.uid(),
      updated_at=now()
  where id=c.id;

  return query
    select r.id, r.reservation_code, r.product_type
    from public.ops_reservations r
    where r.id=v_reservation_id;
end;
$function$;
