// Enter these two values once from Supabase Project Settings > API.
const SUPABASE_URL = 'https://rfpihfaksoatzghxlejw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_BOwjACls7YxVfqQqIv8-4A_2oRraiYW';

if (!window.supabase) throw new Error('Supabase JS failed to load.');
if (SUPABASE_URL.includes('YOUR_PROJECT') || SUPABASE_ANON_KEY.includes('YOUR_')) {
  console.warn('Bookly Pro: update assets/js/supabase-client.js with your Supabase credentials.');
}
window.bookly = window.bookly || {};
window.bookly.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
