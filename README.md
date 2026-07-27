# Bookly Pro V5.5 — Unified Login Patch

## Replace / add these files

- `index.html` — changes the top-right **Register Business** button to **Login**.
- `login.html` — new unified Customer / Business Owner login page.
- `assets/js/auth.js` — supports role selection and sends each role to the correct portal.
- `assets/js/common.js` — protected pages now redirect to the unified login page.
- `assets/css/styles.css` — styling for the account-type selector.

## Installation

Copy the files into the matching locations in your GitHub repository and commit the changes.
No Supabase migration is required.

## Included next update

The login flow is now role-aware. Logged-out customers are redirected to `login.html?role=customer`; logged-out owners are redirected to `login.html?role=owner`. Existing separate login pages can remain in the repository for compatibility.
