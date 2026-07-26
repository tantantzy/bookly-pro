window.bookly = window.bookly || {};

window.bookly.qs = (selector, root = document) => root.querySelector(selector);
window.bookly.escape = (value = '') => String(value).replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

window.bookly.show = (element, message, type = 'error') => {
  if (!element) return;
  element.textContent = message;
  element.className = `alert ${type}`;
  element.classList.remove('hidden');
};

window.bookly.money = (amount, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD'
    }).format(Number(amount || 0));
  } catch {
    return `$${Number(amount || 0).toFixed(2)}`;
  }
};

window.bookly.getProfile = async userId => {
  const { data, error } = await window.bookly.db
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Account profile not found. Run the V4 schema and register again.');
  return data;
};

window.bookly.requireUser = async (role = null) => {
  const { data: { session }, error: sessionError } = await window.bookly.db.auth.getSession();
  const user = session?.user || null;

  if (sessionError || !user) {
    location.assign(role === 'customer' ? 'customer-login.html' : 'owner-login.html');
    return null;
  }

  if (role) {
    const profile = await window.bookly.getProfile(user.id);
    if (profile.role !== role) {
      throw new Error(`${role[0].toUpperCase() + role.slice(1)} access required.`);
    }
  }

  return user;
};

window.bookly.logout = async () => {
  await window.bookly.db.auth.signOut();
  location.assign('index.html');
};

document.addEventListener('click', event => {
  const button = event.target.closest('[data-logout]');
  if (button) window.bookly.logout();
});

// Update the static header to reflect the current session.
document.addEventListener('DOMContentLoaded', async () => {
  const actions = document.querySelector('.topbar .actions');
  if (!actions || !window.bookly.db) return;

  try {
    const { data: { session } } = await window.bookly.db.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const profile = await window.bookly.getProfile(user.id);
    const destination = profile.role === 'owner' ? 'dashboard.html' : 'customer-portal.html';
    const label = profile.role === 'owner' ? 'Dashboard' : 'My appointments';

    actions.innerHTML = `
      <a class="btn" href="${destination}">${label}</a>
      <button class="btn btn-primary" type="button" data-logout>Log out</button>
    `;
  } catch (error) {
    console.error('Unable to update the session navigation:', error);
  }
});

// V4.2 simplified navigation: remove duplicate Businesses / Book links.
document.addEventListener('DOMContentLoaded',()=>{document.querySelector('.topbar .navlinks')?.remove();});
