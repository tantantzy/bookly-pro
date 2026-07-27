# Bookly Pro V5.4.2 — Time Availability Fix

This patch fixes customer time slots appearing eight hours late (for example, 5:00 PM instead of 9:00 AM).

## Install

1. In Supabase SQL Editor, run:
   `supabase/migrations/v5_4_2_booking_timezone_fix.sql`
2. Replace this file in GitHub:
   `assets/js/booking.js`
3. Commit the changes and wait for GitHub Pages to redeploy.
4. Refresh the booking page with Ctrl+F5.

## What changed

- Existing businesses still using the old `UTC` default are changed to `Asia/Manila`.
- New businesses default to `Asia/Manila`.
- Booking times are displayed using the business timezone instead of the browser's implicit timezone.
- The minimum selectable booking date also follows the business timezone.

No HTML or CSS files are required.
