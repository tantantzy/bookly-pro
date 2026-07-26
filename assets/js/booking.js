document.addEventListener('DOMContentLoaded',async()=>{
 const slug=new URLSearchParams(location.search).get('business'); const form=document.querySelector('#bookingForm'); const msg=form.querySelector('[data-message]');
 if(!slug){window.bookly.show(msg,'Choose a business from the home page first.');form.querySelector('button').disabled=true;return;}
 try{
  const {data:b,error}=await window.bookly.db.from('businesses').select('*').eq('slug',slug).single(); if(error)throw error; form.business=b;
  document.querySelector('#bookingBusinessName').textContent=b.name;
  const [{data:services},{data:staff}]=await Promise.all([window.bookly.db.from('services').select('*').eq('business_id',b.id).eq('is_active',true),window.bookly.db.from('staff').select('*').eq('business_id',b.id).eq('is_active',true)]);
  form.services=services||[]; const service=form.elements.service_id, staffSel=form.elements.staff_id;
  service.innerHTML='<option value="">Choose a service</option>'+form.services.map(s=>`<option value="${s.id}">${window.bookly.escape(s.name)} — ${window.bookly.money(s.price,b.currency)}</option>`).join('');
  staffSel.innerHTML='<option value="">Any available staff</option>'+(staff||[]).map(s=>`<option value="${s.id}">${window.bookly.escape(s.name)}</option>`).join('');
 }catch(e){window.bookly.show(msg,e.message);}
 form.addEventListener('submit',async e=>{e.preventDefault();const btn=form.querySelector('button');btn.disabled=true;try{const f=new FormData(form);const svc=form.services.find(x=>x.id===f.get('service_id'));if(!svc)throw new Error('Choose a service.');const start=new Date(f.get('start_time'));const end=new Date(start.getTime()+svc.duration_minutes*60000);const {data:{user}}=await window.bookly.db.auth.getUser();const {error}=await window.bookly.db.from('appointments').insert({business_id:form.business.id,service_id:svc.id,staff_id:f.get('staff_id')||null,customer_id:user?.id||null,customer_name:f.get('customer_name').trim(),customer_email:f.get('customer_email').trim(),customer_phone:f.get('customer_phone').trim()||null,start_time:start.toISOString(),end_time:end.toISOString(),total_price:svc.price,notes:f.get('notes').trim()||null});if(error)throw error;form.reset();window.bookly.show(msg,'Appointment request submitted.','success');}catch(err){window.bookly.show(msg,err.message);}finally{btn.disabled=false;}});
});
