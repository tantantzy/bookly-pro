# Bookly Pro V4 Setup

1. Create a new Supabase project.
2. Open SQL Editor and run all of `supabase/schema.sql`. **It is a clean install and deletes old Bookly tables.**
3. Open `assets/js/supabase-client.js` and replace the two placeholders with the Project URL and anon/public key from Supabase Project Settings → API.
4. In Authentication → Sign In / Providers, choose whether email confirmation is enabled and save.
5. Upload all project files to the root of your GitHub Pages repository.
6. Hard-refresh the site.
7. Register a new owner and a new customer.

Do not add a business ID to configuration. V4 resolves it automatically from the logged-in owner profile.
