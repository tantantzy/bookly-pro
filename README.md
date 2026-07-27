# Bookly Pro V5.3 patch

## Install

1. In Supabase, open **SQL Editor**.
2. Run `supabase/migrations/v5_3_staff_availability.sql` once.
3. Upload the other three files to the same paths in the GitHub repository, replacing the current versions:
   - `staff.html`
   - `assets/js/manage.js`
   - `assets/css/styles.css`
4. Wait for GitHub Pages to redeploy, then hard-refresh the Staff page.

## Included

- Weekly working schedules per staff member
- One recurring break per working day
- Date-range time off
- Booking slots filtered by schedules, breaks, leave, and existing appointments
- Server-side double-booking protection
- Existing staff without a custom schedule continue using business opening hours

No existing records are deleted by the migration.
