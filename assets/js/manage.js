async function ownerContext() {
  const user = await window.bookly.requireUser('owner');
  if (!user) return null;
  return window.bookly.getProfile(user.id);
}

document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body.dataset.page;
  if (!['services', 'staff', 'settings', 'appointments', 'customer'].includes(page)) return;

  try {
    if (page === 'customer') {
      await loadCustomerPortal();
      return;
    }

    const profile = await ownerContext();
    if (!profile) return;

    if (page === 'services') await initCrud('services', profile.business_id, ['name', 'description', 'duration_minutes', 'price']);
    if (page === 'staff') await initStaff(profile.business_id);
    if (page === 'appointments') await loadAppointments(profile.business_id);
    if (page === 'settings') await initSettings(profile.business_id);
  } catch (error) {
    const main = document.querySelector('main');
    if (main) main.innerHTML = `<div class="container"><div class="alert error">${window.bookly.escape(error.message)}</div></div>`;
    console.error('Bookly page initialization failed:', error);
  }
});

async function initCrud(table, businessId, fields) {
  const form = document.querySelector('#manageForm');
  const list = document.querySelector('#manageList');
  const msg = form.querySelector('[data-message]');

  async function load() {
    const { data, error } = await window.bookly.db.from(table).select('*').eq('business_id', businessId).order('created_at', { ascending: false });
    if (error) throw error;
    list.innerHTML = (data || []).map(row => `
      <div class="list-row"><div><strong>${window.bookly.escape(row.name)}</strong><div class="muted">${window.bookly.escape(row.description || row.title || row.email || '')}</div></div><button class="btn btn-danger" type="button" data-delete="${row.id}">Delete</button></div>
    `).join('') || '<div class="empty">Nothing added yet.</div>';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(form);
    const row = { business_id: businessId };
    fields.forEach(key => {
      let value = values.get(key);
      if (value === '') value = null;
      if (['duration_minutes', 'price'].includes(key) && value !== null) value = Number(value);
      row[key] = value;
    });
    const { error } = await window.bookly.db.from(table).insert(row);
    if (error) return window.bookly.show(msg, error.message);
    form.reset();
    window.bookly.show(msg, 'Saved.', 'success');
    await load();
  });

  list.addEventListener('click', async event => {
    const id = event.target.dataset.delete;
    if (!id) return;
    const { error } = await window.bookly.db.from(table).delete().eq('id', id);
    if (error) return window.bookly.show(msg, error.message);
    await load();
  });

  await load();
}

async function initStaff(businessId) {
  const form = document.querySelector('#manageForm');
  const list = document.querySelector('#manageList');
  const msg = form.querySelector('[data-message]');
  const options = document.querySelector('#staffServiceOptions');

  const { data: services, error: servicesError } = await window.bookly.db
    .from('services').select('id,name').eq('business_id', businessId).eq('is_active', true).order('name');
  if (servicesError) throw servicesError;

  options.innerHTML = (services || []).map(service => `
    <label class="service-check"><input type="checkbox" name="service_ids" value="${service.id}"><span>${window.bookly.escape(service.name)}</span></label>
  `).join('') || '<span class="muted">Add services first, then assign them to staff.</span>';

  async function load() {
    const { data, error } = await window.bookly.db
      .from('staff')
      .select('id,name,title,email,phone,created_at,staff_services(service_id,services(name))')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    list.innerHTML = (data || []).map(row => {
      const assigned = (row.staff_services || []).map(link => link.services?.name).filter(Boolean);
      return `<div class="list-row"><div><strong>${window.bookly.escape(row.name)}</strong><div class="muted">${window.bookly.escape(row.title || row.email || '')}</div><div class="service-tags">${assigned.length ? assigned.map(name => `<span class="service-tag">${window.bookly.escape(name)}</span>`).join('') : '<span class="muted">No services assigned</span>'}</div></div><button class="btn btn-danger" type="button" data-delete="${row.id}">Delete</button></div>`;
    }).join('') || '<div class="empty">No staff added yet.</div>';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(form);
    const selectedServices = values.getAll('service_ids');
    if (!selectedServices.length) return window.bookly.show(msg, 'Select at least one service for this staff member.');

    const row = {
      business_id: businessId,
      name: String(values.get('name') || '').trim(),
      title: String(values.get('title') || '').trim() || null,
      email: String(values.get('email') || '').trim() || null,
      phone: String(values.get('phone') || '').trim() || null
    };

    const { data: staffRow, error: staffError } = await window.bookly.db.from('staff').insert(row).select('id').single();
    if (staffError) return window.bookly.show(msg, staffError.message);

    const links = selectedServices.map(serviceId => ({ staff_id: staffRow.id, service_id: serviceId }));
    const { error: linkError } = await window.bookly.db.from('staff_services').insert(links);
    if (linkError) {
      await window.bookly.db.from('staff').delete().eq('id', staffRow.id);
      return window.bookly.show(msg, linkError.message);
    }

    form.reset();
    window.bookly.show(msg, 'Staff member and services saved.', 'success');
    await load();
  });

  list.addEventListener('click', async event => {
    const id = event.target.dataset.delete;
    if (!id) return;
    const { error } = await window.bookly.db.from('staff').delete().eq('id', id);
    if (error) return window.bookly.show(msg, error.message);
    await load();
  });

  await load();
}

