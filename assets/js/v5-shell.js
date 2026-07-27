
(() => {
 const page=document.body.dataset.page;
 document.querySelector(`[data-nav="${page}"]`)?.classList.add('active');
 const sidebar=document.querySelector('#appSidebar'), backdrop=document.querySelector('#sidebarBackdrop');
 const close=()=>{sidebar?.classList.remove('open');backdrop?.classList.remove('show')};
 document.querySelector('#menuToggle')?.addEventListener('click',()=>{sidebar?.classList.toggle('open');backdrop?.classList.toggle('show')});
 backdrop?.addEventListener('click',close);
 document.querySelectorAll('.app-nav a').forEach(a=>a.addEventListener('click',close));
 const d=new Date(); const live=document.querySelector('#liveDate'); if(live) live.textContent=d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
 async function hydrate(){try{const {data:{session}}=await window.bookly.db.auth.getSession();if(!session?.user)return;const p=await window.bookly.getProfile(session.user.id);const name=p.full_name||session.user.email?.split('@')[0]||'Owner';document.querySelector('#userName').textContent=name;document.querySelector('#userAvatar').textContent=name[0].toUpperCase();if(p.business_id){const {data:b}=await window.bookly.db.from('businesses').select('name').eq('id',p.business_id).maybeSingle();if(b?.name)document.querySelector('#headerBusiness').textContent=b.name;}await notifications(p.business_id);}catch(e){console.warn('V5 shell:',e)}}
 async function notifications(businessId){if(!businessId)return;const panel=document.querySelector('#notificationPanel'),list=document.querySelector('#notificationList'),badge=document.querySelector('#notificationBadge');if(!panel)return;let rows=[];try{const {data,error}=await window.bookly.db.from('notifications').select('*').eq('business_id',businessId).order('created_at',{ascending:false}).limit(20);if(!error)rows=data||[];}catch{}
  const unread=rows.filter(r=>!r.is_read).length;badge.textContent=unread;badge.classList.toggle('hidden',!unread);list.innerHTML=rows.length?rows.map(r=>`<div class="notification-item ${r.is_read?'':'unread'}"><strong>${window.bookly.escape(r.title||'Notification')}</strong><div>${window.bookly.escape(r.message||'')}</div><small>${new Date(r.created_at).toLocaleString()}</small></div>`).join(''):'<div class="notification-empty">No notifications yet.</div>';
  document.querySelector('#notificationToggle')?.addEventListener('click',()=>panel.classList.toggle('hidden'));
  document.querySelector('#markAllRead')?.addEventListener('click',async()=>{await window.bookly.db.from('notifications').update({is_read:true}).eq('business_id',businessId).eq('is_read',false);badge.classList.add('hidden');list.querySelectorAll('.unread').forEach(x=>x.classList.remove('unread'))});
 }
 document.querySelector('#copyPublicLink')?.addEventListener('click',async()=>{const input=document.querySelector('#publicLink');if(!input)return;await navigator.clipboard.writeText(input.value);document.querySelector('#copyPublicLink').textContent='Copied';setTimeout(()=>document.querySelector('#copyPublicLink').textContent='Copy',1200)});
 hydrate();
})();

// V5.4: expose the calendar throughout the owner workspace without replacing every HTML page.
document.addEventListener('DOMContentLoaded',()=>{
  const nav=document.querySelector('.app-nav');
  if(!nav||nav.querySelector('[data-nav="calendar"]'))return;
  const appointments=nav.querySelector('[data-nav="appointments"]');
  const link=document.createElement('a');
  link.href='calendar.html';
  link.dataset.nav='calendar';
  link.innerHTML='<span>▦</span>Calendar';
  appointments?.insertAdjacentElement('afterend',link);
  if(document.body.dataset.page==='calendar')link.classList.add('active');
});
