window.bookly = window.bookly || {};
window.bookly.qs = (selector, root = document) => root.querySelector(selector);
window.bookly.escape = (value = '') => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
window.bookly.show = (element, message, type = 'error') => { if (!element) return; element.textContent = message; element.className = `alert ${type}`; element.classList.remove('hidden'); };
window.bookly.money = (amount, currency = 'USD') => { try { return new Intl.NumberFormat('en-US',{style:'currency',currency:currency||'USD'}).format(Number(amount||0)); } catch { return `$${Number(amount||0).toFixed(2)}`; } };
window.bookly.getProfile = async userId => { const {data,error}=await window.bookly.db.from('profiles').select('*').eq('id',userId).maybeSingle(); if(error)throw error; if(!data)throw new Error('Account profile not found. Run the latest V4 schema and register again.'); return data; };
window.bookly.requireUser = async (role = null) => { const {data:{session},error}=await window.bookly.db.auth.getSession(); const user=session?.user||null; if(error||!user){location.assign(role==='customer'?'customer-login.html':'owner-login.html');return null;} if(role){const profile=await window.bookly.getProfile(user.id);if(profile.role!==role)throw new Error(`${role[0].toUpperCase()+role.slice(1)} access required.`);} return user; };
window.bookly.logout = async () => { await window.bookly.db.auth.signOut(); location.assign('index.html'); };
document.addEventListener('click', event => { const button=event.target.closest('[data-logout]'); if(button)window.bookly.logout(); });

window.bookly.refreshNotifications = async () => {
  const badge = document.querySelector('[data-notification-badge]');
  const list = document.querySelector('[data-notification-list]');
  if (!badge || !list) return;
  const { data: { session } } = await window.bookly.db.auth.getSession();
  if (!session?.user) return;
  const { data, error } = await window.bookly.db.from('notifications').select('*').eq('recipient_user_id', session.user.id).order('created_at', {ascending:false}).limit(20);
  if (error) { console.error('Notification load failed:', error); return; }
  const unread=(data||[]).filter(item=>!item.is_read).length;
  badge.textContent=String(unread);
  badge.hidden=unread===0;
  list.innerHTML=(data||[]).map(item=>`<article class="notification-item ${item.is_read?'':'unread'}" data-notification-id="${item.id}"><strong>${window.bookly.escape(item.title)}</strong><div>${window.bookly.escape(item.message)}</div><small>${new Date(item.created_at).toLocaleString()}</small></article>`).join('')||'<div class="notification-empty">No notifications yet.</div>';
};

async function installNotificationUi(user) {
  const actions=document.querySelector('.topbar .actions');
  if(!actions)return;
  const wrap=document.createElement('div');
  wrap.className='notification-wrap';
  wrap.innerHTML=`<button class="btn notification-button" type="button" data-notification-toggle aria-expanded="false">Notifications<span class="notification-badge" data-notification-badge hidden>0</span></button><section class="notification-panel" data-notification-panel hidden><div class="notification-head"><strong>Notifications</strong><button class="btn" type="button" data-mark-all-read>Mark all read</button></div><div class="notification-list" data-notification-list></div></section>`;
  actions.prepend(wrap);

  wrap.addEventListener('click',async event=>{
    const toggle=event.target.closest('[data-notification-toggle]');
    const panel=wrap.querySelector('[data-notification-panel]');
    if(toggle){panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)await window.bookly.refreshNotifications();return;}
    if(event.target.closest('[data-mark-all-read]')){await window.bookly.db.from('notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('recipient_user_id',user.id).eq('is_read',false);await window.bookly.refreshNotifications();return;}
    const item=event.target.closest('[data-notification-id]');
    if(item){await window.bookly.db.from('notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('id',item.dataset.notificationId);item.classList.remove('unread');await window.bookly.refreshNotifications();}
  });
  await window.bookly.refreshNotifications();
  setInterval(window.bookly.refreshNotifications,30000);
}

document.addEventListener('DOMContentLoaded', async () => {
  const actions=document.querySelector('.topbar .actions');
  if(!actions||!window.bookly.db)return;
  try{
    const {data:{session}}=await window.bookly.db.auth.getSession();
    const user=session?.user;
    if(!user)return;
    const profile=await window.bookly.getProfile(user.id);
    const destination=profile.role==='owner'?'dashboard.html':'customer-portal.html';
    const label=profile.role==='owner'?'Dashboard':'My appointments';
    actions.innerHTML=`<a class="btn" href="${destination}">${label}</a><button class="btn btn-primary" type="button" data-logout>Log out</button>`;
    await installNotificationUi(user);
  }catch(error){console.error('Unable to update session navigation:',error);}
});
