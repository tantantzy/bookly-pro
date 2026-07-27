document.addEventListener('DOMContentLoaded', async () => {
  const slug = new URLSearchParams(location.search).get('business');
  const form = document.querySelector('#bookingForm');
  const msg = form?.querySelector('[data-message]');
  if (!form) return;

  const serviceSelect = form.elements.service_id;
  const staffSelect = form.elements.staff_id;
  const dateInput = form.elements.appointment_date;
  const timeSelect = form.elements.start_time;
  const nameInput = form.elements.customer_name;
  const emailInput = form.elements.customer_email;
  const phoneInput = form.elements.customer_phone;
  const submit = form.querySelector('button[type="submit"]');

  const businessTimeZone = () => form.business?.timezone || 'Asia/Manila';

  function datePartsInTimeZone(date = new Date(), timeZone = businessTimeZone()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function formatSlot(iso) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: businessTimeZone(),
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date(iso));
  }

  async function prefillCustomer() {
    try {
      const { data: { user }, error: userError } = await window.bookly.db.auth.getUser();
      if (userError || !user) return;

      const { data: profile, error: profileError } = await window.bookly.db
        .from('profiles')
        .select('full_name,phone')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) console.warn('Unable to load customer profile:', profileError.message);

      const fullName = profile?.full_name || user.user_metadata?.full_name || '';
      if (nameInput && fullName) {
        nameInput.value = fullName;
        nameInput.readOnly = true;
        nameInput.setAttribute('aria-readonly', 'true');
      }
      if (emailInput && user.email) {
        emailInput.value = user.email;
        emailInput.readOnly = true;
        emailInput.setAttribute('aria-readonly', 'true');
      }
      if (phoneInput && !phoneInput.value) {
        phoneInput.value = profile?.phone || user.user_metadata?.phone || '';
      }
    } catch (error) {
      console.warn('Unable to prefill customer details:', error);
    }
  }

  function resetTimes(text = 'Choose service, staff, and date first') {
    timeSelect.innerHTML = `<option value="">${text}</option>`;
    timeSelect.disabled = true;
  }

  async function loadSlots() {
    resetTimes('Loading available times...');
    const serviceId = serviceSelect.value;
    const date = dateInput.value;

    if (!serviceId || !date) {
      resetTimes();
      return;
    }

    const staffId = staffSelect.value || null;
    const { data, error } = await window.bookly.db.rpc('get_available_booking_slots', {
      p_business_id: form.business.id,
      p_service_id: serviceId,
      p_date: date,
      p_staff_id: staffId
    });

    if (error) {
      window.bookly.show(msg, error.message);
      resetTimes('Unable to load times');
      return;
    }

    form.availableSlots = data || [];
    const grouped = new Map();
    for (const row of form.availableSlots) {
      const key = row.slot_start;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }

    const options = [...grouped.entries()].map(([start, rows]) => {
      const label = `${formatSlot(start)}${staffId ? '' : ` · ${rows.length} staff available`}`;
      return `<option value="${start}">${label}</option>`;
    });

    timeSelect.innerHTML = options.length
      ? '<option value="">Choose an available time</option>' + options.join('')
      : '<option value="">No available times for this date</option>';
    timeSelect.disabled = !options.length;
  }

  function renderStaff(serviceId) {
    const ids = new Set(
      form.staffServices
        .filter(item => item.service_id === serviceId)
        .map(item => item.staff_id)
    );
    const eligible = form.staff.filter(item => ids.has(item.id));

    staffSelect.innerHTML = eligible.length
      ? '<option value="">Any available staff</option>' + eligible
          .map(item => `<option value="${item.id}">${window.bookly.escape(item.name)}</option>`)
          .join('')
      : '<option value="">No staff assigned to this service</option>';

    staffSelect.disabled = !eligible.length;
    form.eligibleStaff = eligible;
    resetTimes();
  }

  if (!slug) {
    window.bookly.show(msg, 'Choose a business from the home page first.');
    if (submit) submit.disabled = true;
    return;
  }

  try {
    const { data: business, error: businessError } = await window.bookly.db
      .from('businesses')
      .select('*')
      .eq('slug', slug)
      .single();
    if (businessError) throw businessError;

    form.business = business;
    document.querySelector('#bookingBusinessName').textContent = business.name;
    dateInput.min = datePartsInTimeZone(new Date(), business.timezone || 'Asia/Manila');

    const [servicesResult, staffResult, assignmentsResult] = await Promise.all([
      window.bookly.db.from('services').select('*').eq('business_id', business.id).eq('is_active', true).order('name'),
      window.bookly.db.from('staff').select('*').eq('business_id', business.id).eq('is_active', true).order('name'),
      window.bookly.db.from('staff_services').select('staff_id,service_id')
    ]);

    if (servicesResult.error) throw servicesResult.error;
    if (staffResult.error) throw staffResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;

    form.services = servicesResult.data || [];
    form.staff = staffResult.data || [];

    const staffIds = new Set(form.staff.map(item => item.id));
    const serviceIds = new Set(form.services.map(item => item.id));
    form.staffServices = (assignmentsResult.data || []).filter(
      item => staffIds.has(item.staff_id) && serviceIds.has(item.service_id)
    );

    serviceSelect.innerHTML = '<option value="">Choose a service</option>' + form.services
      .map(service => `<option value="${service.id}">${window.bookly.escape(service.name)} — ${window.bookly.money(service.price, business.currency)}</option>`)
      .join('');

    staffSelect.innerHTML = '<option value="">Choose a service first</option>';
    staffSelect.disabled = true;

    serviceSelect.addEventListener('change', () => renderStaff(serviceSelect.value));
    staffSelect.addEventListener('change', loadSlots);
    dateInput.addEventListener('change', loadSlots);
  } catch (error) {
    window.bookly.show(msg, error.message);
  }

  await prefillCustomer();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit) submit.disabled = true;

    try {
      const fields = new FormData(form);
      const service = form.services.find(item => item.id === fields.get('service_id'));
      if (!service) throw new Error('Choose a service.');

      const startIso = fields.get('start_time');
      if (!startIso) throw new Error('Choose an available time.');

      const matching = (form.availableSlots || []).filter(item => item.slot_start === startIso);
      let assignedStaff = fields.get('staff_id') || null;
      if (!assignedStaff) {
        if (!matching.length) throw new Error('That time is no longer available.');
        assignedStaff = matching[0].staff_id;
      }

      const start = new Date(startIso);
      const end = new Date(start.getTime() + service.duration_minutes * 60000);
      const { data: { user } } = await window.bookly.db.auth.getUser();

      const { error } = await window.bookly.db.from('appointments').insert({
        business_id: form.business.id,
        service_id: service.id,
        staff_id: assignedStaff,
        customer_id: user?.id || null,
        customer_name: String(fields.get('customer_name') || '').trim(),
        customer_email: String(fields.get('customer_email') || '').trim(),
        customer_phone: String(fields.get('customer_phone') || '').trim() || null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        total_price: service.price,
        notes: String(fields.get('notes') || '').trim() || null
      });
      if (error) throw error;

      form.reset();
      await prefillCustomer();
      staffSelect.disabled = true;
      resetTimes();
      window.bookly.show(msg, 'Appointment request submitted.', 'success');
    } catch (error) {
      window.bookly.show(msg, error.message);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
});
