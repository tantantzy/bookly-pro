-- Bookly Pro V4.2 availability upgrade
create or replace function public.get_available_booking_slots(
  p_business_id uuid,
  p_service_id uuid,
  p_date date,
  p_staff_id uuid default null
)
returns table(slot_start timestamptz, staff_id uuid, staff_name text)
language sql
stable
security definer
set search_path = public
as $$
with business_data as (
  select id, coalesce(timezone,'UTC') as tz
  from public.businesses
  where id=p_business_id and is_active=true
), service_data as (
  select id,duration_minutes
  from public.services
  where id=p_service_id and business_id=p_business_id and is_active=true
), hours as (
  select bh.opens_at,bh.closes_at,b.tz
  from public.business_hours bh cross join business_data b
  where bh.business_id=p_business_id
    and bh.day_of_week=extract(dow from p_date)::int
    and bh.is_closed=false
), eligible_staff as (
  select s.id,s.name
  from public.staff s
  join public.staff_services ss on ss.staff_id=s.id and ss.service_id=p_service_id
  where s.business_id=p_business_id and s.is_active=true
    and (p_staff_id is null or s.id=p_staff_id)
), slots as (
  select es.id as staff_id,es.name as staff_name,
         (gs at time zone h.tz) as slot_start,
         sd.duration_minutes
  from eligible_staff es
  cross join service_data sd
  cross join hours h
  cross join lateral generate_series(
    p_date + h.opens_at,
    p_date + h.closes_at - make_interval(mins=>sd.duration_minutes),
    interval '30 minutes'
  ) gs
)
select s.slot_start,s.staff_id,s.staff_name
from slots s
where s.slot_start > now()
  and not exists (
    select 1 from public.appointments a
    where a.staff_id=s.staff_id
      and a.status in ('pending','confirmed')
      and a.start_time < s.slot_start + make_interval(mins=>s.duration_minutes)
      and a.end_time > s.slot_start
  )
order by s.slot_start,s.staff_name;
$$;
grant execute on function public.get_available_booking_slots(uuid,uuid,date,uuid) to anon,authenticated;
select 'Bookly Pro V4.2 availability upgrade installed successfully' as result;
