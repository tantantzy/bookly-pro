document.addEventListener('DOMContentLoaded', async () => {
  const main = document.querySelector('#dashboardMain');
  try {
    const user = await window.bookly.requireUser('owner');
    if (!user) return;
    const profile = await window.bookly.getProfile(user.id);
    const { data: business, error: businessError } = await window.bookly.db.from('businesses').select('*').eq('id', profile.business_id).single();
    if (businessError) throw businessError;
    document.querySelector('#businessName').textContent = business.name;

    const [appointmentsResult, servicesResult, staffResult, customerResult] = await Promise.all([
      window.bookly.db.from('appointments').select('*', { count: 'exact', head: true }).eq('business_id', business.id),
      window.bookly.db.from('services').select('*', { count: 'exact', head: true }).eq('business_id', business.id),
      window.bookly.db.from('staff').select('*', { count: 'exact', head: true }).eq('business_id', business.id),
      window.bookly.db.from('appointments').select('customer_email').eq('business_id', business.id)
    ]);
    [appointmentsResult, servicesResult, staffResult, customerResult].forEach(result => { if (result.error) throw result.error; });
    const uniqueCustomers = new Set((customerResult.data || []).map(row => row.customer_email.toLowerCase())).size;
    const stats = [
      ['Appointments', appointmentsResult.count || 0],
      ['Services', servicesResult.count || 0],
      ['Staff', staffResult.count || 0],
      ['Customers', uniqueCustomers]
    ];
    document.querySelector('#stats').innerHTML = stats.map(([label, value]) => `<article class="card stat"><span class="muted">${label}</span><strong>${value}</strong></article>`).join('');

    const { data: recent, error: recentError } = await window.bookly.db.from('appointments').select('*,services(name)').eq('business_id', business.id).order('start_time', { ascending: false }).limit(8);
    if (recentError) throw recentError;
    document.querySelector('#recentAppointments').innerHTML = (recent || []).map(row => `<div class="list-row"><div><strong>${window.bookly.escape(row.customer_name)}</strong><div class="muted">${window.bookly.escape(row.services?.name || 'Service')} · ${new Date(row.start_time).toLocaleString()}</div></div><span class="pill">${window.bookly.escape(row.status)}</span></div>`).join('') || '<div class="empty">No appointments yet.</div>';
  } catch (error) {
    console.error(error);
    main.innerHTML = `<div class="alert error">${window.bookly.escape(error.message)}</div>`;
  }
});
