-- Bookly Pro V5.4.2
-- Correct existing businesses that still use the original UTC default.
-- The application is operating in the Philippines, so appointment schedules
-- and generated slots must use Asia/Manila local time.

begin;

update public.businesses
set timezone = 'Asia/Manila',
    updated_at = now()
where timezone is null
   or trim(timezone) = ''
   or timezone = 'UTC';

alter table public.businesses
  alter column timezone set default 'Asia/Manila';

commit;

select id, name, timezone
from public.businesses
order by name;
