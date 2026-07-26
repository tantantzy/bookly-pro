(() => {
  'use strict';

  function db() {
    if (!window.bookly?.db) throw new Error('Supabase client is not configured. Update assets/js/supabase-client.js.');
    return window.bookly.db;
  }

  function message(form, text, type = 'error') {
    const el = form.querySelector('[data-message]');
    if (el) window.bookly.show(el, text, type);
    else alert(text);
  }

  function submitButton(form) {
    return form.querySelector('button[type="submit"]') || form.querySelector('button');
  }

  async function withBusy(form, busyText, action) {
    const button = submitButton(form);
    const original = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = busyText;
    }
    try {
      return await action();
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  }

  async function profileFor(userId) {
    let lastError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await db().from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!error && data) return data;
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw lastError || new Error('Your account profile was not created. Run the V4 schema and register again.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const ownerSignup = document.getElementById('ownerSignupForm');
    if (ownerSignup) {
      ownerSignup.addEventListener('submit', event => {
        event.preventDefault();
        withBusy(ownerSignup, 'Creating business…', async () => {
          try {
            const form = new FormData(ownerSignup);
            const { data, error } = await db().auth.signUp({
              email: String(form.get('email') || '').trim(),
              password: String(form.get('password') || ''),
              options: { data: {
                account_type: 'owner',
                full_name: String(form.get('full_name') || '').trim(),
                business_name: String(form.get('business_name') || '').trim(),
                business_type: String(form.get('business_type') || 'Other')
              }}
            });
            if (error) throw error;
            if (data.session && data.user) {
              const profile = await profileFor(data.user.id);
              if (profile.role !== 'owner') throw new Error('The new account was not assigned the owner role.');
              location.assign('dashboard.html');
              return;
            }
            message(ownerSignup, 'Business account created. Confirm the email, then use Owner Login.', 'success');
          } catch (error) {
            console.error('Owner signup failed:', error);
            message(ownerSignup, error.message || 'Owner signup failed.');
          }
        });
      });
    }

    const customerSignup = document.getElementById('customerSignupForm');
    if (customerSignup) {
      customerSignup.addEventListener('submit', event => {
        event.preventDefault();
        withBusy(customerSignup, 'Creating account…', async () => {
          try {
            const form = new FormData(customerSignup);
            const { data, error } = await db().auth.signUp({
              email: String(form.get('email') || '').trim(),
              password: String(form.get('password') || ''),
              options: { data: {
                account_type: 'customer',
                full_name: String(form.get('full_name') || '').trim()
              }}
            });
            if (error) throw error;
            if (data.session && data.user) {
              const profile = await profileFor(data.user.id);
              if (profile.role !== 'customer') throw new Error('The new account was not assigned the customer role.');
              location.assign('customer-portal.html');
              return;
            }
            message(customerSignup, 'Customer account created. Confirm the email, then use Customer Login.', 'success');
          } catch (error) {
            console.error('Customer signup failed:', error);
            message(customerSignup, error.message || 'Customer signup failed.');
          }
        });
      });
    }

    document.querySelectorAll('[data-login-form]').forEach(form => {
      form.addEventListener('submit', event => {
        event.preventDefault();
        withBusy(form, 'Signing in…', async () => {
          try {
            const values = new FormData(form);
            const expectedRole = form.dataset.role;
            const { data, error } = await db().auth.signInWithPassword({
              email: String(values.get('email') || '').trim(),
              password: String(values.get('password') || '')
            });
            if (error) throw error;
            const profile = await profileFor(data.user.id);
            if (profile.role !== expectedRole) {
              await db().auth.signOut();
              throw new Error(`This is a ${profile.role} account. Use the correct login page.`);
            }
            location.assign(expectedRole === 'owner' ? 'dashboard.html' : 'customer-portal.html');
          } catch (error) {
            console.error('Login failed:', error);
            message(form, error.message || 'Login failed.');
          }
        });
      });
    });
  });
})();
