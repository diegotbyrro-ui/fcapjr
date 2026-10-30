(() => {
  'use strict';
  const form = document.getElementById('diagnostic-form');
  const days = document.getElementById('calendar-days');
  const times = document.getElementById('booking-times');
  const picker=document.getElementById('booking-picker');
  const details=document.getElementById('booking-details');
  const next=document.getElementById('booking-continue');
  const dateField = document.getElementById('booking-date');
  const timeField = document.getElementById('booking-time');
  const summary = document.getElementById('booking-selection');
  const error = document.getElementById('booking-error');
  const todayParts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Recife',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part = type => todayParts.find(p=>p.type===type).value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const dayFormatter = new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const weekdayFormatter=new Intl.DateTimeFormat('pt-BR',{weekday:'short',timeZone:'UTC'});
  const shortMonth=new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'});
  function currentTime() {
    const p = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Recife',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
    return `${p.find(x=>x.type==='hour').value}:${p.find(x=>x.type==='minute').value}`;
  }
  function renderDays(){
    days.replaceChildren();
    const date=new Date(today+'T12:00:00Z');
    for(let count=0;count<10;){
      date.setUTCDate(date.getUTCDate()+1);
      if(date.getUTCDay()===0 || date.getUTCDay()===6)continue;
      count++;
      const key=date.toISOString().slice(0,10);
      const button=document.createElement('button');button.type='button';button.className='calendar-day';button.dataset.date=key;
      button.setAttribute('aria-label',dayFormatter.format(date));button.setAttribute('aria-pressed',String(dateField.value===key));
      for(const [tag,text] of [['span',weekdayFormatter.format(date).replace('.','')],['strong',String(date.getUTCDate())],['small',shortMonth.format(date).replace('.','')]]){
        const el=document.createElement(tag);el.textContent=text;button.append(el);
      }
      button.addEventListener('click',()=>{dateField.value=key;timeField.value='';error.hidden=true;renderDays();renderTimes();updateSummary();});days.append(button);
    }
  }
  function renderTimes(){
    times.replaceChildren();
    for(const value of ['09:00','10:30','14:00','15:30','17:00']){
      const button=document.createElement('button');button.type='button';button.textContent=value;button.className='booking-slot';
      button.disabled=!dateField.value;button.setAttribute('aria-pressed',String(timeField.value===value));
      button.addEventListener('click',()=>{timeField.value=value;error.hidden=true;renderTimes();updateSummary();});times.append(button);
    }
  }
  function updateSummary(){
    next.disabled=!dateField.value || !timeField.value;
    summary.textContent=!dateField.value?'Nenhuma data selecionada.':dayFormatter.format(new Date(dateField.value+'T12:00:00Z'))+(timeField.value?' · '+timeField.value:' · Escolha o horário desejado.');
  }
  function showDetails(show){
    picker.hidden=show;details.hidden=!show;details.disabled=!show;
    if(show){document.getElementById('booking-details-summary').textContent=summary.textContent;details.querySelector('input').focus({preventScroll:true});}
    else next.focus({preventScroll:true});
  }
  next.addEventListener('click',()=>{if(dateField.value && timeField.value)showDetails(true);});
  document.getElementById('booking-back').addEventListener('click',()=>showDetails(false));
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(!dateField.value || !timeField.value){error.hidden=false;error.textContent='Selecione uma data e um horário desejado para continuar.';showDetails(false);return;}
    if(dateField.value<today || (dateField.value===today && timeField.value<=currentTime())){error.hidden=false;error.textContent='Esse horário já passou. Escolha outro horário desejado.';renderTimes();return;}
    const data=Object.fromEntries(new FormData(form));
    const labels={data:'Data desejada',horario:'Horário desejado (Recife)',nome:'Nome',email:'E-mail',celular:'Celular',empresa:'Empresa',setor:'Setor',cargo:'Cargo',necessidade:'Qual a sua necessidade?'};
    const message='Solicitação de agendamento — FCAP JR.\n\n'+Object.entries(data).map(([key,value])=>`${labels[key]||key}: ${key==='data'?value.split('-').reverse().join('/'):value}`).join('\n')+'\n\nAguardando confirmação da equipe.';
    // Future CRM integration can handle this event; this page does not reserve or persist a meeting.
    const bookingEvent=new CustomEvent('fcap:booking-request',{detail:{...data,timeZone:'America/Recife',status:'requested'},cancelable:true});
    if(form.dispatchEvent(bookingEvent))window.open('https://wa.me/5581981067088?text='+encodeURIComponent(message),'_blank','noopener,noreferrer');
  });
  renderDays();renderTimes();updateSummary();
})();
