(() => {
  const state={view:'week',cursor:new Date(),businessId:null,appointments:[],staff:[],services:[],availability:[],timeOff:[],selected:null};
  const root=document.querySelector('#calendarRoot'),loading=document.querySelector('#calendarLoading'),title=document.querySelector('#calendarTitle');
  const staffFilter=document.querySelector('#calendarStaff'),serviceFilter=document.querySelector('#calendarService'),statusFilter=document.querySelector('#calendarStatus');
  const modal=document.querySelector('#calendarModal'),modalBody=document.querySelector('#calendarModalBody'),modalStatus=document.querySelector('#calendarModalStatus'),modalMessage=document.querySelector('#calendarModalMessage');
  const esc=window.bookly.escape;
  const startOfDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
  const startOfWeek=d=>{const x=startOfDay(d);x.setDate(x.getDate()-x.getDay());return x};
  const endOfMonth=d=>new Date(d.getFullYear(),d.getMonth()+1,0,23,59,59,999);
  const isoDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const sameDay=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
  const time=d=>d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  const dateLabel=d=>d.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'});
  const statusLabel=s=>String(s||'pending').replace('_',' ');

  async function init(){
    try{
      const user=await window.bookly.requireUser('owner');if(!user)return;
      const profile=await window.bookly.getProfile(user.id);state.businessId=profile.business_id;
      const [staffRes,serviceRes,appointmentsRes,availabilityRes,timeOffRes]=await Promise.all([
        window.bookly.db.from('staff').select('id,name,title,is_active').eq('business_id',state.businessId).order('name'),
        window.bookly.db.from('services').select('id,name,duration_minutes').eq('business_id',state.businessId).order('name'),
        window.bookly.db.from('appointments').select('*,services(name,duration_minutes),staff(name,title)').eq('business_id',state.businessId).order('start_time'),
        window.bookly.db.from('staff_availability').select('staff_id,day_of_week,starts_at,ends_at,is_active,staff!inner(business_id)').eq('staff.business_id',state.businessId),
        window.bookly.db.from('staff_time_off').select('id,staff_id,starts_on,ends_on,reason,staff!inner(business_id,name)').eq('staff.business_id',state.businessId)
      ]);
      for(const result of [staffRes,serviceRes,appointmentsRes])if(result.error)throw result.error;
      state.staff=staffRes.data||[];state.services=serviceRes.data||[];state.appointments=appointmentsRes.data||[];
      state.availability=availabilityRes.error?[]:(availabilityRes.data||[]);state.timeOff=timeOffRes.error?[]:(timeOffRes.data||[]);
      staffFilter.innerHTML='<option value="">All staff</option>'+state.staff.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
      serviceFilter.innerHTML='<option value="">All services</option>'+state.services.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
      bind();render();loading.hidden=true;
    }catch(error){loading.textContent=error.message;loading.className='alert error';console.error(error)}
  }
  function bind(){
    document.querySelector('#calendarPrev').addEventListener('click',()=>move(-1));document.querySelector('#calendarNext').addEventListener('click',()=>move(1));document.querySelector('#calendarToday').addEventListener('click',()=>{state.cursor=new Date();render()});
    document.querySelectorAll('[data-calendar-view]').forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.calendarView;document.querySelectorAll('[data-calendar-view]').forEach(x=>x.classList.toggle('active',x===button));render()}));
    [staffFilter,serviceFilter,statusFilter].forEach(el=>el.addEventListener('change',render));
    root.addEventListener('click',e=>{const id=e.target.closest('[data-appointment]')?.dataset.appointment;if(id)openAppointment(id)});
    modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-calendar-close]'))closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
    modalStatus.addEventListener('change',saveStatus);
  }
  function move(direction){if(state.view==='day')state.cursor=addDays(state.cursor,direction);else if(state.view==='week')state.cursor=addDays(state.cursor,7*direction);else state.cursor=new Date(state.cursor.getFullYear(),state.cursor.getMonth()+direction,1);render()}
  function filtered(){return state.appointments.filter(a=>(!staffFilter.value||a.staff_id===staffFilter.value)&&(!serviceFilter.value||a.service_id===serviceFilter.value)&&(!statusFilter.value||a.status===statusFilter.value))}
  function render(){if(!state.businessId)return;if(state.view==='month')renderMonth();else renderTimeline(state.view==='day'?1:7)}
  function rangeTitle(start,days){if(days===1)return start.toLocaleDateString([], {weekday:'long',month:'long',day:'numeric',year:'numeric'});const end=addDays(start,days-1);return `${start.toLocaleDateString([], {month:'short',day:'numeric'})} – ${end.toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'})}`}
  function renderTimeline(days){const start=days===1?startOfDay(state.cursor):startOfWeek(state.cursor);title.textContent=rangeTitle(start,days);const appointments=filtered();
    let html='<div class="calendar-timeline" style="--calendar-days:'+days+'"><div class="calendar-time-head"></div>';
    for(let i=0;i<days;i++){const d=addDays(start,i);html+=`<div class="calendar-day-head ${sameDay(d,new Date())?'today':''}"><span>${d.toLocaleDateString([], {weekday:'short'})}</span><strong>${d.getDate()}</strong></div>`}html+='</div>';
    html+='<div class="calendar-timeline calendar-time-body" style="--calendar-days:'+days+'">';
    for(let hour=7;hour<=21;hour++){html+=`<div class="calendar-hour-label">${new Date(2000,0,1,hour).toLocaleTimeString([], {hour:'numeric'})}</div>`;for(let day=0;day<days;day++){const d=addDays(start,day);html+=`<div class="calendar-hour-cell ${sameDay(d,new Date())?'today':''}" data-date="${isoDate(d)}" data-hour="${hour}"></div>`}}html+='</div>';
    root.innerHTML=html;
    const body=root.querySelector('.calendar-time-body');const rowHeight=64;
    appointments.forEach(a=>{const startDate=new Date(a.start_time),endDate=new Date(a.end_time);const dayIndex=Math.floor((startOfDay(startDate)-start)/(86400000));if(dayIndex<0||dayIndex>=days||startDate.getHours()<7||startDate.getHours()>21)return;const top=((startDate.getHours()-7)+(startDate.getMinutes()/60))*rowHeight;const duration=Math.max(30,(endDate-startDate)/60000);const height=Math.max(34,duration/60*rowHeight-4);const event=document.createElement('button');event.type='button';event.className=`calendar-event status-${a.status||'pending'}`;event.dataset.appointment=a.id;event.style.setProperty('--event-day',dayIndex+2);event.style.top=`${top}px`;event.style.height=`${height}px`;event.innerHTML=`<strong>${time(startDate)} ${esc(a.customer_name||'Customer')}</strong><span>${esc(a.services?.name||'Service')}</span><small>${esc(a.staff?.name||'Unassigned')}</small>`;body.appendChild(event)});
    renderAvailabilityOverlay(body,start,days,rowHeight);
  }
  function renderAvailabilityOverlay(body,start,days,rowHeight){
    const staffId=staffFilter.value;if(!staffId)return;
    for(let i=0;i<days;i++){const d=addDays(start,i),date=isoDate(d);const off=state.timeOff.find(x=>x.staff_id===staffId&&date>=x.starts_on&&date<=x.ends_on);if(off){const block=document.createElement('div');block.className='calendar-unavailable-block';block.style.setProperty('--event-day',i+2);block.style.top='0';block.style.height=`${15*rowHeight}px`;block.innerHTML=`<span>Unavailable${off.reason?`: ${esc(off.reason)}`:''}</span>`;body.appendChild(block);continue}
      const hours=state.availability.filter(x=>x.staff_id===staffId&&x.day_of_week===d.getDay()&&x.is_active!==false);if(!hours.length){const block=document.createElement('div');block.className='calendar-unavailable-block';block.style.setProperty('--event-day',i+2);block.style.top='0';block.style.height=`${15*rowHeight}px`;block.innerHTML='<span>Not working</span>';body.appendChild(block);continue}
      const earliest=Math.min(...hours.map(x=>Number(x.starts_at.slice(0,2))+Number(x.starts_at.slice(3,5))/60));const latest=Math.max(...hours.map(x=>Number(x.ends_at.slice(0,2))+Number(x.ends_at.slice(3,5))/60));
      if(earliest>7){const block=document.createElement('div');block.className='calendar-unavailable-block subtle';block.style.setProperty('--event-day',i+2);block.style.top='0';block.style.height=`${(earliest-7)*rowHeight}px`;body.appendChild(block)}if(latest<22){const block=document.createElement('div');block.className='calendar-unavailable-block subtle';block.style.setProperty('--event-day',i+2);block.style.top=`${(latest-7)*rowHeight}px`;block.style.height=`${(22-latest)*rowHeight}px`;body.appendChild(block)}
    }
  }
  function renderMonth(){const first=new Date(state.cursor.getFullYear(),state.cursor.getMonth(),1),gridStart=startOfWeek(first),gridEnd=endOfMonth(state.cursor);while(gridEnd.getDay()!==6)gridEnd.setDate(gridEnd.getDate()+1);title.textContent=first.toLocaleDateString([], {month:'long',year:'numeric'});const appointments=filtered();let html='<div class="calendar-month"><div class="calendar-month-head">Sun</div><div class="calendar-month-head">Mon</div><div class="calendar-month-head">Tue</div><div class="calendar-month-head">Wed</div><div class="calendar-month-head">Thu</div><div class="calendar-month-head">Fri</div><div class="calendar-month-head">Sat</div>';
    for(let d=new Date(gridStart);d<=gridEnd;d=addDays(d,1)){const dayAppointments=appointments.filter(a=>sameDay(new Date(a.start_time),d));const offCount=staffFilter.value?state.timeOff.filter(x=>x.staff_id===staffFilter.value&&isoDate(d)>=x.starts_on&&isoDate(d)<=x.ends_on).length:0;html+=`<div class="calendar-month-day ${d.getMonth()!==first.getMonth()?'outside':''} ${sameDay(d,new Date())?'today':''}"><strong>${d.getDate()}</strong>${offCount?'<span class="month-unavailable">Unavailable</span>':''}<div class="month-events">${dayAppointments.slice(0,4).map(a=>`<button type="button" class="month-event status-${a.status||'pending'}" data-appointment="${a.id}"><span>${time(new Date(a.start_time))}</span>${esc(a.customer_name||'Customer')}</button>`).join('')}${dayAppointments.length>4?`<small>+${dayAppointments.length-4} more</small>`:''}</div></div>`}html+='</div>';root.innerHTML=html;
  }
  function openAppointment(id){const a=state.appointments.find(x=>x.id===id);if(!a)return;state.selected=a;document.querySelector('#calendarModalTitle').textContent=a.customer_name||'Appointment';modalBody.innerHTML=`<div><strong>Service</strong><span>${esc(a.services?.name||'—')}</span></div><div><strong>Staff</strong><span>${esc(a.staff?.name||'Unassigned')}</span></div><div><strong>Start</strong><span>${new Date(a.start_time).toLocaleString()}</span></div><div><strong>End</strong><span>${new Date(a.end_time).toLocaleString()}</span></div><div><strong>Email</strong><span>${esc(a.customer_email||'—')}</span></div><div><strong>Phone</strong><span>${esc(a.customer_phone||'—')}</span></div><div class="full"><strong>Notes</strong><span>${esc(a.notes||'No notes')}</span></div>`;modalStatus.value=a.status||'pending';modalMessage.textContent='';modal.classList.remove('hidden');document.body.classList.add('modal-open')}
  function closeModal(){modal.classList.add('hidden');document.body.classList.remove('modal-open');state.selected=null}
  async function saveStatus(){if(!state.selected)return;modalStatus.disabled=true;modalMessage.textContent='Saving…';const value=modalStatus.value;const{error}=await window.bookly.db.from('appointments').update({status:value}).eq('id',state.selected.id);modalStatus.disabled=false;if(error){modalMessage.textContent=error.message;return}state.selected.status=value;const row=state.appointments.find(x=>x.id===state.selected.id);if(row)row.status=value;modalMessage.textContent='Status updated.';render()}
  init();
})();
