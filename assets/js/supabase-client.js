// Enter these two values once from Supabase Project Settings > API.
const SUPABASE_URL = 'https://uuhjpwposofrmuliwrrh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_et94OA94Yc0N_mm6fVvOsg_R0qA4qD7';

if (!window.supabase) throw new Error('Supabase JS failed to load.');
if (SUPABASE_URL.includes('YOUR_PROJECT') || SUPABASE_ANON_KEY.includes('YOUR_')) {
  console.warn('Bookly Pro: update assets/js/supabase-client.js with your Supabase credentials.');
}
window.bookly = window.bookly || {};
window.bookly.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
