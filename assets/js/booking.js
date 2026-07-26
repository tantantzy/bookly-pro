document.addEventListener('DOMContentLoaded', async () => {
  const slug = new URLSearchParams(location.search).get('business');
  const form = document.querySelector('#bookingForm');
  const msg = form?.querySelector('[data-message]');

  if (!form) return;

  const serviceSelect = form.elements.service_id;
  const staffSelect = form.elements.staff_id;

  function renderStaffForService(serviceId) {
    const previousValue = staffSelect.value;

    if (!serviceId) {
      staffSelect.innerHTML = '<option value="">Choose a service first</option>';
      staffSelect.disabled = true;
      return;
    }

    const assignedStaffIds = new Set(
      form.staffServices
        .filter(link => link.service_id === serviceId)
        .map(link => link.staff_id)
    );

    const eligibleStaff = form.staff.filter(member => assignedStaffIds.has(member.id));

    staffSelect.disabled = false;
    staffSelect.innerHTML =
      '<option value="">Any available staff</option>' +
      eligibleStaff
        .map(member => `<option value="${member.id}">${window.bookly.escape(member.name)}</option>`)
        .join('');

    if (eligibleStaff.some(member => member.id === previousValue)) {
      staffSelect.value = previousValue;
    } else {
      staffSelect.value = '';
    }

    if (!eligibleStaff.length) {
      staffSelect.innerHTML = '<option value="">No staff assigned to this service</option>';
      staffSelect.disabled = true;
    }
  }

  if (!slug) {
    window.bookly.show(msg, 'Choose a business from the home page first.');
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
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

    const [servicesResult, staffResult, assignmentsResult] = await Promise.all([
      window.bookly.db
        .from('services')
        .select('*')
        .eq('business_id', business.id)
        .eq('is_active', true)
        .order('name'),
      window.bookly.db
        .from('staff')
        .select('*')
        .eq('business_id', business.id)
        .eq('is_active', true)
        .order('name'),
      window.bookly.db
        .from('staff_services')
        .select('staff_id,service_id')
    ]);

    if (servicesResult.error) throw servicesResult.error;
    if (staffResult.error) throw staffResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;

    form.services = servicesResult.data || [];
    form.staff = staffResult.data || [];

    const currentStaffIds = new Set(form.staff.map(member => member.id));
    const currentServiceIds = new Set(form.services.map(service => service.id));
    form.staffServices = (assignmentsResult.data || []).filter(
      link => currentStaffIds.has(link.staff_id) && currentServiceIds.has(link.service_id)
    );

    serviceSelect.innerHTML =
      '<option value="">Choose a service</option>' +
      form.services
        .map(service => `<option value="${service.id}">${window.bookly.escape(service.name)} — ${window.bookly.money(service.price, business.currency)}</option>`)
        .join('');

    staffSelect.innerHTML = '<option value="">Choose a service first</option>';
    staffSelect.disabled = true;

    serviceSelect.addEventListener('change', () => {
      renderStaffForService(serviceSelect.value);
    });
  } catch (error) {
    window.bookly.show(msg, error.message);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      const values = new FormData(form);
      const service = form.services.find(item => item.id === values.get('service_id'));
      if (!service) throw new Error('Choose a service.');

      const selectedStaffId = values.get('staff_id') || null;
      if (selectedStaffId) {
        const isAssigned = form.staffServices.some(
          link => link.service_id === service.id && link.staff_id === selectedStaffId
        );
        if (!isAssigned) throw new Error('The selected staff member does not provide this service.');
      }

      const start = new Date(values.get('start_time'));
      const end = new Date(start.getTime() + service.duration_minutes * 60000);
      const { data: { user } } = await window.bookly.db.auth.getUser();

      const { error } = await window.bookly.db.from('appointments').insert({
        business_id: form.business.id,
        service_id: service.id,
        staff_id: selectedStaffId,
        customer_id: user?.id || null,
        customer_name: String(values.get('customer_name') || '').trim(),
        customer_email: String(values.get('customer_email') || '').trim(),
        customer_phone: String(values.get('customer_phone') || '').trim() || null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        total_price: service.price,
        notes: String(values.get('notes') || '').trim() || null
      });

      if (error) throw error;

      form.reset();
      renderStaffForService('');
      window.bookly.show(msg, 'Appointment request submitted.', 'success');
    } catch (error) {
      window.bookly.show(msg, error.message);
    } finally {
      if (button) button.disabled = false;
    }
  });
});