async function loadAppointments(businessId) {
  const list = document.querySelector('#appointmentsList');
  const { data, error } = await window.bookly.db
    .from('appointments')
    .select('*,services(name,duration_minutes),staff(name,title)')
    .eq('business_id', businessId)
    .order('start_time', { ascending: false });
  if (error) throw error;

  const statuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
  const formatDate = value => value ? new Date(value).toLocaleString() : '—';
  const formatMoney = value => Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'
  });

  list.innerHTML = (data || []).map((row, index) => {
    const detailsId = `appointment-details-${index}`;
    return `
      <article class="appointment-card">
        <div class="appointment-summary">
          <div class="appointment-main">
            <strong>${window.bookly.escape(row.customer_name || 'Customer')}</strong>
            <div class="muted">${window.bookly.escape(row.services?.name || 'Service')} · ${formatDate(row.start_time)}</div>
            <div class="appointment-staff-line">Staff: <b>${window.bookly.escape(row.staff?.name || 'Any available staff')}</b></div>
          </div>

          <div class="appointment-actions">
            <button class="btn appointment-details-toggle" type="button"
              data-details-toggle="${detailsId}" aria-expanded="false">
              View details
            </button>
            <select class="field appointment-status" data-status="${row.id}" aria-label="Appointment status">
              ${statuses.map(status => `<option value="${status}" ${status === row.status ? 'selected' : ''}>${status.replace('_', ' ')}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="appointment-details" id="${detailsId}" hidden>
          <div class="appointment-detail-grid">
            <div><span>Customer</span><strong>${window.bookly.escape(row.customer_name || '—')}</strong></div>
            <div><span>Email</span><strong>${window.bookly.escape(row.customer_email || '—')}</strong></div>
            <div><span>Phone</span><strong>${window.bookly.escape(row.customer_phone || '—')}</strong></div>
            <div><span>Service</span><strong>${window.bookly.escape(row.services?.name || '—')}</strong></div>
            <div><span>Assigned staff</span><strong>${window.bookly.escape(row.staff?.name || 'Any available staff')}</strong></div>
            <div><span>Staff title</span><strong>${window.bookly.escape(row.staff?.title || '—')}</strong></div>
            <div><span>Appointment time</span><strong>${formatDate(row.start_time)}</strong></div>
            <div><span>End time</span><strong>${formatDate(row.end_time)}</strong></div>
            <div><span>Duration</span><strong>${row.services?.duration_minutes ? `${row.services.duration_minutes} minutes` : '—'}</strong></div>
            <div><span>Total price</span><strong>${formatMoney(row.total_price)}</strong></div>
            <div><span>Booked on</span><strong>${formatDate(row.created_at)}</strong></div>
            <div><span>Status</span><strong class="status-text">${window.bookly.escape((row.status || '').replace('_', ' '))}</strong></div>
          </div>
          <div class="appointment-notes">
            <span>Customer notes</span>
            <p>${window.bookly.escape(row.notes || 'No notes provided.')}</p>
          </div>
        </div>
      </article>`;
  }).join('') || '<div class="empty">No appointments.</div>';

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-details-toggle]');
    if (!button) return;
    const details = document.getElementById(button.dataset.detailsToggle);
    if (!details) return;
    const willOpen = details.hidden;
    details.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
    button.textContent = willOpen ? 'Hide details' : 'View details';
  });

  list.addEventListener('change', async event => {
    const appointmentId = event.target.dataset.status;
    if (!appointmentId) return;

    event.target.disabled = true;
    const newStatus = event.target.value;
    const { error: updateError } = await window.bookly.db
      .from('appointments')
      .update({ status: newStatus })
      .eq('id', appointmentId);
    event.target.disabled = false;

    if (updateError) {
      console.error(updateError);
      alert(updateError.message);
      return;
    }

    const card = event.target.closest('.appointment-card');
    const statusText = card?.querySelector('.status-text');
    if (statusText) statusText.textContent = newStatus.replace('_', ' ');
    await window.bookly.refreshNotifications?.();
  });
}

async function initSettings(businessId) {
  const form = document.querySelector('#settingsForm');
  const msg = form.querySelector('[data-message]');
  const { data: business, error } = await window.bookly.db.from('businesses').select('*').eq('id', businessId).single();
  if (error) throw error;
  Object.keys(business).forEach(key => { if (form.elements[key]) form.elements[key].value = business[key] ?? ''; });
  const publicLink = document.querySelector('#publicLink');
  if (publicLink) publicLink.value = `${location.origin}${location.pathname.replace('settings.html', 'business.html')}?business=${business.slug}`;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(form); const row = {};
    ['name','business_type','description','email','phone','address','city','country','logo_url','timezone','currency'].forEach(key => row[key] = values.get(key) || null);
    const { error: updateError } = await window.bookly.db.from('businesses').update(row).eq('id', businessId);
    window.bookly.show(msg, updateError ? updateError.message : 'Settings saved.', updateError ? 'error' : 'success');
  });
}

async function loadCustomerPortal() {
  const user = await window.bookly.requireUser('customer');
  if (!user) return;
  const { data, error } = await window.bookly.db.from('appointments').select('*,businesses(name),services(name)').eq('customer_id', user.id).order('start_time', { ascending: false });
  if (error) throw error;
  const list = document.querySelector('#customerAppointments');
  list.innerHTML = (data || []).map(row => `<div class="list-row"><div><strong>${window.bookly.escape(row.businesses?.name || 'Business')}</strong><div class="muted">${window.bookly.escape(row.services?.name || '')} · ${new Date(row.start_time).toLocaleString()}</div></div><span class="pill">${window.bookly.escape(row.status)}</span></div>`).join('') || '<div class="empty">No bookings yet.</div>';
}
