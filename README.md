# Bookly Pro V5.4.1 Staff Page Fix

Replace only these files in the repository:

- `staff.html`
- `assets/js/manage.js`

This restores the missing staff schedule modal required by V5.3 and prevents the page from failing with `Cannot read properties of null (reading 'addEventListener')`.

No database migration is required. The V5.3 staff availability migration must already be installed for scheduling features to save correctly.
