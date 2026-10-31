(() => {
  'use strict';
  const c = window.FCAP_CONFIG || {};
  const configured = /^https:\/\/[a-z0-9.-]+\/?$/i.test(c.supabaseUrl || '') && !!c.supabaseAnonKey;
  const f = document.getElementById('diagnostic-form');
  if (!f) return;
  const details = document.getElementById('booking-details');
  const status = document.createElement('p');
  status.id = 'fcap-crm-feedback'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  status.style.cssText='margin:14px 0;font-weight:600;line-height:1.5';
  const consent = document.createElement('label');
  consent.style.cssText='display:flex;align-items:flex-start;gap:9px;margin:18px 0;font-size:13px;line-height:1.6';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox'; checkbox.required = true; checkbox.name = 'consentimento'; checkbox.value = 'sim';
  checkbox.style.cssText='width:auto;margin-top:4px';
  consent.append(checkbox, document.createTextNode('Autorizo o contato da FCAP Jr. para responder à minha solicitação. Os dados serão utilizados somente para responder à solicitação e entrar em contato pelos canais informados.'));
  const submit = details.querySelector('button[type=submit]');
  if (submit) { submit.before(consent); submit.after(status); }
  const honeypot = document.createElement('input');
  honeypot.type='text'; honeypot.name='website'; honeypot.tabIndex=-1; honeypot.autocomplete='off';
  honeypot.setAttribute('aria-hidden','true'); honeypot.style.cssText='position:absolute;left:-9999px;opacity:0';
  f.append(honeypot);
  if (configured && c.turnstileSiteKey && submit) {
    const widget = document.createElement('div'); widget.className='cf-turnstile';
    widget.dataset.sitekey=c.turnstileSiteKey; widget.style.margin='12px 0'; submit.before(widget);
    const script=document.createElement('script'); script.src='https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async=true; script.defer=true; document.head.append(script);
  }
  f.addEventListener('fcap:booking-request', (event) => {
    if (!configured) return; // mantém o WhatsApp original enquanto a API não é configurada.
    event.preventDefault();
    if (!checkbox.checked) { status.textContent='Marque a autorização de contato.'; return; }
    const data = {...event.detail};
    data.consentimento = checkbox.checked;
    data.website = honeypot.value;
    data.turnstileToken = f.querySelector('[name="cf-turnstile-response"]')?.value || '';
    status.textContent = 'Enviando sua solicitação...';
    if (submit) submit.disabled = true;
    fetch(c.supabaseUrl.replace(/\/$/,'')+'/functions/v1/fcap-public-lead', {
      method:'POST', headers:{'Content-Type':'application/json','apikey':c.supabaseAnonKey},
      body:JSON.stringify(data)
    }).then(async r => {
      const json=await r.json().catch(()=>({}));
      if(!r.ok || !json.ok) throw new Error(json.error || 'Não foi possível enviar a solicitação.');
      status.textContent='Solicitação recebida! A equipe comercial entrará em contato para confirmar a reunião.';
      status.style.color='#0e7655'; f.reset();
      if(window.turnstile) window.turnstile.reset();
    }).catch(() => {
      status.style.color='#bd413a';
      status.replaceChildren(document.createTextNode('Não foi possível registrar automaticamente. Envie a solicitação pelo WhatsApp: '));
      const link=document.createElement('a');
      const message=`Solicitação de diagnóstico FCAP JR.\nNome: ${data.nome}\nEmpresa: ${data.empresa}\nContato: ${data.celular}\nDia: ${data.data}\nHorário: ${data.horario}`;
      link.href='https://wa.me/5581981067088?text='+encodeURIComponent(message);
      link.textContent='Abrir WhatsApp';link.target='_blank';link.rel='noopener noreferrer';status.append(link);
    }).finally(()=>{ if(submit)submit.disabled=false; });
  });
})();
