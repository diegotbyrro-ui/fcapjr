// FCAPJR_R20R1_CALENDAR_COLOR_PROOF - Agenda inspirada no Google Calendar.
// FCAPJR_R19R2_CACHE_PROOF: 20261104 asset version verification.
// Central FCAP JR: o navegador usa somente a chave pública e respeita RLS.
// IA/Google/alertas externos rodam EXCLUSIVAMENTE nas Edge Functions.
const config=window.FCAP_CONFIG||{};
const root=document.getElementById('app');
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=v=>v?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Recife'}).format(new Date(v)):'—';
const isoLocal=iso=>{if(!iso)return '';const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const slugify=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);
const configOK=/^https:\/\/[a-z0-9.-]+\/?$/i.test(config.supabaseUrl||'')&&!!config.supabaseAnonKey;
let supabase=null,session=null,member=null,page='dashboard',modal=null,loading=false;
let leads=[],stages=[],tasks=[],meetings=[],articles=[],alerts=[],members=[],analyses=[],interactions=[],notificationContacts=[],prospects=[],searchMessage='',aiMessage='',secretaryMessage='',secretaryQuestion='',calendarItems=[];
let prospectorLast={term:'',region:'',quantity:''};
// R17 R1: histórico comercial manual sobre a tabela existente fcap_interactions.
// NÃO captura, lê ou envia mensagens de WhatsApp sem uma integração autorizada.
let conversationLeadId=null,conversationHistory=[],conversationHistoryStatus='idle';
let conversationFilters={search:'',owner:'all',activity:'all'};
let pipelineFilters={search:'',owner:'all',priority:'all',stale:'all'};
let dashboardFilters={period:'all',owner:'all',source:'all'};
// R22: visualizacao mensal. Dados DEMO ficam excluidos por padrao.
let dashboardTrendMonths=6,dashboardTrendIncludeDemo=false;
// R23: granularidade e pre-visualizacao ficticia apenas para diretoria, sem gravar no CRM.
let r23TrendScale='month',r23TrendWeeks=4,r23Presentation=false;
// R17 R2: caixa WhatsApp empresarial somente-leitura ate habilitar Meta Cloud API.
let waThreads=[],waMessages=[],waSelectedId=null,waLoadError='';
let waFilters={search:'',owner:'all',type:'all'};
const isDemoLead=l=>String(l?.company_name||'').startsWith('[DEMO]');
const r17Normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

const defaultSettings={calendarConnected:false,secretaryName:'Clara',secretaryWhatsapp:'Clara | FCAP Jr.',secretaryPhoto:'',aiProvider:'OpenAI',aiAssistant:'Assistente comercial FCAP',aiWebhook:'',aiPrompt:'Atue como secretária comercial da FCAP Jr., confirme agenda, organize tarefas e ajude o time a responder leads.'};
function appSettings(){try{return {...defaultSettings,...JSON.parse(localStorage.getItem('fcapjr_settings_'+(member?.user_id||'anonymous'))||'{}')}}catch{return {...defaultSettings}}}
function saveAppSettings(next){const merged={...appSettings(),...next};localStorage.setItem('fcapjr_settings_'+(member?.user_id||'anonymous'),JSON.stringify(merged));return merged}
function readFileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(Error('Falha ao ler o arquivo'));reader.readAsDataURL(file)})}
// R18 DEMO: agenda, equipe e prospector com dados claramente ficticios.
// Nunca persistir os compromissos/avisos abaixo nem conecta-los ao Google/WhatsApp.
let r18CalendarMode='week',r18CalendarFilter='all',r18CalendarAnchor='';
const r18DemoStaff=[
 {name:'Ana',role:'Consultora comercial · exemplo',team:'Relacionamento'},
 {name:'Bruno',role:'Consultor comercial · exemplo',team:'Prospecção'},
 {name:'Carla',role:'Consultora comercial · exemplo',team:'Diagnósticos'}
];
const r18DemoProspects=[
 {company_name:'[EXEMPLO] Aurora Soluções Empresariais',segment:'Consultoria B2B',city:'Recife · PE',score:86,opportunity:'Possível necessidade de padronização comercial. Hipótese fictícia, sem pesquisa.',phone:'Não identificado',email:'',sources:[]},
 {company_name:'[EXEMPLO] Círculo Saúde e Bem-estar',segment:'Clínicas',city:'Maceió · AL',score:81,opportunity:'Cenário ilustrativo de melhoria em atendimento e gestão.',phone:'Não identificado',email:'',sources:[]},
 {company_name:'[EXEMPLO] Mosaico Educação',segment:'Educação',city:'Recife · PE',score:77,opportunity:'Exemplo de expansão de processos administrativos.',phone:'Não identificado',email:'',sources:[]},
 {company_name:'[EXEMPLO] Via Norte Distribuição',segment:'Distribuição',city:'Jaboatão dos Guararapes · PE',score:74,opportunity:'Simulação de oportunidade para estruturação do funil comercial.',phone:'Não identificado',email:'',sources:[]},
 {company_name:'[EXEMPLO] Terravista Engenharia',segment:'Engenharia',city:'Olinda · PE',score:70,opportunity:'Simulação de qualificação para consultoria de processos.',phone:'Não identificado',email:'',sources:[]}
];
function r18DemoAllowed(){return member&&['admin','gestor'].includes(member.role)}
function r18DateKey(instant=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Recife',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
 const g=k=>parts.find(x=>x.type===k)?.value||'01';return `${g('year')}-${g('month')}-${g('day')}`;
}
function r18ShiftDate(key,delta){const d=new Date(`${key}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)}
function r18DemoInstant(offset,hm){return `${r18ShiftDate(r18DateKey(),offset)}T${hm}:00-03:00`}
function r18DemoMeetings(){if(!r18DemoAllowed())return [];
 const pool=leads.filter(isDemoLead);if(!pool.length)return [];
 const slots=[[-3,'09:00'],[-2,'14:00'],[-1,'11:00'],[0,'09:00'],[0,'11:00'],[0,'15:00'],[1,'09:30'],[1,'14:00'],[2,'10:00'],[2,'16:00'],[3,'09:00'],[3,'14:30'],[4,'10:30'],[5,'15:00'],[6,'09:00'],[7,'14:00'],[8,'10:30'],[10,'16:00'],[12,'09:00'],[14,'11:00']];
 return slots.map(([offset,start],i)=>{const lead=pool[i%pool.length],endMin=(Number(start.slice(0,2))*60+Number(start.slice(3))+60),end=`${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;
  return {id:`r18-demo-meeting-${i+1}`,lead_id:lead.id,assigned_to:null,title:`[EXEMPLO] Diagnóstico · ${lead.company_name.replace(/^\[DEMO\]\s*/,'')}`,start_at:r18DemoInstant(offset,start),end_at:r18DemoInstant(offset,end),status:'solicitada',google_event_id:null,demo_owner:waLeadOwner(lead),notes:'Reunião inteiramente fictícia, exibida apenas no navegador. Nenhuma reserva foi criada.',__demo:true};
 });
}
function r18DemoTasks(){if(!r18DemoAllowed())return [];
 const pool=leads.filter(isDemoLead);if(!pool.length)return [];
 const jobs=[[-3,'17:00','Revisar informações do diagnóstico'],[-1,'15:00','Atualizar etapa de oportunidade'],[0,'10:30','Preparar pauta da reunião'],[0,'16:30','Conferir proposta comercial'],[1,'11:00','Fazer acompanhamento pós-reunião'],[2,'15:00','Revisar documentos do cliente'],[3,'13:00','Enviar resumo interno da visita'],[5,'09:00','Revisar negociação em andamento'],[7,'11:00','Atualizar previsão comercial'],[8,'15:00','Planejar próximos contatos']];
 return jobs.map(([offset,hm,title],i)=>({id:`r18-demo-task-${i+1}`,lead_id:pool[i%pool.length].id,title:'[EXEMPLO] '+title,assigned_to:null,demo_owner:waLeadOwner(pool[i%pool.length]),due_at:r18DemoInstant(offset,hm),completed_at:i===0?r18DemoInstant(offset,'17:30'):null,__demo:true}));
}
function r18Owner(obj){if(obj?.__demo)return obj.demo_owner||'Equipe fictícia';return teammate(obj?.assigned_to)}
function r18CalParts(iso){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Recife',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));const v=k=>p.find(x=>x.type===k)?.value||'00';return {key:`${v('year')}-${v('month')}-${v('day')}`,minutes:Number(v('hour'))*60+Number(v('minute')),hm:`${v('hour')}:${v('minute')}`}}
function r18CalWeekStart(key){const d=new Date(`${key}T12:00:00Z`);return r18ShiftDate(key,-((d.getUTCDay()+6)%7))}
function r18CalDateLabel(key,opts={}){return new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',...opts}).format(new Date(`${key}T12:00:00Z`))}
// R20: calendário em estilo operacional Google Calendar, com paletas e responsáveis.
let r20CalendarOwner='all';
let r20Palette='vivid';
try{const saved=localStorage.getItem('fcap-r20-palette');if(['vivid','soft','deep'].includes(saved))r20Palette=saved}catch{}
if(document.documentElement)document.documentElement.dataset.fcapPalette=r20Palette;
const r20Hours={start:7,end:21,px:62};
const r20OwnerPalette=['azul','turquesa','violeta','laranja','rosa','verde','indigo','coral'];
function r20OwnerTone(owner){const name=String(owner||'').toLowerCase();if(name.includes('ana'))return 'azul';if(name.includes('bruno'))return 'turquesa';if(name.includes('carla'))return 'violeta';let hash=0;for(const char of name)hash=((hash*31)+char.charCodeAt(0))>>>0;return r20OwnerPalette[hash%r20OwnerPalette.length]}
function r20Tone(e){return e.kind==='task'?'amarelo':r20OwnerTone(e.owner)}
function r20CalendarAllOwners(){return [...new Set([...meetings.map(m=>r18Owner(m)),...tasks.map(t=>r18Owner(t))].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'))}
function r20MiniCalendar(){const key=r18CalendarAnchor||r18DateKey(),start=r18CalWeekStart(`${key.slice(0,7)}-01`),days=Array.from({length:42},(_,i)=>r18ShiftDate(start,i));
 const events=[...meetings.map(m=>m.start_at),...tasks.map(t=>t.due_at)].filter(Boolean);const counts={};for(const d of events){const k=r18CalParts(d).key;counts[k]=(counts[k]||0)+1}
 return `<div class="r20-mini"><div class="r20-mini-head"><strong>${esc(r18CalDateLabel(key,{month:'long',year:'numeric'}))}</strong><span>FCAP Jr.</span></div><div class="r20-mini-grid">${['S','T','Q','Q','S','S','D'].map(d=>`<span class="r20-mini-weekday">${d}</span>`).join('')}${days.map(d=>`<button type="button" class="r20-mini-date ${d===r18DateKey()?'today':''} ${d===key?'selected':''} ${d.slice(0,7)!==key.slice(0,7)?'other':''} ${counts[d]?'has-event':''}" data-action="r20-mini-date" data-day="${d}" aria-label="Ver ${esc(r18CalDateLabel(d,{day:'numeric',month:'long'}))}">${Number(d.slice(-2))}</button>`).join('')}</div></div>`}
function r20CalendarSidebar(){const owners=r20CalendarAllOwners();const meetingCount=meetings.length,taskCount=tasks.length;
 return `<aside class="r20-cal-side"><button type="button" class="r20-create" data-action="new-meeting" ${has('agenda.edit')?'':'disabled'}><b aria-hidden="true">＋</b> Criar reunião</button>${r20MiniCalendar()}<div class="r20-side-section"><h3>Minhas agendas</h3><button type="button" class="r20-filter-row ${r18CalendarFilter==='meeting'?'active':''}" data-action="r20-cal-type" data-type="meeting"><i class="r20-side-square r20-blue"></i><span>Reuniões <small>${meetingCount}</small></span></button><button type="button" class="r20-filter-row ${r18CalendarFilter==='task'?'active':''}" data-action="r20-cal-type" data-type="task"><i class="r20-side-square r20-yellow"></i><span>Tarefas <small>${taskCount}</small></span></button><button type="button" class="r20-filter-row ${r18CalendarFilter==='all'?'active':''}" data-action="r20-cal-type" data-type="all"><i class="r20-side-square r20-multi"></i><span>Todos os compromissos</span></button></div><div class="r20-side-section"><h3>Equipe comercial</h3>${owners.map(o=>`<button type="button" class="r20-owner ${r20CalendarOwner===o?'selected':''}" data-action="r20-cal-owner" data-owner="${esc(o)}"><i class="r20-color-dot r20-color-${r20OwnerTone(o)}"></i><span>${esc(o)}</span>${r20CalendarOwner===o?'<b>✓</b>':''}</button>`).join('')||'<small class="muted">Sem responsáveis cadastrados.</small>'}${r20CalendarOwner!=='all'?'<button type="button" class="r20-clear-owner" data-action="r20-cal-owner" data-owner="all">Mostrar toda a equipe</button>':''}</div><p class="r20-side-note">Exemplos fictícios não são reservas reais e não geram mensagens.</p></aside>`}
function r20Positioned(events){const sorted=events.map(e=>{const p=r18CalParts(e.start);const mins=Math.max(r20Hours.start*60,p.minutes);const duration=e.kind==='task'?35:Math.max(30,Math.min(180,(new Date(e.end)-new Date(e.start))/60000||60));return {e,start:mins,end:mins+duration}}).sort((a,b)=>a.start-b.start||b.end-a.end);
 const groups=[];let active=[],group=null;
 for(const item of sorted){active=active.filter(x=>x.end>item.start);if(!active.length){group=[];groups.push(group)}const used=new Set(active.map(x=>x.slot));let slot=0;while(used.has(slot))slot++;item.slot=slot;group.push(item);active.push(item)}
 return groups.flatMap(g=>{const total=Math.max(...g.map(x=>x.slot))+1;return g.map(x=>({e:x.e,top:Math.max(0,(x.start-r20Hours.start*60)/60*r20Hours.px),height:Math.max(28,Math.min((x.end-x.start)/60*r20Hours.px,(r20Hours.end*60-x.start)/60*r20Hours.px)),slot:x.slot,total}))})}
function r20NowMarker(dateKey){if(dateKey!==r18DateKey())return '';const now=r18CalParts(new Date().toISOString());if(now.minutes<r20Hours.start*60||now.minutes>=r20Hours.end*60)return '';const top=((now.minutes-r20Hours.start*60)/60*r20Hours.px).toFixed(1);return `<div class="r20-now-line" style="top:${top}px" aria-label="Horário atual"><span></span></div>`}
function r18CalendarEvents(){const m=meetings.map(x=>({id:x.id,kind:'meeting',title:x.title,start:x.start_at,end:x.end_at,owner:r18Owner(x),demo:!!x.__demo,lead_id:x.lead_id,status:x.status}));const t=tasks.map(x=>({id:x.id,kind:'task',title:x.title,start:x.due_at,end:x.due_at,owner:r18Owner(x),demo:!!x.__demo,lead_id:x.lead_id,status:x.completed_at?'Concluída':'Pendente'}));return [...m,...t].filter(x=>x.start&&(r18CalendarFilter==='all'||r18CalendarFilter===x.kind)&&(r20CalendarOwner==='all'||x.owner===r20CalendarOwner)).sort((a,b)=>new Date(a.start)-new Date(b.start))}
function r18CalEventCard(e,mode){const p=r18CalParts(e.start);const tone=r20Tone(e);return `<button type="button" class="r18-event r18-event-${esc(e.kind)} r20-color-${tone} ${e.demo?'r18-event-demo':''}" data-action="r18-cal-event" data-id="${esc(e.id)}" data-kind="${esc(e.kind)}" title="${esc(e.title)} · ${esc(e.owner)}" aria-label="${esc(p.hm)} ${esc(e.title)} · ${esc(e.owner)}"><b>${esc(p.hm)}</b> ${esc(e.title)}${mode==='long'?`<small>${e.kind==='meeting'?'◷':'✓'} ${esc(e.owner)}</small>`:''}</button>`}
function r18CalList(items){return items.map(e=>`<div class="r18-cal-list-row"><span class="r18-cal-time">${esc(r18CalParts(e.start).hm)}</span>${r18CalEventCard(e,'long')}</div>`).join('')||'<p class="empty">Nenhum compromisso nesta data.</p>'}
function r18CalDetail(data){const obj=(data.kind==='meeting'?meetings:tasks).find(x=>x.id===data.id);if(!obj)return '<p>Compromisso não encontrado.</p>';const start=data.kind==='meeting'?obj.start_at:obj.due_at;const lead=leadById(obj.lead_id);return `<section class="r18-event-detail"><span class="r18-demo-badge">${obj.__demo?'COMPROMISSO FICTÍCIO · SOMENTE VISUALIZAÇÃO':'COMPROMISSO DO CRM'}</span><h3>${esc(obj.title)}</h3><dl><dt>Data e hora</dt><dd>${esc(date(start))}</dd><dt>Responsável</dt><dd>${esc(r18Owner(obj))}</dd><dt>Cliente</dt><dd>${esc(lead?.company_name||'Não vinculado')}</dd><dt>Tipo</dt><dd>${data.kind==='meeting'?'Reunião comercial':'Tarefa interna'}</dd><dt>Status</dt><dd>${esc(data.kind==='meeting'?obj.status:(obj.completed_at?'Concluída':'Pendente'))}</dd></dl><p class="notice">${obj.__demo?'Este evento é um exemplo visual. Não existe no Google Agenda nem gera lembretes, mensagens ou reservas.':'Este evento foi registrado no CRM; sincronização externa depende de configuração.'}</p></section>`}
function r18CalendarToolbar(){const key=r18CalendarAnchor||r18DateKey(),w=r18CalWeekStart(key),mode=r18CalendarMode;
 const label=mode==='day'?r18CalDateLabel(key,{weekday:'long',day:'numeric',month:'long',year:'numeric'}):mode==='month'?r18CalDateLabel(key,{month:'long',year:'numeric'}):`${r18CalDateLabel(w,{day:'numeric',month:'short'})} — ${r18CalDateLabel(r18ShiftDate(w,6),{day:'numeric',month:'short',year:'numeric'})}`;
 return `<section class="r20-calendar-toolbar"><div class="r20-cal-brand"><div class="r20-cal-mark" aria-hidden="true"><span>▣</span></div><div><h2>Calendário da equipe</h2><small>Agenda corporativa · FCAP Jr.</small></div></div><div class="r20-cal-controls"><button class="r20-today" type="button" data-action="r18-cal-today">Hoje</button><button class="r20-arrow" type="button" data-action="r18-cal-prev" aria-label="Período anterior">‹</button><button class="r20-arrow" type="button" data-action="r18-cal-next" aria-label="Próximo período">›</button><strong class="r20-period">${esc(label)}</strong></div><div class="r20-cal-settings"><label class="r20-color-pick">Paleta <select id="r20-palette" aria-label="Paleta de cores">${[['vivid','Vibrante'],['soft','Suave'],['deep','Contraste']].map(([id,name])=>`<option value="${id}" ${r20Palette===id?'selected':''}>${name}</option>`).join('')}</select></label><button type="button" class="r20-cal-refresh" data-action="refresh" title="Atualizar dados da agenda" aria-label="Atualizar agenda">⟳</button><div class="r18-segments" role="group" aria-label="Visualização da agenda">${[['day','Dia'],['week','Semana'],['month','Mês']].map(([v,l])=>`<button type="button" data-action="r18-cal-mode" data-mode="${v}" class="${r18CalendarMode===v?'active':''}" aria-pressed="${r18CalendarMode===v}">${l}</button>`).join('')}</div></div></section>`;
}
function r18CalendarWeek(){const key=r18CalendarAnchor||r18DateKey(),start=r18CalendarMode==='day'?key:r18CalWeekStart(key),num=r18CalendarMode==='day'?1:7,days=Array.from({length:num},(_,i)=>r18ShiftDate(start,i)),events=r18CalendarEvents(),duration=(r20Hours.end-r20Hours.start)*r20Hours.px;
 const rows=Array.from({length:r20Hours.end-r20Hours.start},(_,i)=>`<div style="height:${r20Hours.px}px">${String(i+r20Hours.start).padStart(2,'0')}:00</div>`).join('');
 return `<section class="panel r18-calendar-canvas r20-calendar-canvas" aria-label="Grade de compromissos"><div class="r18-calendar-scroll"><div class="r18-week-grid ${num===1?'r18-day-only':''}"><div class="r18-week-axis-head">GMT−3</div>${days.map(d=>`<button class="r18-week-head ${d===r18DateKey()?'today':''}" type="button" data-action="r18-cal-day" data-day="${d}"><span>${esc(r18CalDateLabel(d,{weekday:'short'}))}</span><b>${Number(d.slice(-2))}</b></button>`).join('')}<div class="r18-week-time" style="height:${duration}px">${rows}</div>${days.map(d=>{const dayEvents=events.filter(e=>r18CalParts(e.start).key===d);return `<div class="r18-day-lane ${d===r18DateKey()?'today':''}" style="height:${duration}px;--hour-height:${r20Hours.px}px">${r20NowMarker(d)}${r20Positioned(dayEvents).map(p=>`<div class="r18-positioned-event" style="top:${p.top.toFixed(1)}px;height:${p.height.toFixed(1)}px;left:calc(${(p.slot/p.total*100).toFixed(2)}% + 3px);width:calc(${(100/p.total).toFixed(2)}% - 6px);right:auto">${r18CalEventCard(p.e,'long')}</div>`).join('')}</div>`}).join('')}</div></div><footer class="r18-calendar-legend"><span><i class="r18-dot meet"></i> Reuniões</span><span><i class="r18-dot task"></i> Tarefas</span><small>Eventos [EXEMPLO] são fictícios</small></footer></section>`;
}
function r18CalendarMonth(){const key=r18CalendarAnchor||r18DateKey(),first=`${key.slice(0,7)}-01`,from=r18CalWeekStart(first),days=Array.from({length:42},(_,i)=>r18ShiftDate(from,i)),events=r18CalendarEvents();return `<section class="panel r18-calendar-canvas"><div class="r18-month-grid">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(t=>`<div class="r18-month-weekday">${t}</div>`).join('')}${days.map(d=>{const dayEvents=events.filter(e=>r18CalParts(e.start).key===d);return `<div class="r18-month-cell ${d.slice(0,7)!==key.slice(0,7)?'other':''} ${d===r18DateKey()?'today':''}"><button type="button" data-action="r18-cal-day" data-day="${d}" class="r18-month-date">${Number(d.slice(-2))}</button>${dayEvents.slice(0,3).map(e=>r18CalEventCard(e,'short')).join('')}${dayEvents.length>3?`<button class="r18-month-more" data-action="r18-cal-day" data-day="${d}">+${dayEvents.length-3} compromissos</button>`:''}</div>`}).join('')}</div><footer class="r18-calendar-legend"><span><i class="r18-dot meet"></i> Reuniões</span><span><i class="r18-dot task"></i> Tarefas</span></footer></section>`}
function r18AgendaPage(){if(!r18CalendarAnchor)r18CalendarAnchor=r18DateKey();const events=r18CalendarEvents(),upcoming=events.filter(e=>new Date(e.start)>new Date()).slice(0,6),demoCount=events.filter(x=>x.demo).length;
 return `<div class="r20-calendar-shell">${r18CalendarToolbar()}<div class="r20-cal-status"><span class="r20-status-dot"></span><b>Prévia do Google Agenda</b><span>Conexão pendente · compromissos fictícios não reservam horários</span><span class="r20-demo-counter">${demoCount} eventos demo visíveis</span></div><div class="r20-calendar-body">${r20CalendarSidebar()}<div class="r20-calendar-main"><div class="r20-main-head"><span><b>${meetings.length}</b> reuniões <i>·</i> <b>${tasks.filter(t=>!t.completed_at).length}</b> tarefas pendentes</span><button type="button" class="r20-new-task" data-action="new-task" ${has('agenda.edit')?'':'disabled'}>+ Tarefa</button></div>${r18CalendarMode==='month'?r18CalendarMonth():r18CalendarWeek()}</div></div><div class="r20-calendar-below"><section class="panel"><h3>Próximos compromissos</h3>${r18CalList(upcoming)}</section><section class="panel"><h3>Informações da agenda</h3><p><b>Google Agenda:</b> conexão pendente. Nenhuma reserva criada pelos exemplos.</p><p><b>Equipe:</b> Ana, Bruno e Carla são vendedores fictícios.</p><p><b>Fuso horário:</b> Brasília/Recife · GMT−3.</p><p>Use o mini calendário para escolher um dia ou o seletor acima para visualizar a semana e o mês.</p></section></div></div>`;
}
function calendarMirrorItems(){const linked=calendarItems.length?calendarItems:meetings.filter(m=>m.assigned_to===member?.user_id||member?.role==='admin').map(m=>({summary:m.title,start:{dateTime:m.start_at},status:m.status}));return linked.slice().sort((a,b)=>String(a.start?.dateTime||a.start?.date||'').localeCompare(String(b.start?.dateTime||b.start?.date||''))).slice(0,6)}
function headerCalendarMirror(){if(page!=='agenda')return '';return `<div class="top-calendar-strip"><strong>Agenda corporativa · prévia</strong><span>Eventos de demonstração não são reservas reais.</span><em>Google Agenda: conexão pendente</em></div>`}
function getProspectorQuantity(value){const quantity=Number(value);return Number.isInteger(quantity)&&quantity>=1&&quantity<=100?quantity:null;}

const menus=[
 ['dashboard','◫','Dashboard','dashboard.view'],
 ['pipeline','▦','Pipeline comercial','pipeline.view'],
 ['leads','♧','Leads e clientes','leads.view'],
 ['whatsapp','◉','WhatsApp','leads.view'],
 ['agenda','▤','Agenda e tarefas','agenda.view'],
 ['prospector','⌕','Prospector IA','prospector.use'],
 ['secretaria','◈','Secretária IA','secretary.use'],
 ['artigos','▧','Blog / Marketing','blog.view'],
 ['avisos','◉','Avisos','alerts.view'],
 ['equipe','⚙','Funcionários e permissões','team.manage'],
 ['integracoes','⌁','Configurações','integrations.manage']
];
// SVG local: icones sem fonte externa e correspondentes a cada modulo.
const navPaths={
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 pipeline:'<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="16" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/>',
 leads:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2"/>',
 whatsapp:'<path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5 9.2 9.2 0 0 1-3.8-.8L3 21l1.6-4.9a8.4 8.4 0 1 1 15.4-4.6Z"/><path d="M8 11h8M8 14h5"/>',
 conversas:'<path d="M20 11.5A8.5 8.5 0 0 1 11.5 20a9 9 0 0 1-4-.94L3 20l.94-4A8.5 8.5 0 1 1 20 11.5Z"/><path d="M8 10h8M8 14h5"/>',
 relatorios:'<path d="M4 20V10M10 20V4M16 20v-8M22 20V7"/>',
 agenda:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h3M8 18h3"/>',
 prospector:'<circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 6 6M7 10h6"/>',
 secretaria:'<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M9 3h6M8 13h.01M16 13h.01M8 17h8"/>',
 artigos:'<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM4 17.5A3.5 3.5 0 0 1 7.5 14H20"/>',
 avisos:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 equipe:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-2a6 6 0 0 1 11-3M19 13v2M19 19v2M16 17h2M20 17h2"/>',
 integracoes:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/>'
};
function navIcon(id){return `<svg class="nav-svg" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${navPaths[id]||navPaths.dashboard}</svg>`}
// Previa: distribuicao com menor carga e sorteio apenas entre empatados.
function chooseInboundSeller(people,records,random=Math.random){const eligible=people.filter(m=>m.active&&m.role==='vendedor'&&(m.permissions||rolePresets.vendedor).includes('leads.edit'));if(!eligible.length)return null;const amounts=eligible.map(m=>({member:m,total:records.filter(l=>l.assigned_to===m.user_id&&isInbound(l.source)).length}));const min=Math.min(...amounts.map(x=>x.total));const tied=amounts.filter(x=>x.total===min);return tied[Math.floor(random()*tied.length)].member}
function isInbound(source){const s=String(source||'').trim().toLowerCase();return s.startsWith('site_')||s==='site'||s==='formulario_site'||s.startsWith('social_')||['instagram','facebook','meta_facebook','tiktok','linkedin'].includes(s)}
// Permissoes distintas: visualizar um modulo nao concede escrita nele.
const permissionGroups=[
 {title:'Painel e comercial',items:[['dashboard.view','Visão geral'],['pipeline.view','Pipeline comercial'],['leads.view','Consultar leads'],['leads.edit','Criar e editar leads'],['reports.view','Relatórios'],['leads.export','Exportar e importar leads']]},
 {title:'Agenda e automações',items:[['agenda.view','Consultar agenda e tarefas'],['agenda.edit','Criar e editar reuniões e tarefas'],['alerts.view','Receber e consultar avisos'],['secretary.use','Usar Secretária IA'],['integrations.manage','Conectar minha agenda e configurar automações']]},
 {title:'Inteligência artificial',items:[['prospector.use','Pesquisar com Prospector IA'],['analyst.use','Executar IA Analítica']]},
 {title:'Marketing',items:[['blog.view','Visualizar o painel do blog'],['blog.edit','Criar, editar e publicar artigos']]},
 {title:'Administração',items:[['team.manage','Gerenciar funcionários e permissões']]}
];
const allPermissions=permissionGroups.flatMap(g=>g.items.map(i=>i[0]));
const rolePresets={
 admin:allPermissions,
 gestor:['dashboard.view','pipeline.view','leads.view','leads.edit','leads.export','reports.view','agenda.view','agenda.edit','alerts.view','prospector.use','analyst.use','secretary.use','integrations.manage'],
 vendedor:['dashboard.view','pipeline.view','leads.view','leads.edit','agenda.view','agenda.edit','alerts.view','prospector.use','analyst.use','secretary.use'],
 marketing:['blog.view','blog.edit','alerts.view']
};
const has=(p)=>!!member&&(member.role==='admin'||(Array.isArray(member.permissions)?member.permissions:rolePresets[member.role]||[]).includes(p));
const canSales=()=>['dashboard.view','pipeline.view','leads.view','reports.view','agenda.view','prospector.use','analyst.use','secretary.use'].some(has);
const canManage=()=>has('leads.export');
const canBlog=()=>has('blog.view');
const visible=id=>{const info=menus.find(x=>x[0]===id);return !!info&&has(info[3])&&(id!=='equipe'||manageTeam())};
const manageTeam=()=>member?.role==='admin';
const displayRole=r=>({admin:'Administrador',gestor:'Gestor',vendedor:'Vendedor',marketing:'Marketing'}[r]||r);
function toast(msg,error=false){const el=document.createElement('div');el.className='toast';el.style.background=error?'#9b2834':'#10395c';el.textContent=msg;document.body.append(el);setTimeout(()=>el.remove(),5500)}
function showSetup(){root.innerHTML=`<div class="login"><div class="login-card"><img src="../assets/logo-fcap-clean.svg" alt="FCAP JR."><h1>Configuração pendente</h1><p>Para ativar a Central FCAP JR, configure URL e chave pública do Supabase em <code>dist/fcap-config.js</code>. Não insira chaves secretas no frontend.</p><a class="btn" href="../index.html">Voltar ao site</a></div></div>`}
function showLogin(message=''){root.innerHTML=`<div class="login"><form class="login-card" id="login-form"><img src="../assets/logo-fcap-clean.svg" alt="FCAP JR."><h1>Central de Gestão</h1><p>Acesso reservado aos integrantes autorizados da FCAP Jr.</p>${message?`<div class="notice error">${esc(message)}</div>`:''}<label>E-mail corporativo<input type="email" name="email" autocomplete="username" required></label><label>Senha<input type="password" name="password" autocomplete="current-password" required></label><button class="btn" type="submit">Entrar</button></form></div>`}
function goToLogin(reason=''){const url='./login.html'+(reason?'?status='+encodeURIComponent(reason):'');window.location.replace(url)}
async function init(){if(location.hash.startsWith('#integracoes'))page='integracoes';if(!configOK){goToLogin('setup');return}try{const lib=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm');supabase=lib.createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});const {data,error}=await supabase.auth.getSession();if(error)throw error;session=data.session;if(session)await loginCheck();else{goToLogin();return}supabase.auth.onAuthStateChange((event,s)=>{if(event==='SIGNED_OUT'){session=null;member=null;goToLogin()}else if(event==='SIGNED_IN'&&s&&!member){session=s;setTimeout(()=>loginCheck(),0)}})}catch(e){showLogin('Falha na conexão com o serviço de autenticação.')}}
async function loginCheck(){const {data:{user},error}=await supabase.auth.getUser();if(error||!user){goToLogin();return}session=(await supabase.auth.getSession()).data.session;
 const r=await supabase.from('fcap_members').select('*').eq('user_id',user.id).eq('active',true).maybeSingle();
 if(r.error||!r.data){member=null;await supabase.auth.signOut();goToLogin('unauthorized');return}
 member=r.data;await load();if(!visible(page))page=menus.find(x=>visible(x[0]))?.[0]||'avisos';render()}
async function loadWhatsApp(){
 if(!member||!has('leads.view'))return;
 const [threads,msgs]=await Promise.all([
  supabase.from('fcap_wa_threads').select('id,lead_id,demo_agent_name,status,is_demo,created_at').order('created_at',{ascending:false}).limit(1000),
  supabase.from('fcap_wa_messages').select('id,thread_id,direction,body,source,sent_at').order('sent_at',{ascending:false}).limit(1000)
 ]);
 if(threads.error||msgs.error){waLoadError='Não foi possível consultar a caixa de entrada autorizada.';waThreads=[];waMessages=[];return}
 waThreads=threads.data||[];waMessages=msgs.data||[];waLoadError='';
}
async function load(){
 if(!member)return;
 const requests=[['members',supabase.from('fcap_members').select('user_id,full_name,role,active,phone,email,permissions').order('full_name')]];
 if(has('alerts.view'))requests.push(['alerts',supabase.from('fcap_alerts').select('*').order('created_at',{ascending:false}).limit(100)]);
 if(['pipeline.view','leads.view','leads.edit','prospector.use','analyst.use','dashboard.view','reports.view'].some(has)){
  requests.push(['stages',supabase.from('fcap_stages').select('*').order('position')]);
  requests.push(['leads',supabase.from('fcap_leads').select('*').order('created_at',{ascending:false}).limit(1000)]);
 }
 if(has('agenda.view')||has('secretary.use')||has('dashboard.view')){
  requests.push(['tasks',supabase.from('fcap_tasks').select('*').order('due_at').limit(500)]);
  requests.push(['meetings',supabase.from('fcap_meetings').select('*').order('start_at').limit(500)]);
 }
 if(has('analyst.use'))requests.push(['analyses',supabase.from('fcap_analyses').select('*').order('created_at',{ascending:false}).limit(250)]);
  if(has('leads.view'))requests.push(['interactions',supabase.from('fcap_interactions').select('id,lead_id,kind,created_at').order('created_at',{ascending:false}).limit(750)]);
  if(member.role==='admin')requests.push(['notificationContacts',supabase.from('fcap_notification_contacts').select('id,full_name,phone_e164,notify_meetings,notify_changes,receive_director_report,consent_confirmed,active,created_at').order('full_name')]);
 if(has('blog.view'))requests.push(['articles',supabase.from('fcap_articles').select('*').order('created_at',{ascending:false}).limit(100)]);
 const responses=await Promise.all(requests.map(async([name,query])=>({name,...await query})));
 for(const r of responses){
  if(r.error){toast('Falha em '+r.name+': '+r.error.message,true);continue}
  if(r.name==='members')members=r.data||[];
  if(r.name==='alerts')alerts=r.data||[];
  if(r.name==='stages')stages=r.data||[];
  if(r.name==='leads')leads=r.data||[];
  if(r.name==='tasks')tasks=r.data||[];
  if(r.name==='meetings')meetings=r.data||[];
  if(r.name==='analyses')analyses=r.data||[];
   if(r.name==='articles')articles=r.data||[];
   if(r.name==='interactions')interactions=r.data||[];
   if(r.name==='notificationContacts')notificationContacts=r.data||[];
 }
 if(has('leads.view'))await loadWhatsApp();
 // Exemplos exclusivos para a diretoria. Nenhuma reunião/tarefa fictícia vai ao banco.
 if(r18DemoAllowed()){meetings=[...meetings.filter(x=>!x.__demo),...r18DemoMeetings()];tasks=[...tasks.filter(x=>!x.__demo),...r18DemoTasks()]}
}

function leadById(id){return leads.find(x=>x.id===id)}
function stage(id){return stages.find(x=>x.id===id)||{name:'Sem etapa',kind:'open'}}
function teammate(id){return members.find(x=>x.user_id===id)?.full_name||'Não atribuído'}
function opts(rows,value,label,selected='',empty='Selecione'){return `<option value="">${esc(empty)}</option>`+rows.map(r=>`<option value="${esc(r[value])}" ${String(r[value])===String(selected)?'selected':''}>${esc(r[label])}</option>`).join('')}
const teamOpts=(id='')=>opts(members.filter(x=>x.active&&x.role!=='marketing'),'user_id','full_name',id,'Não atribuído');
const stageOpts=(id='')=>opts(stages,'id','name',id,'Escolha uma etapa');
function render(){
 if(!member)return showLogin();
 if(page==='conversas')page='whatsapp';
 if(!visible(page))page=menus.find(x=>visible(x[0]))?.[0]||'avisos';
 const info=menus.find(x=>x[0]===page)||menus[0],unread=alerts.filter(a=>!a.read_at).length;
 const initials=String(member.full_name||'FC').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
 const firstName=String(member.full_name||'Usuário').trim().split(/\s+/)[0]||'Usuário';
 const navItems=menus.filter(x=>visible(x[0])).map(x=>`<button type="button" data-page="${x[0]}" class="${page===x[0]?'active':''}"><span class="navicon" aria-hidden="true">${navIcon(x[0])}</span><span>${x[2]}</span>${x[0]==='avisos'&&unread?`<em class="notification-count">${unread}</em>`:''}</button>`).join('');
 root.innerHTML=`<div class="shell ap-shell"><aside class="sidebar"><div class="sidebrand sidebrand-compact"><div class="brand-square brand-square-large"><img src="../assets/logo-fcap-clean.svg" alt="FCAP JR."></div><div class="sidebrand-copy"><small>Painel de gestão</small></div></div><div class="nav-section">NAVEGAÇÃO</div><nav class="nav">${navItems}</nav><div class="sidefooter"><button type="button" data-action="theme-toggle" class="theme-toggle"><span aria-hidden="true">◐</span> Alternar tema</button><div class="member-footer"><div class="member-copy"><b>${esc(member.full_name)}</b><small>${esc(displayRole(member.role))}</small></div></div><button class="logout" data-action="logout">Sair do sistema ↗</button><small class="build-version">FCAP JR. · R23</small></div></aside><div class="workspace"><div class="topbar"><div>${headerCalendarMirror()}<h1>${esc(info[2])}</h1><p>FCAP Jr. · Gestão comercial</p></div><div class="topactions"><div class="profile-chip" title="Usuário conectado"><strong>${esc(firstName)}</strong></div><button class="btn secondary" data-action="refresh">Atualizar</button></div></div><main class="content">${content()}</main></div></div>${modal?modalHTML():''}`;
 if(page==='pipeline'){wirePipelineNavigation();wireDrag();}
}

function content(){if(page==='dashboard')return dashboard();if(page==='pipeline')return pipeline();if(page==='leads')return leadsPage();if(page==='whatsapp')return whatsappPage();if(page==='agenda')return agendaPage();if(page==='prospector')return prospectorPage();if(page==='secretaria')return secretaryPage();if(page==='artigos')return articlesPage();if(page==='avisos')return alertsPage();if(page==='equipe')return equipePage();if(page==='integracoes')return integrationsPage();return ''}
function filteredDashboardLeads(){
 const d=dashboardFilters,now=Date.now();
 return leads.filter(l=>{
  if(d.owner!=='all'&&String(l.assigned_to||'unassigned')!==d.owner)return false;
  if(d.source!=='all'&&String(l.source||'')!==d.source)return false;
  if(d.period!=='all'){
   const age=now-new Date(l.created_at).getTime();
   if(!Number.isFinite(age)||age>Number(d.period)*86400000||age<0)return false;
  }
  return true;
 });
}
function r17SelectOptions(values,selected,allLabel){return `<option value="all">${esc(allLabel)}</option>`+values.map(([v,label])=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(label)}</option>`).join('')}
function dashMetrics(items=leads){
 const now=Date.now(),oneDay=86400000,ago30=now-30*oneDay;
 const byKind=k=>items.filter(l=>stage(l.stage_id).kind===k);
 const opened=byKind('open'),won=byKind('won'),lost=byKind('lost');
 const decided=won.length+lost.length;
 const pending=tasks.filter(t=>!t.completed_at),overdue=pending.filter(t=>new Date(t.due_at).getTime()<now);
 const upcoming=meetings.filter(m=>m.status!=='cancelada'&&new Date(m.start_at).getTime()>=now);
 const in30=items.filter(l=>new Date(l.created_at).getTime()>=ago30);
 const completed=tasks.filter(t=>!!t.completed_at);
 const estimated=a=>a.reduce((total,l)=>total+(Number(l.estimated_value)||0),0);
 const counts=items=>items.length;
 return {now,oneDay,ago30,opened,won,lost,decided,pending,overdue,upcoming,in30,completed,estimated,counts,unassigned:opened.filter(l=>!l.assigned_to),winRate:decided?Math.round(100*won.length/decided):null};
}
function dashBar(label,count,total,extra=''){
 const pct=total?Math.round(count*100/total):0;
 return `<div class="dash-bar-item"><div class="dash-bar-head"><span>${esc(label)}</span><b>${count} <small>(${pct}%)</small></b></div><div class="dash-bar-track" role="img" aria-label="${esc(label)}: ${count} de ${total}"><i style="width:${pct}%"></i></div>${extra?`<small class="muted">${esc(extra)}</small>`:''}</div>`;
}

/* FCAPJR_R22_MONTHLY_TREND_PROOF: serie temporal no Dashboard, sem bibliotecas ou APIs externas.
   Todos os registros provem de leads/meetings ja carregados sob RLS do usuario. */
const r22MonthDateFormat=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',timeZone:'America/Recife'});
const r22ShortMonthFormat=new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'});
function r22MonthKey(value){
 const d=value instanceof Date?value:new Date(value);
 if(!Number.isFinite(d.getTime()))return '';
 const p=r22MonthDateFormat.formatToParts(d);
 const y=p.find(x=>x.type==='year')?.value;
 const m=p.find(x=>x.type==='month')?.value;
 return y&&m?`${y}-${m}`:'';
}
function r22MonthlyTrend(rows,includeDemo=dashboardTrendIncludeDemo,months=dashboardTrendMonths){
 const n=Math.max(1,Math.min(12,Math.trunc(Number(months)||6)));
 const current=r22MonthKey(new Date());
 const [year,month]=(current||'2026-01').split('-').map(Number);
 const timeline=Array.from({length:n},(_,i)=>{
  const d=new Date(Date.UTC(year,month-n+i,1));
  return {key:d.toISOString().slice(0,7),label:r22ShortMonthFormat.format(d).replace('.',''),year:d.getUTCFullYear(),leads:0,meetings:0};
 });
 const map=new Map(timeline.map(x=>[x.key,x]));
 const eligible=rows.filter(l=>includeDemo||!isDemoLead(l));
 const ids=new Set(eligible.map(l=>l.id));
 eligible.forEach(l=>{const x=map.get(r22MonthKey(l.created_at));if(x)x.leads++});
 meetings.forEach(m=>{
  if(m.status==='cancelada'||(!includeDemo&&m.__demo)||!ids.has(m.lead_id))return;
  const x=map.get(r22MonthKey(m.start_at));if(x)x.meetings++;
 });
 return timeline;
}
function r22NiceStep(value){
 if(value<=1)return 1;
 const power=Math.pow(10,Math.floor(Math.log10(value)));
 const fraction=value/power;
 return (fraction<=1?1:fraction<=2?2:fraction<=5?5:10)*power;
}
/* FCAPJR_R23_PREMIUM_DASHBOARD_PROOF - semanal/mensal, cards semanticos e simulacao local. */
const r23PreviewAllowed=()=>!!member&&['admin','gestor'].includes(member.role);
const r23PreviewActive=()=>r23PreviewAllowed()&&r23Presentation;
const r23DayParts=new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Recife'});
function r23LocalDateKey(value){
 const d=value instanceof Date?value:new Date(value);
 if(!Number.isFinite(d.getTime()))return '';
 const p=r23DayParts.formatToParts(d);
 const part=k=>p.find(x=>x.type===k)?.value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
function r23WeekKey(value){
 const key=r23LocalDateKey(value);
 if(!key)return '';
 const d=new Date(key+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
 return d.toISOString().slice(0,10);
}
function r23WeeklyTrend(rows,includeDemo=dashboardTrendIncludeDemo,weeks=r23TrendWeeks){
 const n=Math.max(1,Math.min(4,Math.trunc(Number(weeks)||4)));
 const now=r23WeekKey(new Date());
 const start=new Date(now+'T12:00:00Z');
 const dates=Array.from({length:n},(_,i)=>{
  const d=new Date(start);d.setUTCDate(d.getUTCDate()-7*(n-1-i));
  const key=d.toISOString().slice(0,10);
  const label=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',timeZone:'UTC'}).format(d).replace('.','');
  return {key,label,year:d.getUTCFullYear(),leads:0,meetings:0};
 });
 const map=new Map(dates.map(d=>[d.key,d]));
 const eligible=rows.filter(l=>includeDemo||!isDemoLead(l));
 const ids=new Set(eligible.map(l=>l.id));
 eligible.forEach(l=>{const p=map.get(r23WeekKey(l.created_at));if(p)p.leads++});
 meetings.forEach(m=>{
  if(m.status==='cancelada'||(!includeDemo&&m.__demo)||!ids.has(m.lead_id))return;
  const p=map.get(r23WeekKey(m.start_at));if(p)p.meetings++;
 });
 return dates;
}
function r23PresentationValues(timeline,weekly){
 // Totalmente inventados para demonstracao. Nunca persistir nem utilizar em relatorios reais.
 const monthL=[48,55,61,64,72,81,98,112,118,131,129,144];
 const monthM=[17,22,26,29,32,36,34,38,44,47,56,68];
 const weekL=[6,9,8,12,11,13,16,18,15,20,22,26];
 const weekM=[2,3,4,5,4,7,6,8,7,10,11,13];
 const a=weekly?weekL:monthL,b=weekly?weekM:monthM;
 const left=a.length-timeline.length;
 return timeline.map((t,i)=>({...t,leads:a[left+i],meetings:b[left+i]}));
}
function r23DataSeries(rows){
 const weekly=r23TrendScale==='week';
 const series=weekly?r23WeeklyTrend(rows):r22MonthlyTrend(rows);
 return r23PreviewActive()?r23PresentationValues(series,weekly):series;
}
function r23Delta(current,previous){
 if(!previous)return {label:current?'Sem base anterior':'Sem variação',tone:'neutral'};
 const pct=(current-previous)*100/previous;
 const signed=(pct>0?'+':'')+pct.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
 return {label:signed,tone:pct>0?'up':pct<0?'down':'neutral'};
}
function r23KpiIcon(key){
 const paths={
  users:'<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 15h4"/>',
  briefcase:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 12h20M11 12v3h2v-3"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  trend:'<path d="M3 17l6-6 4 4 8-8M16 7h5v5"/>',
  trophy:'<path d="M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0V3zM7 5H4v3a4 4 0 0 0 4 4M17 5h3v3a4 4 0 0 1-4 4"/>',
  alert:'<path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.8 3h16.8a2 2 0 0 0 1.8-3L13.7 3.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>'
 };
 return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key]||paths.trend}</svg>`;
}
function r23KpiCards(items){
 return items.map(([name,value,help,tone,ico,change])=>{
  const chip=change?`<span class="r23-kpi-change r23-change-${change.tone}">${esc(change.label)}</span>`:'';
  return `<article class="card dash-kpi r23-kpi-card r23-tone-${tone}">
   <div class="r23-kpi-row"><span class="r23-kpi-symbol">${r23KpiIcon(ico)}</span><span class="r23-kpi-name">${esc(name)}</span></div>
   <div class="r23-kpi-value"><strong>${esc(value)}</strong>${chip}</div>
   <small>${esc(help)}</small></article>`;
 }).join('');
}
function dashboardTrendChart(selectedLeads){
 const values=r23DataSeries(selectedLeads),weekly=r23TrendScale==='week',preview=r23PreviewActive();
 const totalLeads=values.reduce((s,m)=>s+m.leads,0);
 const totalMeetings=values.reduce((s,m)=>s+m.meetings,0);
 const last=values[values.length-1],prev=values[values.length-2];
 const leadChange=r23Delta(last.leads,prev?.leads),meetingChange=r23Delta(last.meetings,prev?.meetings);
 const max=Math.max(1,...values.flatMap(m=>[m.leads,m.meetings]));
 const step=r22NiceStep(max/4),top=step*4;
 const width=1000,left=52,right=27,topY=34,height=223;
 const x=i=>values.length===1?(left+width-right)/2:left+i*(width-left-right)/(values.length-1);
 const y=v=>topY+height*(1-v/top);
 const fmt=n=>Number(n.toFixed(2));
 const path=metric=>values.map((m,i)=>`${i?'L':'M'} ${fmt(x(i))} ${fmt(y(m[metric]))}`).join(' ');
 const leadPath=path('leads'),meetPath=path('meetings');
 const area=metric=>`${path(metric)} L ${fmt(x(values.length-1))} ${fmt(y(0))} L ${fmt(x(0))} ${fmt(y(0))} Z`;
 const grid=Array.from({length:5},(_,i)=>{
  const tick=i*step,ty=fmt(y(tick));
  return `<line class="r22-chart-grid" x1="${left}" y1="${ty}" x2="${width-right}" y2="${ty}"/><text class="r22-chart-tick" x="${left-16}" y="${ty+4}" text-anchor="end">${tick}</text>`;
 }).join('');
 const labels=values.map((m,i)=>`<text class="r22-chart-month" x="${fmt(x(i))}" y="${topY+height+31}" text-anchor="middle">${esc(m.label)}${!weekly&&m.key.slice(5)==='01'?' '+m.year:''}</text>`).join('');
 const points=metric=>values.map((m,i)=>{
  const cx=fmt(x(i)),cy=fmt(y(m[metric])),value=m[metric];
  const showTag=values.length<=8||i===values.length-1||(i%3===0);
  const tagY=metric==='leads'?Math.max(15,cy-20):Math.min(topY+height-2,cy-18);
  const tag=showTag&&value>0?`<g class="r23-chart-tag r23-chart-tag-${metric}" aria-hidden="true"><rect x="${fmt(cx-17)}" y="${fmt(tagY-14)}" width="34" height="19" rx="6"/><text x="${cx}" y="${fmt(tagY)}" text-anchor="middle">${value}</text></g>`:'';
  return `${tag}<circle class="r22-chart-point r22-chart-${metric}" cx="${cx}" cy="${cy}" r="5" tabindex="0"><title>${esc(m.label)} ${m.year}: ${value} ${metric==='leads'?'leads cadastrados':'reuniões agendadas'}</title></circle>`;
 }).join('');
 const noData=totalLeads===0&&totalMeetings===0;
 const note=noData?'<span class="r22-trend-empty">Sem movimentação neste intervalo. Os dados fictícios não são contabilizados por padrão.</span>':'';
 const periodLabel=weekly?'semanas':'meses';
 const interval=weekly?r23TrendWeeks:dashboardTrendMonths;
 const options=weekly?Array.from({length:4},(_,i)=>[i+1,i===0?'Última semana':'Últimas '+(i+1)+' semanas']):Array.from({length:12},(_,i)=>[i+1,i===0?'Último 1 mês':'Últimos '+(i+1)+' meses']);
 const selector=`<select id="${weekly?'r23-trend-weeks':'r22-trend-months'}" aria-label="Intervalo do gráfico">${options.map(([n,label])=>`<option value="${n}" ${interval===n?'selected':''}>${label}</option>`).join('')}</select>`;
 const previewButton=r23PreviewAllowed()?`<button type="button" class="r23-presentation-button ${preview?'is-active':''}" data-action="r23-toggle-demo" aria-pressed="${preview}">${preview?'Encerrar apresentação':'Prévia para apresentação'}</button>`:'';
 return `<section class="panel r22-trend-panel r23-trend-panel ${preview?'r23-preview-active':''}" aria-label="Comparativo comercial ${weekly?'semanal':'mensal'}">
  <div class="r22-trend-header"><div><span class="eyebrow">EVOLUÇÃO COMERCIAL</span><h2>Comparativo comercial</h2><p class="muted">Leads cadastrados × reuniões agendadas vinculadas aos leads filtrados</p></div>
    <span class="r23-trend-status ${preview?'is-demo':''}">${preview?'EXEMPLO FICTÍCIO':'DADOS DO CRM'}</span></div>
  <div class="r23-trend-toolbar"><div class="r23-trend-segment" role="group" aria-label="Agrupamento do gráfico">
    <button type="button" data-action="r23-scale-month" aria-pressed="${!weekly}" class="${!weekly?'is-active':''}">Mês a mês</button><button type="button" data-action="r23-scale-week" aria-pressed="${weekly}" class="${weekly?'is-active':''}">Semana a semana</button>
   </div><div class="r22-trend-filters"><label>Período ${selector}</label>${previewButton}
   ${!preview?`<label class="r22-trend-demo"><input type="checkbox" id="r22-trend-demo" ${dashboardTrendIncludeDemo?'checked':''}><span>Incluir DEMO do CRM</span></label>`:''}
   </div></div>
  <div class="r22-trend-overview"><div class="r22-trend-summary"><span class="r22-legend-dot r22-legend-leads"></span><span>Novos leads</span><strong>${totalLeads}</strong><span class="r23-trend-delta r23-change-${leadChange.tone}">${esc(leadChange.label)}</span></div>
   <div class="r22-trend-summary"><span class="r22-legend-dot r22-legend-meetings"></span><span>Reuniões agendadas</span><strong>${totalMeetings}</strong><span class="r23-trend-delta r23-change-${meetingChange.tone}">${esc(meetingChange.label)}</span></div>
   <span class="r22-trend-scope">${preview?'Simulação visual · sem dados reais':dashboardTrendIncludeDemo?'Dados reais + registros DEMO':'Somente dados reais'}</span></div>
  <div class="r22-chart-scroll"><svg class="r22-trend-svg r23-trend-svg ${values.length===12?'r22-trend-12':''}" viewBox="0 0 ${width} 310" role="img" aria-label="Evolução comercial: ${totalLeads} leads e ${totalMeetings} reuniões em ${values.length} ${periodLabel}">
    <defs><linearGradient id="r23BlueFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#2563eb" stop-opacity=".17"/><stop offset="100%" stop-color="#2563eb" stop-opacity="0"/></linearGradient><linearGradient id="r23GreenFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#059669" stop-opacity=".15"/><stop offset="100%" stop-color="#059669" stop-opacity="0"/></linearGradient></defs>
    ${grid}<path d="${area('leads')}" fill="url(#r23BlueFill)"/><path d="${area('meetings')}" fill="url(#r23GreenFill)"/>
    <path class="r22-chart-line r22-chart-leads" d="${leadPath}"/><path class="r22-chart-line r22-chart-meetings" d="${meetPath}"/>
    ${points('leads')}${points('meetings')}${labels}
   </svg></div>
  <div class="r22-trend-foot">${note}${preview?'<strong class="r23-preview-disclaimer">Apresentação fictícia: os valores desta visualização e dos cartões superiores são simulados e não representam resultados da FCAP Jr.</strong>':''}
   <span>Comparação dos ${weekly?'7 dias de cada semana (segunda a domingo)':'meses de calendário'}: os percentuais comparam o último período ao imediatamente anterior; o período atual ainda está em andamento. Horário de Maceió. ${preview?'A simulação não utiliza os filtros do CRM.':'O gráfico considera os filtros do Dashboard e o acesso do usuário.'}${!preview&&dashboardTrendIncludeDemo?' Registros [DEMO] e reuniões [EXEMPLO] são fictícios.':''}${!preview&&(leads.length>=1000||meetings.length>=500)?' Atenção: a consulta tem limite de registros; períodos antigos podem estar incompletos.':''}</span></div>
 </section>`;
}

function dashboard(){
 const selectedLeads=filteredDashboardLeads();
 const m=dashMetrics(selectedLeads),est=m.estimated,openAmount=est(m.opened),wonAmount=est(m.won);
 const canReport=has('reports.view')&&['admin','gestor'].includes(member.role);
 const liveMonths=r22MonthlyTrend(selectedLeads,false,6);
 const currentMonth=liveMonths[liveMonths.length-1],previousMonth=liveMonths[liveMonths.length-2];
 const preview=r23PreviewActive(),exampleMonth=r23PresentationValues(liveMonths,false);
 const exampleCurrent=exampleMonth[exampleMonth.length-1],examplePrevious=exampleMonth[exampleMonth.length-2];
 const kpiNow=preview?exampleCurrent:currentMonth,kpiPrev=preview?examplePrevious:previousMonth;
 const indicators=[
 ['Leads do mês',kpiNow.leads,`vs. mês anterior (${kpiPrev.leads})`,'blue','users',r23Delta(kpiNow.leads,kpiPrev.leads)],
 ['Reuniões agendadas',kpiNow.meetings,`vs. mês anterior (${kpiPrev.meetings})`,'emerald','calendar',r23Delta(kpiNow.meetings,kpiPrev.meetings)],
 ['Oportunidades abertas',preview?27:m.opened.length,'Em negociação','amber','briefcase',null],
 ['Conversão de negócios',preview?'33,8%':m.winRate===null?'—':m.winRate+'%','Ganhos ÷ negócios decididos','violet','target',null],
 ['Potencial em aberto',preview?'R$ 215.000':money(openAmount),'Valor estimado, não faturado','indigo','trend',null],
 ['Negócios ganhos',preview?9:m.won.length,preview?'R$ 72.000 estimados':money(wonAmount)+' estimados','teal','trophy',null],
 ['Tarefas atrasadas',preview?3:m.overdue.length,'Prazos vencidos e não concluídos','rose','alert',null],
 ['Reuniões futuras',preview?12:m.upcoming.length,'Solicitadas e confirmadas','sky','clock',null]
 ];
 const stagesHTML=stages.map(s=>{const list=selectedLeads.filter(l=>l.stage_id===s.id);return dashBar(s.name,list.length,selectedLeads.length,`${money(est(list))} em oportunidades`)}).join('')||'<p class="empty">Etapas não carregadas.</p>';
 const bySource=new Map();selectedLeads.forEach(l=>{const key=String(l.source||'Não informada').trim()||'Não informada';bySource.set(key,(bySource.get(key)||0)+1)});
 const sourcesHTML=[...bySource.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([key,count])=>dashBar(key.replaceAll('_',' '),count,selectedLeads.length)).join('')||'<p class="empty">Ainda não há origens para analisar.</p>';
 const sellers=members.filter(x=>x.active&&['vendedor','gestor','admin'].includes(x.role));
 const teamHTML=sellers.map(x=>{const pool=selectedLeads.filter(l=>l.assigned_to===x.user_id);const won=pool.filter(l=>stage(l.stage_id).kind==='won');return `<div class="dash-team-row"><div><strong>${esc(x.full_name)}</strong><small>${esc(displayRole(x.role))}</small></div><div class="dash-team-stats"><b>${pool.length}</b><span>leads</span><b>${won.length}</b><span>ganhos</span></div></div>`}).join('')||'<p class="empty">Sem equipe cadastrada.</p>';
 const recent=selectedLeads.slice(0,6).map(l=>`<div class="statline"><span><b>${esc(l.company_name)}</b><small class="muted" style="display:block">${esc(stage(l.stage_id).name)} · ${date(l.created_at)}</small></span><button class="btn ghost" data-action="view-lead" data-id="${esc(l.id)}">Abrir</button></div>`).join('')||'<p class="empty">Nenhum lead recebido ainda.</p>';
 const items=m.upcoming.slice().sort((a,b)=>new Date(a.start_at)-new Date(b.start_at)).slice(0,6).map(x=>`<div class="statline"><span><b>${esc(x.title)}</b><small class="muted" style="display:block">${date(x.start_at)} · ${esc(teammate(x.assigned_to))}</small></span><span class="tag">${esc(x.status)}</span></div>`).join('')||'<p class="empty">Sem reuniões futuras.</p>';
 const overdue=m.overdue.slice().sort((a,b)=>new Date(a.due_at)-new Date(b.due_at)).slice(0,5).map(t=>`<div class="statline"><span><b>${esc(t.title)}</b><small class="muted" style="display:block">Vencida em ${date(t.due_at)} · ${esc(teammate(t.assigned_to))}</small></span></div>`).join('')||'<p class="empty">Nenhuma tarefa em atraso.</p>';
 const analysisCount=analyses.filter(a=>new Date(a.created_at).getTime()>=m.ago30).length;
 return `<div class="r23-dashboard-shell ${preview?'r23-presentation-active':''}"><div class="dashboard-heading flex space"><div><span class="eyebrow">INTELIGÊNCIA OPERACIONAL</span><h2>Painel completo do CRM ${preview?'<span class="r23-heading-demo">PRÉVIA FICTÍCIA</span>':''}</h2><p class="muted">Vendas, equipe, atividades, agenda e prioridades em um só lugar.</p></div><div class="dash-actions">${canReport?'<button class="btn secondary" data-action="director-report">Gerar relatório da diretoria</button>':''}<button class="btn" data-action="new-lead" ${has('leads.edit')?'':'disabled'}>+ Novo lead</button></div></div>
 <div class="r17-dashboard-filters panel" aria-label="Filtros dos leads no Dashboard">
   <label>Período de cadastro<select id="r17-dashboard-period">${r17SelectOptions([['30','Últimos 30 dias'],['90','Últimos 90 dias'],['365','Últimos 12 meses']],dashboardFilters.period,'Todos os períodos')}</select></label>
   <label>Responsável<select id="r17-dashboard-owner">${r17SelectOptions([['unassigned','Sem responsável'],...members.filter(m=>m.active).map(m=>[m.user_id,m.full_name])],dashboardFilters.owner,'Todos os responsáveis')}</select></label>
   <label>Origem<select id="r17-dashboard-source">${r17SelectOptions([...new Set(leads.map(l=>String(l.source||'')))].filter(Boolean).sort().map(x=>[x,x.replaceAll('_',' ')]),dashboardFilters.source,'Todas as origens')}</select></label>
   <p class="muted">Os filtros se aplicam aos indicadores de leads e do funil; tarefas e reuniões seguem o acesso do seu perfil. A consulta atual carrega até 1.000 leads.</p>
 </div>${preview?'<p class="r23-presentation-note">PRÉVIA PARA APRESENTAÇÃO — os cartões coloridos e o gráfico abaixo são inteiramente simulados. Os outros blocos continuam mostrando os dados já autorizados do CRM.</p>':leads.some(isDemoLead)?'<p class="r17-wa-demo-warning">ATENÇÃO: alguns indicadores do CRM incluem clientes fictícios [DEMO]. Leads do mês, reuniões do mês e gráfico excluem DEMO por padrão.</p>':''}<div class="dash-kpis r23-kpis">${r23KpiCards(indicators.slice(0,4))}</div>
 ${dashboardTrendChart(selectedLeads)}
 <div class="dash-kpis r23-kpis r23-kpis-secondary">${r23KpiCards(indicators.slice(4))}</div>
 <div class="dash-top-grid"><section class="panel"><div class="section-heading"><h2>Distribuição do funil</h2><span class="tag">${selectedLeads.length} registros</span></div>${stagesHTML}</section><section class="panel"><h2>Origem das oportunidades</h2>${sourcesHTML}</section></div>
 <div class="dash-top-grid"><section class="panel"><div class="section-heading"><h2>Produtividade da equipe</h2><span class="tag">${sellers.length} integrantes ativos</span></div>${teamHTML}</section><section class="panel"><h2>Atividade registrada</h2><div class="dash-activity-grid"><div><b>${m.completed.length}</b><small>Tarefas concluídas</small></div><div><b>${m.pending.length}</b><small>Tarefas pendentes</small></div><div><b>${meetings.filter(x=>x.status==='confirmada').length}</b><small>Reuniões confirmadas</small></div><div><b>${interactions.length}</b><small>Interações carregadas</small></div><div><b>${analysisCount}</b><small>Análises IA nos últimos 30 dias</small></div><div><b>${m.unassigned.length}</b><small>Leads abertos sem responsável</small></div></div></section></div>
 <div class="dash-top-grid"><section class="panel"><h2>Próximas reuniões</h2>${items}</section><section class="panel"><h2>Prazos que exigem atenção</h2>${overdue}</section></div>
 <section class="panel"><div class="section-heading"><h2>Leads recentes</h2><span class="tag">Últimos registros</span></div>${recent}</section>
 <p class="dash-disclaimer">${preview?'Os oito cartões e o gráfico desta prévia são SIMULADOS, apenas para apresentação. Os blocos inferiores continuam mostrando os dados autorizados do CRM. ':''}Indicadores calculados a partir dos dados visíveis ao seu perfil e dos limites de consulta do CRM (até 1.000 leads, 500 tarefas, 500 reuniões, 750 interações e 250 análises). Valores financeiros são estimativas cadastradas, não faturamento real. ${!selectedLeads.length?'Ainda não há dados comerciais suficientes para análise de conversão.':''}</p></div>`;
}

function stageManager(){return has('leads.edit')&&['admin','gestor'].includes(member?.role)}
function filteredPipelineLeads(){const f=pipelineFilters;return leads.filter(l=>{
 if(f.search&&!r17Normalize([l.company_name,l.contact_name,l.segment,l.phone].join(' ')).includes(r17Normalize(f.search)))return false;
 if(f.owner!=='all'&&String(l.assigned_to||'unassigned')!==f.owner)return false;
 if(f.priority!=='all'&&l.priority!==f.priority)return false;
 if(f.stale!=='all'){
  const age=Date.now()-new Date(l.updated_at||l.created_at).getTime();
  if(f.stale==='stale' && !(age>7*86400000))return false;
  if(f.stale==='recent' && !(age<=7*86400000))return false;
 }
 return true;
})}
function pipeline(){const shown=filteredPipelineLeads();return `<div class="panel pipeline-topbar flex space"><div><h2>Funil comercial</h2><p class="muted">Arraste os cartões para mudar de etapa. Role o quadro horizontalmente para consultar todo o funil.</p></div><div class="flex">${stageManager()?'<button class="btn secondary" data-action="new-stage">+ Criar coluna</button>':''}<button class="btn" data-action="new-lead" ${has('leads.edit')?'':'disabled'}>+ Novo lead</button></div></div><div class="r17-pipeline-filters panel" aria-label="Filtros do pipeline"><label>Buscar empresa ou contato<input id="r17-pipeline-search" type="search" value="${esc(pipelineFilters.search)}" placeholder="Empresa, contato, telefone, segmento"></label><label>Responsável<select id="r17-pipeline-owner">${r17SelectOptions([['unassigned','Sem responsável'],...members.filter(m=>m.active).map(m=>[m.user_id,m.full_name])],pipelineFilters.owner,'Todos')}</select></label><label>Prioridade<select id="r17-pipeline-priority">${r17SelectOptions([['alta','Alta'],['media','Média'],['baixa','Baixa']],pipelineFilters.priority,'Todas')}</select></label><label>Movimentação<select id="r17-pipeline-stale">${r17SelectOptions([['stale','Parados há mais de 7 dias'],['recent','Até 7 dias']],pipelineFilters.stale,'Qualquer')}</select></label><small class="muted">${shown.length} de ${leads.length} oportunidades exibidas. Tempo de movimentação baseado no campo updated_at.</small></div>${leads.some(isDemoLead)?'<div class="r17-wa-demo-warning">DADOS DE DEMONSTRAÇÃO: clientes [DEMO] são fictícios e aparecem no pipeline e nos indicadores.</div>':''}<div class="r20r2-pipeline-nav" role="group" aria-label="Navegação horizontal pelas etapas do funil"><div class="r20r2-nav-text"><strong>Navegar entre etapas</strong><small>Cada coluna possui sua própria barra vertical.</small></div><button class="r20r2-nav-button" type="button" data-action="r20r2-pan" data-dir="left" aria-label="Mostrar etapas anteriores" title="Etapas anteriores">&#8592;</button><button class="r20r2-nav-button" type="button" data-action="r20r2-pan" data-dir="right" aria-label="Mostrar próximas etapas" title="Próximas etapas">&#8594;</button></div><div class="r20r2-top-scroll" id="r20r2-top-scroll" aria-label="Rolagem horizontal das etapas" tabindex="0"><div id="r20r2-top-width" class="r20r2-top-width"></div></div><div class="kanban" id="r20r2-kanban" aria-label="Etapas do funil comercial">${stages.map(s=>{const all=shown.filter(l=>l.stage_id===s.id);const kind=s.kind==='won'?'won':s.kind==='lost'?'lost':'open';return `<section class="column stage-${kind}" data-drop-stage="${esc(s.id)}"><header class="column-head"><div class="column-title"><span class="stage-mark"></span><strong>${esc(s.name)}</strong><span class="count">${all.length}</span></div>${stageManager()?`<button type="button" class="stage-delete" title="Excluir coluna vazia" aria-label="Excluir coluna ${esc(s.name)}" data-action="delete-stage" data-id="${esc(s.id)}" ${all.length?'disabled title="Mova os leads antes de excluir"':''}>✕</button>`:''}</header><div class="column-meta">${money(all.reduce((total,l)=>total+Number(l.estimated_value||0),0))} em oportunidades</div><div class="column-cards" role="list" aria-label="Leads da etapa ${esc(s.name)}">${all.map(l=>`<article role="listitem" class="leadcard" draggable="${has('leads.edit')?'true':'false'}" data-drag-lead="${esc(l.id)}"><strong>${esc(l.company_name)}</strong>${isDemoLead(l)?'<span class="r17-wa-tag">EXEMPLO</span>':''}<p>${esc(l.contact_name||'Sem contato')} · ${esc(l.segment||'Sem segmento')}</p><span class="tag ${l.temperature==='quente'?'hot':''}">${esc(l.temperature||'morno')}</span><p>${money(l.estimated_value)}</p>${isDemoLead(l)?`<small>Responsável (demo): ${esc(waLeadOwner(l))}</small>`:''}<div class="leadcard-actions"><button class="btn ghost" data-action="view-lead" data-id="${esc(l.id)}">Detalhes</button>${waThreads.some(w=>w.lead_id===l.id)?`<button class="btn secondary" type="button" data-action="open-whatsapp" data-id="${esc(l.id)}">WhatsApp</button>`:''}${has('leads.edit')?`<label class="visually-hidden" for="move-${esc(l.id)}">Mover lead de coluna</label><select id="move-${esc(l.id)}" class="lead-stage-quick" data-move-lead="${esc(l.id)}" title="Mover para outra coluna" aria-label="Mover ${esc(l.company_name)} para etapa">${stages.map(o=>`<option value="${esc(o.id)}" ${o.id===s.id?'selected':''}>${esc(o.name)}</option>`).join('')}</select>`:''}</div></article>`).join('')||'<p class="column-empty">Arraste um lead para esta etapa.</p>'}</div><div class="column-footer">${all.length} ${all.length===1?'empresa':'empresas'}</div></section>`}).join('')}</div><p class="muted pipeline-hint">Deslize o quadro horizontalmente para ver outras etapas. As alterações nas etapas são salvas no CRM conforme as permissões do usuário.</p>`}
function leadRows(items){return items.map(l=>{const last=interactions.find(i=>i.lead_id===l.id);return `<tr><td><strong>${esc(l.company_name)}</strong><small>${esc(l.segment)}</small></td><td>${esc(l.contact_name)}<br><small>${esc(l.email)}</small></td><td><span class="pill">${esc(stage(l.stage_id).name)}</span></td><td>${esc(waLeadOwner(l))}</td><td>${last?date(last.created_at):'Sem registro'}</td><td>${money(l.estimated_value)}</td><td><button class="btn ghost" data-action="view-lead" data-id="${esc(l.id)}">Detalhes</button>${waThreads.some(w=>w.lead_id===l.id)?` <button class="btn secondary" type="button" data-action="open-whatsapp" data-id="${esc(l.id)}">WhatsApp</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="7" class="empty">Nenhum lead encontrado.</td></tr>'}

function leadsPage(){return `<div class="panel"><div class="flex space"><div><h2>Base de empresas e contatos</h2><p class="muted">Consulta, atribuição, histórico e origem dos leads.</p></div><div class="flex"><button class="btn" data-action="new-lead" ${has('leads.edit')?'':'disabled'}>+ Cadastrar empresa</button>${canManage()?`<button class="btn secondary" data-action="export-csv">Exportar CSV</button><label style="margin:0">Importar JSON<input type="file" id="leads-import-file" accept=".json,application/json" style="max-width:200px"></label><button class="btn ghost" data-action="import-json">Importar</button>`:''}</div></div><label>Filtrar<input id="lead-filter" placeholder="Empresa, contato, segmento..."></label><div class="tablewrap"><table><thead><tr><th>Empresa</th><th>Contato</th><th>Etapa</th><th>Responsável</th><th>Último registro</th><th>Valor</th><th>Ações</th></tr></thead><tbody id="lead-rows">${leadRows(leads)}</tbody></table></div></div>`}
// R17 R1: Central de acompanhamento dos contatos. Fonte: CRM fcap_interactions.
// Não é monitoramento de WhatsApp. Conversas reais exigem integração autorizada.
function conversationCandidates(){
 const f=conversationFilters;
 return leads.filter(l=>{
  if(f.search&&!r17Normalize([l.company_name,l.contact_name,l.email,l.phone,l.segment].join(' ')).includes(r17Normalize(f.search)))return false;
  if(f.owner!=='all'&&String(l.assigned_to||'unassigned')!==f.owner)return false;
  if(f.activity==='with'&&!interactions.some(x=>x.lead_id===l.id))return false;
  if(f.activity==='without'&&interactions.some(x=>x.lead_id===l.id))return false;
  return true;
 }).sort((a,b)=>{
  const last=id=>interactions.find(x=>x.lead_id===id)?.created_at||'';
  return String(last(b.id)||b.created_at).localeCompare(String(last(a.id)||a.created_at));
 });
}
function conversationLogHTML(){
 if(conversationHistoryStatus==='loading')return '<p class="empty">Carregando histórico autorizado…</p>';
 if(conversationHistoryStatus==='error')return '<p class="notice error">Não foi possível consultar o histórico. Tente novamente.</p>';
 if(!conversationHistory.length)return '<p class="empty">Ainda não há registros comerciais para este lead. Adicione a primeira nota de acompanhamento.</p>';
 const label={nota:'Nota interna',whatsapp:'Resumo de atendimento via WhatsApp',ligacao:'Ligação registrada',reuniao:'Reunião registrada'};
 return conversationHistory.map(x=>`<article class="r17-conversation-entry"><div class="r17-conversation-entry-top"><span class="tag">${esc(label[x.kind]||x.kind)}</span><small>${date(x.created_at)}</small></div><p>${esc(x.body)}</p><small class="muted">Registrado manualmente no CRM${x.author_id?' · '+esc(teammate(x.author_id)):''}. Não é transcrição automática.</small></article>`).join('');
}
// R17 R2: leitura autentica de dados salvos no Supabase; mensagens DEMO sao explicitamente ficticias.
function waOwner(t,l){return t.is_demo?(t.demo_agent_name||'Vendedor fictício'):teammate(l?.assigned_to)}
function waLeadOwner(l){const t=waThreads.find(w=>w.lead_id===l.id&&w.is_demo);return t?waOwner(t,l):teammate(l.assigned_to)}
function waLast(t){return waMessages.find(m=>m.thread_id===t.id)}
function waCandidates(){const f=waFilters;
 return waThreads.filter(t=>{const l=leadById(t.lead_id);if(!l)return false;
  if(f.type==='demo'&&!t.is_demo)return false;
  if(f.type==='real'&&t.is_demo)return false;
  if(f.owner!=='all'&&waOwner(t,l)!==f.owner)return false;
  if(f.search&&!r17Normalize([l.company_name,l.contact_name,l.segment,waOwner(t,l)].join(' ')).includes(r17Normalize(f.search)))return false;
  return true;
 }).sort((a,b)=>String(waLast(b)?.sent_at||b.created_at).localeCompare(String(waLast(a)?.sent_at||a.created_at)));
}
function waMessageHTML(t){const items=waMessages.filter(m=>m.thread_id===t.id).sort((a,b)=>String(a.sent_at).localeCompare(String(b.sent_at)));
 return items.length?items.map(m=>`<div class="r17-wa-line ${m.direction==='outbound'?'out':'in'}"><div class="r17-wa-bubble"><p>${esc(m.body)}</p><small>${esc(date(m.sent_at))}${m.source==='demo'?' · DEMONSTRAÇÃO':''}</small></div></div>`).join(''):'<p class="empty">Ainda não há mensagens vinculadas. A integração com a API oficial está pendente.</p>';
}
function whatsappPage(){
 const items=waCandidates(),selected=items.find(t=>t.id===waSelectedId)||items[0]||null;
 const lead=selected?leadById(selected.lead_id):null;
 const owners=[...new Set(waThreads.map(t=>{const l=leadById(t.lead_id);return l?waOwner(t,l):''}).filter(Boolean))].sort();
 const demoCount=waThreads.filter(t=>t.is_demo).length;
 return `<div class="r17-wa-title panel"><div><span class="eyebrow">ATENDIMENTO · NÚMERO ÚNICO</span><h2>WhatsApp da FCAP Jr.</h2><p class="muted">Uma caixa de entrada, conversas organizadas por responsável e acesso gerencial.</p></div><div class="r17-wa-stats"><span><b>${waThreads.length}</b> conversas</span><span><b>${demoCount}</b> demonstrações</span><button type="button" class="btn secondary" data-action="wa-refresh">Atualizar</button></div></div>
 <div class="r17-wa-demo-warning"><strong>PRÉVIA SEM ENVIO:</strong> as conversas marcadas DEMO são totalmente fictícias. Esta área apenas consulta dados do Supabase. Não lê o WhatsApp real, não envia mensagens nem conecta o número da FCAP.</div>
 ${waLoadError?`<div class="notice error">${esc(waLoadError)}</div>`:''}
 <div class="r17-wa-filters panel"><label>Buscar empresa ou contato<input type="search" id="r17-wa-search" value="${esc(waFilters.search)}" placeholder="Nome da empresa, cliente ou vendedor"></label><label>Responsável<select id="r17-wa-owner">${r17SelectOptions(owners.map(x=>[x,x]),waFilters.owner,'Todos os vendedores')}</select></label><label>Visualização<select id="r17-wa-type">${r17SelectOptions([['demo','Demonstração'],['real','Conversa real']],waFilters.type,'Todas')}</select></label></div>
 <div class="r17-wa-layout"><section class="panel r17-wa-list"><h3>Conversas <span class="tag">${items.length}</span></h3><div class="r17-wa-list-inner">${items.map(t=>{const l=leadById(t.lead_id),last=waLast(t);return `<button type="button" class="r17-wa-entry ${selected?.id===t.id?'active':''}" data-action="wa-select" data-id="${esc(t.id)}"><div class="r17-wa-avatar">${esc(String(l.contact_name||l.company_name||'?').trim().slice(0,1).toUpperCase())}</div><div class="r17-wa-entry-body"><strong>${esc(l.company_name)}</strong><small>${esc(waOwner(t,l))}</small><span>${esc(last?.body||'Sem mensagens')}</span></div>${t.is_demo?'<em>DEMO</em>':''}</button>`}).join('')||'<p class="empty">Nenhuma conversa disponível neste filtro.</p>'}</div></section>
 <section class="panel r17-wa-chat">${selected&&lead?`<header class="r17-wa-chat-head"><div><small class="eyebrow">CONVERSA COMERCIAL ${selected.is_demo?'· DEMO':''}</small><h2>${esc(lead.contact_name||lead.company_name)}</h2><span>${esc(lead.company_name)} · ${esc(waOwner(selected,lead))}</span></div><button class="btn secondary" data-action="view-lead" data-id="${esc(lead.id)}">Ficha do cliente</button></header><div class="r17-wa-chat-body">${waMessageHTML(selected)}</div><footer class="r17-wa-compose-disabled"><span>Mensagens em modo de leitura. Envio pelo WhatsApp será ativado após a integração oficial.</span><button class="btn" disabled>Enviar mensagem</button></footer>`:'<div class="empty">Selecione uma conversa para visualizar o histórico.</div>'}</section>
 <aside class="panel r17-wa-side">${selected&&lead?`<span class="eyebrow">DADOS DO CLIENTE</span><h3>${esc(lead.company_name)}</h3>${selected.is_demo?'<span class="r17-wa-tag">CLIENTE FICTÍCIO</span>':''}<dl><dt>Contato</dt><dd>${esc(lead.contact_name||'Não informado')}</dd><dt>Telefone</dt><dd>${esc(isDemoLead(lead)?'Não cadastrado — DEMO':lead.phone||'Não informado')}</dd><dt>Setor</dt><dd>${esc(lead.segment||'Não informado')}</dd><dt>Responsável</dt><dd>${esc(waOwner(selected,lead))}</dd><dt>Etapa comercial</dt><dd>${esc(stage(lead.stage_id).name)}</dd><dt>Valor estimado</dt><dd>${esc(money(lead.estimated_value))}</dd><dt>Situação</dt><dd>${esc(selected.status.replaceAll('_',' '))}</dd></dl><button class="btn ghost" data-action="view-lead" data-id="${esc(lead.id)}">Ver dados completos</button>`:'<p class="muted">Selecione um contato.</p>'}</aside></div>`;
}
function conversationsPage(){
 const visibleLeads=conversationCandidates();
 const current=visibleLeads.find(l=>l.id===conversationLeadId);
 return `<section class="r17-conversations-header panel"><div><span class="eyebrow">OPERAÇÃO COMERCIAL · R17</span><h2>Central de Conversas e Atendimentos</h2><p class="muted">Acompanhamento de contatos, histórico e responsáveis. A diretoria acompanha as oportunidades visíveis ao seu perfil.</p></div><span class="tag">${member?.role==='admin'||member?.role==='gestor'?'Visão gerencial':'Minha carteira'}</span></section>
 <div class="notice r17-conversations-notice"><strong>Importante:</strong> aqui aparecem registros feitos no CRM. Não há leitura automática de WhatsApp nem acesso a mensagens pessoais. A integração real será configurada depois, independentemente de a FCAP usar um número ou vários.</div>
 <div class="r17-conversation-filters panel"><label>Buscar empresa ou contato<input type="search" id="r17-conversation-search" value="${esc(conversationFilters.search)}" placeholder="Empresa, telefone, contato…"></label><label>Responsável<select id="r17-conversation-owner">${r17SelectOptions([['unassigned','Sem responsável'],...members.filter(m=>m.active).map(m=>[m.user_id,m.full_name])],conversationFilters.owner,'Todos')}</select></label><label>Histórico<select id="r17-conversation-activity">${r17SelectOptions([['with','Com registros'],['without','Sem registros']],conversationFilters.activity,'Todos')}</select></label><small class="muted">${visibleLeads.length} leads visíveis · registros recentes podem estar limitados aos últimos 750 carregados</small></div>
 <div class="r17-conversations-layout"><section class="panel r17-conversation-list"><h3>Contatos</h3><div class="r17-conversation-items">${visibleLeads.map(l=>{const last=interactions.find(x=>x.lead_id===l.id);return `<button type="button" class="r17-conversation-item ${l.id===conversationLeadId?'active':''}" data-action="select-conversation-lead" data-id="${esc(l.id)}"><strong>${esc(l.company_name)}</strong><small>${esc(l.contact_name||'Sem contato')} · ${esc(teammate(l.assigned_to))}</small><span>${last?'Último registro: '+date(last.created_at):'Sem registro de interação'}</span></button>`}).join('')||'<p class="empty">Nenhum contato encontrado nos filtros.</p>'}</div></section>
 <section class="panel r17-conversation-detail">${current?`<header class="r17-conversation-detail-top"><div><span class="eyebrow">HISTÓRICO DE ATENDIMENTO</span><h2>${esc(current.company_name)}</h2><p>${esc(current.contact_name||'Contato não informado')} · ${esc(current.phone||'Sem telefone')} · Responsável: <strong>${esc(teammate(current.assigned_to))}</strong></p></div><button class="btn ghost" data-action="view-lead" data-id="${esc(current.id)}">Ver lead</button></header>
 <div id="r17-conversation-thread" class="r17-conversation-thread" aria-live="polite">${conversationLeadId===current.id?conversationLogHTML():'<p class="empty">Selecione o contato para consultar o histórico.</p>'}</div>
 ${has('leads.edit')?`<form id="r17-conversation-note-form" class="r17-conversation-compose"><input type="hidden" name="lead_id" value="${esc(current.id)}"><label>Tipo de registro<select name="kind" required><option value="nota">Nota interna</option><option value="whatsapp">Resumo de conversa no WhatsApp (manual)</option><option value="ligacao">Ligação</option><option value="reuniao">Reunião</option></select></label><label>Resumo do atendimento<textarea name="body" maxlength="5000" minlength="3" required rows="4" placeholder="Descreva o contato, o retorno do cliente e o próximo passo. Não cole senhas ou dados sensíveis."></textarea></label><div class="r17-composer-actions"><small class="muted">Este formulário registra apenas histórico interno; não envia mensagem ao cliente.</small><button class="btn" type="submit">Registrar atendimento</button></div></form>`:'<div class="notice">Sua permissão permite consulta, mas não registrar novos atendimentos.</div>'}`:'<p class="empty">Selecione um lead da lista para acompanhar seus registros.</p>'}</section></div>`;
}
async function loadConversationHistory(id){
 if(!id||!leads.some(x=>x.id===id))return;
 conversationLeadId=id;conversationHistory=[];conversationHistoryStatus='loading';
 const target=document.getElementById('r17-conversation-thread');if(target)target.innerHTML=conversationLogHTML();
 const {data,error}=await supabase.from('fcap_interactions').select('id,lead_id,author_id,kind,body,created_at').eq('lead_id',id).order('created_at',{ascending:false}).limit(250);
 if(conversationLeadId!==id)return;
 conversationHistoryStatus=error?'error':'ready';conversationHistory=data||[];
 const el=document.getElementById('r17-conversation-thread');if(el)el.innerHTML=conversationLogHTML();
 if(error)toast('Erro ao consultar o histórico: '+error.message,true);
}
function agendaPage(){return r18AgendaPage()}
function prospectorPage(){const example=r18DemoAllowed()&&!prospects.length;const items=example?r18DemoProspects:prospects;
 return `<section class="panel"><div class="flex space"><div><span class="eyebrow">PROSPECTOR IA · FCAP JR.</span><h2>Localize empresas com perfil para consultoria</h2><p class="muted">Busca real depende da configuração de IA. Abaixo há exemplos inventados somente para visualizar o resultado.</p></div></div><form id="prospector-form" class="grid3"><label>Segmento desejado<input name="term" required minlength="3" placeholder="Ex.: clínicas médicas" value="${esc(prospectorLast.term)}"></label><label>Região<input name="region" placeholder="Ex.: Recife, PE" value="${esc(prospectorLast.region)}"></label><label>Quantidade de empresas<input id="prospector-quantity" type="number" name="quantity" inputmode="numeric" required min="1" max="100" step="1" placeholder="Digite a quantidade" value="${esc(prospectorLast.quantity)}" aria-describedby="quantity-help"><small id="quantity-help" class="muted">Informe de 1 a 100. Buscas maiores são feitas em etapas de até 10.</small></label><button class="btn" type="submit">Pesquisar com IA</button></form>${searchMessage?`<p class="notice" role="status">${esc(searchMessage)}</p>`:''}</section>${example?'<div class="r18-demo-banner"><b>5 EMPRESAS FICTÍCIAS · DEMONSTRAÇÃO</b><span>Sem pesquisa executada, sem fontes verificadas e sem números reais. Os scores são ilustrativos; nenhum botão cadastra esses exemplos.</span></div>':''}<div class="article-grid r18-prospect-grid">${items.map((p,i)=>`<article class="article-tile r18-prospect-card"><div class="r18-prospect-row"><span class="tag">${example?'SCORE SIMULADO':'Score'} ${Number(p.score)||0}/100</span>${example?'<span class="r18-demo-badge">EXEMPLO</span>':''}</div><h3>${esc(p.company_name)}</h3><p>${esc(p.segment||'')} · ${esc(p.city||'')}</p><p>${esc(p.opportunity||'')}</p><p><b>Contato público:</b> ${esc(p.phone||p.email||'Não identificado')}</p><p><b>Fontes:</b> ${example?'Não houve pesquisa':(p.sources||[]).map(s=>{const u=cleanUrl(s);return u?`<a class="source" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`:''}).join('<br>')||'Não confirmadas'}</p>${example?'<button type="button" class="btn secondary" disabled>Exemplo · não cadastrar</button>':`<button class="btn" data-action="save-prospect" data-index="${i}">+ Adicionar ao CRM</button>`}</article>`).join('')}</div>`;
}
function r18DemoArticles(){return `<div class="r18-demo-article-grid">${[
 ['Como organizar o funil de vendas','Gestão comercial','Rascunho editorial fictício sobre etapas e produtividade.'],
 ['Indicadores que a liderança deve acompanhar','Estratégia','Prévia de artigo sobre indicadores de conversão e acompanhamento.'],
 ['Checklist para diagnóstico empresarial','Processos','Exemplo de publicação sobre entrevistas e mapeamento de necessidades.']
 ].map(([title,category,excerpt])=>`<article class="article-tile r18-preview-card"><span class="r18-demo-badge">RASCUNHO FICTÍCIO</span><h3>${esc(title)}</h3><p>${esc(category)}</p><p>${esc(excerpt)}</p><small>Somente visualização · não publicado</small></article>`).join('')}</div>`}
function r18DemoAlerts(){return `<section class="panel r18-preview-panel"><span class="r18-demo-badge">AVISOS FICTÍCIOS</span><h3>Como ficarão as notificações internas</h3>${['Novo lead distribuído para Ana (exemplo)','Reunião de diagnóstico amanhã às 09:00 (exemplo)','Proposta pronta para acompanhamento de Bruno (exemplo)'].map(x=>`<div class="r18-alert-preview"><span class="r18-dot task"></span>${esc(x)}</div>`).join('')}<p class="muted">Avisos apenas de demonstração. Não estão na central real, não são contados como não lidos e não são enviados.</p></section>`}
function r18DemoStaffPanel(){return `<section class="panel r18-preview-panel"><div class="r18-prospect-row"><div><span class="r18-demo-badge">EQUIPE FICTÍCIA</span><h3>Exemplo de distribuição comercial</h3></div><small class="muted">Sem contas, senhas, convites ou permissões de acesso</small></div><div class="r18-demo-staff-grid">${r18DemoStaff.map(x=>`<div class="r18-demo-staff"><b>${esc(x.name[0])}</b><div><strong>${esc(x.name)}</strong><span>${esc(x.role)}</span><small>${esc(x.team)}</small></div></div>`).join('')}</div></section>`}

function secretaryPage(){return `<section class="panel"><span class="eyebrow">SECRETÁRIA IA · FCAP JR.</span><h2>Atendimento interno aos vendedores</h2><p class="muted">Consulte novos leads, tarefas pendentes, reuniões e compromissos. A secretária só lê informações disponíveis à sua função; ela não envia mensagens nem altera eventos pelo chat.</p><form id="secretary-form"><label>Pergunte à secretária<input name="question" required minlength="2" maxlength="500" placeholder="Ex.: Quais são minhas reuniões desta semana?" value="${esc(secretaryQuestion)}"></label><button class="btn">Consultar Secretária IA</button></form>${secretaryMessage?`<div class="notice" style="white-space:pre-wrap;margin-top:18px">${esc(secretaryMessage)}</div>`:''}</section><div class="grid2"><section class="panel"><h2>Próximas reuniões</h2>${meetings.filter(x=>new Date(x.start_at)>new Date()).slice(0,6).map(x=>`<div class="statline"><span><b>${esc(x.title)}</b><small class="muted" style="display:block">${date(x.start_at)}</small></span></div>`).join('')||'<p class="empty">Sem reuniões previstas.</p>'}</section><section class="panel"><h2>Leads recém-chegados</h2>${leads.slice(0,6).map(x=>`<div class="statline"><span><b>${esc(x.company_name)}</b><small class="muted" style="display:block">${date(x.created_at)}</small></span></div>`).join('')||'<p class="empty">Nenhum lead recebido.</p>'}</section></div>${r18DemoAllowed()?`<section class="panel r18-preview-panel"><span class="r18-demo-badge">SIMULAÇÃO</span><h3>Como a secretária irá organizar o expediente</h3><div class="r18-sample-chips"><span>08:00 · Revisar prioridades do dia</span><span>09:00 · Conferir diagnósticos</span><span>14:00 · Lembrar responsáveis pelas reuniões</span></div><p class="muted">Estes horários representam um roteiro visual fictício. Não houve execução de IA nem envio de notificações.</p></section>`:''}`}
function articlesPage(){return `<div class="panel flex space"><div><h2>Editor do Blog</h2><p class="muted">Crie, revise, publique e atualize artigos sem editar o GitHub.</p></div><button class="btn" data-action="new-article" ${has('blog.edit')?'':'disabled'}>+ Novo artigo</button></div><div class="article-grid">${articles.map(a=>`<article class="article-tile"><span class="tag ${a.status==='publicado'?'won':''}">${esc(a.status)}</span><h3>${esc(a.title)}</h3><p>${esc(a.excerpt)}</p><p>${esc(a.category)} · ${a.published_at?date(a.published_at):'Não publicado'}</p><button class="btn ghost" data-action="edit-article" data-id="${a.id}" ${has('blog.edit')?'':'disabled'}>Editar</button> ${a.status==='publicado'?`<a target="_blank" rel="noopener" class="btn secondary" href="../artigo.html?slug=${encodeURIComponent(a.slug)}">Ver artigo ↗</a>`:''}</article>`).join('')||(r18DemoAllowed()?r18DemoArticles():'<div class="panel empty">Nenhum artigo criado pelo novo editor. Os artigos antigos do site continuam disponíveis.</div>')}</div>`}
function alertsPage(){return `<div class="panel"><div class="flex space"><h2>Secretária IA · Central de avisos</h2><button class="btn secondary" data-action="mark-alerts">Marcar todos como lidos</button></div><p class="muted">Novos leads e reuniões confirmadas geram avisos automáticos. Alertas por e-mail/WhatsApp exigem ativar a função de entrega.</p>${alerts.map(a=>`<div class="alert" style="opacity:${a.read_at?'.55':'1'}"><div class="flex space"><strong>${esc(a.message)}</strong><small>${date(a.created_at)}</small></div><small>${esc(a.category)}</small></div>`).join('')||'<p class="empty">Sem alertas no momento.</p>'}</div>${r18DemoAllowed()?r18DemoAlerts():''}`}
function equipePage(){
 if(!manageTeam())return '<section class="panel"><h2>Acesso restrito</h2><p>Somente o administrador pode configurar funcionários e permissões.</p></section>';
 const enabled=members.filter(m=>m.active).length;
 return `<section class="permissions-intro"><div><span class="eyebrow">CONFIGURAÇÕES / EQUIPE</span><h2>Funcionários e permissões</h2><p>Cadastre integrantes por e-mail, defina seu cargo e controle os módulos que cada pessoa pode acessar. Os convites são enviados somente depois de ativar o backend.</p></div><button class="btn" data-action="new-member">+ Cadastrar funcionário</button></section>
 <div class="cards staff-metrics"><div class="card"><span>Funcionários cadastrados</span><strong>${members.length}</strong></div><div class="card"><span>Acessos ativos</span><strong>${enabled}</strong></div><div class="card"><span>Sem acesso</span><strong>${members.length-enabled}</strong></div><div class="card"><span>Administrador</span><strong>${members.filter(m=>m.role==='admin'&&m.active).length}</strong></div></div>
 <section class="panel"><div class="section-heading"><div><span class="eyebrow">CONTROLE DE ACESSO</span><h2>Equipe cadastrada</h2></div><span class="tag">Somente administrador</span></div>
 <div class="tablewrap"><table class="staff-table"><thead><tr><th>Funcionário</th><th>E-mail</th><th>Cargo</th><th>Módulos autorizados</th><th>Situação</th><th></th></tr></thead><tbody>${members.map(m=>`<tr><td><strong>${esc(m.full_name)}</strong></td><td>${esc(m.email||'E-mail não vinculado')}</td><td><span class="tag">${esc(displayRole(m.role))}</span></td><td>${m.role==='admin'?'Todos':(Array.isArray(m.permissions)?m.permissions:rolePresets[m.role]||[]).filter(p=>p.endsWith('.view')||p.endsWith('.use')).length} módulos</td><td><span class="staff-status ${m.active?'enabled':'disabled'}">${m.active?'Ativo':'Inativo'}</span></td><td><button type="button" class="btn ghost" data-action="edit-member" data-id="${esc(m.user_id)}">Configurar</button></td></tr>`).join('')||'<tr><td colspan="6">Nenhum funcionário cadastrado.</td></tr>'}</tbody></table></div></section>
 <section class="panel permission-help"><h2>Como funcionam as permissões</h2><div class="permission-help-grid"><div><strong>Visualizar</strong><p>Permite consultar informações do módulo. Não permite cadastrar, editar ou excluir dados.</p></div><div><strong>Editar e executar</strong><p>Autoriza as ações selecionadas. A permissão precisa ser confirmada pelo servidor e pelo banco.</p></div><div><strong>Administrador</strong><p>Controla os funcionários e pode configurar suas permissões. Não é possível alterar o próprio acesso por esta tela.</p></div></div></section>${r18DemoAllowed()?r18DemoStaffPanel():''}`;
}
function memberModal(m){
 const editing=!!m;
 const role=m?.role||'vendedor';
 const permissions=Array.isArray(m?.permissions)?m.permissions:rolePresets[role]||[];
 const groups=permissionGroups.map(g=>`<fieldset class="permission-group"><legend>${esc(g.title)}</legend><div class="permission-grid">${g.items.map(([key,label])=>`<label class="permission-option"><input type="checkbox" name="permissions" value="${key}" ${permissions.includes(key)?'checked':''} ${role==='admin'?'disabled':''}><span>${esc(label)}</span></label>`).join('')}</div></fieldset>`).join('');
 return wrapModal(editing?'Configurar funcionário':'Cadastrar funcionário',`<form id="member-form" class="staff-form"><input type="hidden" name="user_id" value="${esc(m?.user_id||'')}"><div class="grid2"><label>Nome completo<input name="full_name" maxlength="120" minlength="2" required value="${esc(m?.full_name||'')}"></label><label>E-mail de acesso<input type="email" name="email" autocomplete="off" maxlength="254" ${editing?'readonly':''} required value="${esc(m?.email||'')}"></label><label>Cargo<select name="role" id="member-role"><option value="admin" ${role==='admin'?'selected':''}>Administrador</option><option value="gestor" ${role==='gestor'?'selected':''}>Gestor</option><option value="vendedor" ${role==='vendedor'?'selected':''}>Vendedor</option><option value="marketing" ${role==='marketing'?'selected':''}>Marketing</option></select></label><label>Telefone (opcional)<input name="phone" maxlength="35" value="${esc(m?.phone||'')}"></label></div><label class="staff-activation"><input type="checkbox" name="active" ${!editing||m.active?'checked':''}> Acesso ativo</label><div class="permission-heading"><h3>O que esta pessoa pode acessar?</h3><button type="button" class="btn ghost" data-action="member-select-none">Desmarcar tudo</button></div>${groups}<p class="notice">${editing?'As mudanças exigem confirmação e passarão a valer depois de salvas no backend.':'Um convite de acesso será enviado ao e-mail informado quando o serviço estiver configurado.'}</p><footer><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn" type="submit">${editing?'Salvar permissões':'Cadastrar e convidar'}</button></footer></form>`);
}

function normalizeNotificationPhone(v){
 let digits=String(v||'').replace(/\D/g,'');
 if(!String(v||'').trim().startsWith('+')&&(digits.length===10||digits.length===11))digits='55'+digits;
 if(!/^[1-9]\d{10,14}$/.test(digits))throw Error('Informe telefone internacional, por exemplo +5582999999999');
 return '+'+digits;
}
function notificationSettingsPage(){
 if(member?.role!=='admin')return '';
 const active=notificationContacts.filter(c=>c.active);
 const director=active.filter(c=>c.receive_director_report);
 return `<section class="panel dash-contacts"><div class="section-heading"><div><span class="eyebrow">SECRETÁRIA IA · CONTATOS AUTORIZADOS</span><h2>Destinatários dos avisos e da diretoria</h2><p class="muted">Cadastre telefones e escolha o tipo de comunicado que cada contato poderá receber. Lista privada, administrada somente por quem tem perfil admin.</p></div><button type="button" class="btn" data-action="new-notification-contact">+ Adicionar número</button></div>
 <div class="dash-contact-metrics"><span><b>${active.length}</b> contatos ativos</span><span><b>${director.length}</b> destinados à diretoria</span><span><b>${active.filter(c=>c.consent_confirmed).length}</b> com autorização registrada</span></div>
 <div class="tablewrap"><table class="dash-contact-table"><thead><tr><th>Contato</th><th>Telefone</th><th>Avisos de reunião</th><th>Alterações</th><th>Relatório à diretoria</th><th>Autorização</th><th></th></tr></thead><tbody>${notificationContacts.map(c=>`<tr><td><b>${esc(c.full_name)}</b><small class="muted" style="display:block">${c.active?'Ativo':'Inativo'}</small></td><td>${esc(c.phone_e164)}</td><td>${c.notify_meetings?'Sim':'—'}</td><td>${c.notify_changes?'Sim':'—'}</td><td>${c.receive_director_report?'Sim':'—'}</td><td>${c.consent_confirmed?'Confirmada':'Pendente'}</td><td><button type="button" class="btn ghost" data-action="edit-notification-contact" data-id="${esc(c.id)}">Editar</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">Nenhum destinatário cadastrado.</td></tr>'}</tbody></table></div>
 <p class="notice">O cadastro e as preferências já ficam salvos no Supabase. O envio de WhatsApp, e-mail e relatórios automáticos permanece desativado até configurarmos o provedor, o agendamento e os testes com consentimento. O relatório pode ser gerado manualmente no Dashboard.</p></section>`;
}
function notificationContactModal(c){
 if(member?.role!=='admin')return '';
 return wrapModal(c?'Editar destinatário':'Cadastrar destinatário',`<form id="notification-contact-form"><input type="hidden" name="id" value="${esc(c?.id||'')}"><div class="grid2"><label>Nome / destinatário<input name="full_name" minlength="2" maxlength="120" required value="${esc(c?.full_name||'')}"></label><label>WhatsApp com DDI<input name="phone_e164" type="tel" maxlength="21" required placeholder="+5582999999999" value="${esc(c?.phone_e164||'')}"></label></div><fieldset class="permission-group"><legend>Tipos de comunicado</legend><label class="dash-check"><input type="checkbox" name="notify_meetings" ${c?.notify_meetings??true?'checked':''}> Avisar sobre novos agendamentos</label><label class="dash-check"><input type="checkbox" name="notify_changes" ${c?.notify_changes??true?'checked':''}> Avisar sobre mudanças de agendamento</label><label class="dash-check"><input type="checkbox" name="receive_director_report" ${c?.receive_director_report?'checked':''}> Receber relatório executivo da diretoria</label></fieldset><label class="dash-check"><input type="checkbox" name="consent_confirmed" ${c?.consent_confirmed?'checked':''}> Confirmo que este contato autorizou o recebimento dos comunicados</label><label class="dash-check"><input type="checkbox" name="active" ${c?.active??true?'checked':''}> Contato ativo</label><p class="notice">Salvar este registro não envia mensagens. A Secretária IA só poderá disparar avisos após ativação e homologação do provedor de mensagens.</p><footer><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn" type="submit">Salvar contato</button></footer></form>`);
}
function reportDirector(){
 const m=dashMetrics(),out=[];
 const row=(a,b)=>out.push(`<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`);
 row('Leads carregados',leads.length);row('Novos (30 dias)',m.in30.length);row('Oportunidades abertas',m.opened.length);row('Ganhos',m.won.length);row('Perdidos',m.lost.length);row('Taxa de conversão',m.winRate===null?'Sem base de decisões':m.winRate+'%');row('Potencial do funil',money(m.estimated(m.opened)));row('Valor dos ganhos',money(m.estimated(m.won)));row('Tarefas concluídas',m.completed.length);row('Tarefas pendentes',m.pending.length);row('Atrasadas',m.overdue.length);row('Reuniões futuras',m.upcoming.length);row('Interações carregadas',interactions.length);row('Leads sem responsável',m.unassigned.length);
 const stagesRows=stages.map(z=>{const ls=leads.filter(l=>l.stage_id===z.id);return `<tr><td>${esc(z.name)}</td><td>${ls.length}</td><td>${esc(money(m.estimated(ls)))}</td></tr>`}).join('');
 const teamRows=members.filter(z=>z.active).map(z=>{const ls=leads.filter(l=>l.assigned_to===z.user_id);return `<tr><td>${esc(z.full_name)}</td><td>${ls.length}</td><td>${ls.filter(l=>stage(l.stage_id).kind==='won').length}</td></tr>`}).join('');
 const origins=Object.entries(leads.reduce((o,l)=>{const key=String(l.source||'Não informada');o[key]=(o[key]||0)+1;return o},{})).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(k.replaceAll('_',' '))}</td><td>${v}</td></tr>`).join('');
 const urgent=m.overdue.slice(0,20).map(t=>`<li>${esc(t.title)} · ${esc(teammate(t.assigned_to))} · ${date(t.due_at)}</li>`).join('')||'<li>Sem tarefas atrasadas.</li>';
 const d=new Date().toLocaleDateString('pt-BR');
 const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>FCAP Jr. - Relatório de gestão - ${esc(d)}</title><style>body{font:15px/1.5 Arial,sans-serif;margin:0 auto;padding:42px;max-width:960px;color:#132238}h1{font-size:27px;margin-bottom:5px}h2{margin-top:30px;border-bottom:2px solid #e2e8f0;padding-bottom:8px}p{color:#52617a}table{width:100%;border-collapse:collapse;margin:15px 0}td,th{text-align:left;padding:10px 12px;border-bottom:1px solid #dfe5ee}th{background:#f7f9fc}small{color:#6f7f91}button{padding:10px 16px;border:0;background:#245ed2;color:white;border-radius:6px}@media print{button{display:none}body{padding:0}}</style></head><body><h1>FCAP Jr. · Relatório executivo</h1><p>Emissão: ${esc(new Date().toLocaleString('pt-BR'))} · Responsável: ${esc(member.full_name)}</p><button onclick="print()">Imprimir ou salvar em PDF</button>${leads.some(isDemoLead)||meetings.some(m=>m.__demo)?"<div style=\"border:2px solid #c48a27;padding:16px;background:#fff7e0;margin:20px 0;color:#6c4e0a\"><strong>DEMONSTRAÇÃO: este relatório contém clientes, reuniões e tarefas fictícios. Não utilizar para decisões ou prestação de contas.</strong></div>":""}<h2>Indicadores consolidados</h2><table>${out.join('')}</table><h2>Etapas comerciais</h2><table><tr><th>Etapa</th><th>Leads</th><th>Valor estimado</th></tr>${stagesRows}</table><h2>Resultados por integrante</h2><table><tr><th>Integrante</th><th>Leads</th><th>Ganhos</th></tr>${teamRows}</table><h2>Origens</h2><table><tr><th>Origem</th><th>Leads</th></tr>${origins}</table><h2>Pontos que precisam de atenção</h2><ul>${urgent}</ul><p><small>Dados visíveis ao perfil, sujeitos aos limites da consulta do CRM (1.000 leads, 500 tarefas, 500 reuniões, 750 interações). Valores em reais são estimativas, não faturamento. Documento gerado para compartilhamento manual pela diretoria. Nenhuma mensagem foi enviada automaticamente.</small></p></body></html>`;
 const blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='FCAPJR_RELATORIO_DIRETORIA_'+new Date().toISOString().slice(0,10)+'.html';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function integrationsPage(){const cfg=appSettings();const sellers=members.filter(m=>m.active&&m.role==='vendedor');const current=member?.user_id;const eligible=sellers.filter(m=>(m.permissions||rolePresets.vendedor).includes('leads.edit'));return `${notificationSettingsPage()}<div class="settings-grid"><section class="panel"><span class="eyebrow">DISTRIBUIÇÃO COMERCIAL</span><h2>Sorteio automático de leads</h2><p class="muted">Leads do site e das redes sociais são distribuídos entre vendedores ativos. O sistema escolhe quem recebeu menos leads automáticos e sorteia entre vendedores empatados. Leads cadastrados manualmente mantêm o responsável escolhido.</p><div class="seller-roster">${eligible.map(m=>`<div class="seller-row"><span><strong>${esc(m.full_name)}</strong><small>${esc(m.email||'Sem e-mail')}</small></span><span class="tag">${leads.filter(l=>l.assigned_to===m.user_id&&isInbound(l.source)).length} leads automáticos</span></div>`).join('')||'<div class="notice">Não há vendedores ativos habilitados. Novos leads externos ficarão pendentes de atribuição.</div>'}</div>${window.__FCAP_PREVIEW_R9__?`<div class="flex" style="margin:12px 0 2px"><button type="button" class="btn secondary" data-action="demo-inbound-site">Simular lead do site</button><button type="button" class="btn secondary" data-action="demo-inbound-social">Simular lead das redes</button></div><small class="muted">Demonstração: os novos leads ficam apenas na memória desta aba.</small>`:''}<hr><span class="eyebrow">GOOGLE AGENDA</span><h2>Agenda corporativa centralizada</h2><p class="muted">A FCAP utiliza uma única agenda corporativa. Cada compromisso terá o responsável associado ao usuário do vendedor ou diretor. A integração real será configurada em uma etapa posterior.</p><div class="seller-roster">${sellers.map(m=>`<div class="seller-row"><span><strong>${esc(m.full_name)}</strong><small>${esc(m.email||'Sem e-mail')}</small></span><span class="tag ${m.user_id===current&&cfg.calendarConnected?'won':''}">${m.user_id===current&&cfg.calendarConnected?'Conexão simulada':'Integração corporativa pendente'}</span></div>`).join('')||'<p class="empty">Cadastre vendedores em Funcionários e permissões.</p>'}</div><div class="settings-actions"><button type="button" class="btn secondary" disabled>Conexão com agenda corporativa · em preparação</button></div><p class="muted">Esta tela não ativa o Google Agenda. O modelo definitivo terá uma única conta ou agenda corporativa autorizada pela FCAP.</p><hr><form id="settings-form"><span class="eyebrow">SECRETÁRIA IA</span><h2>Perfil da secretária</h2><div class="grid2"><label>Nome exibido da secretária<input name="secretary_name" value="${esc(cfg.secretaryName)}" placeholder="Ex.: Clara"></label><label>Nome exibido no WhatsApp<input name="secretary_whatsapp" value="${esc(cfg.secretaryWhatsapp)}" placeholder="Ex.: Clara | FCAP Jr."></label></div><div class="grid2"><label>Foto da secretária (prévia local)<input type="file" name="secretary_photo" accept="image/png,image/jpeg,image/webp"></label><div class="secretary-photo-preview">${cfg.secretaryPhoto?`<img src="${esc(cfg.secretaryPhoto)}" alt="Foto da secretária">`:`<div class="avatar secretary-avatar-placeholder">${esc((cfg.secretaryName||'SC').trim().slice(0,2).toUpperCase())}</div>`}<small class="muted">Prévia visual, sem atualização de perfil no WhatsApp.</small></div></div><hr><span class="eyebrow">IA</span><h2>Configuração da IA</h2><div class="grid2"><label>Provedor / stack<input name="ai_provider" value="${esc(cfg.aiProvider)}" placeholder="Ex.: OpenAI + Edge Function"></label><label>Nome do assistente<input name="ai_assistant" value="${esc(cfg.aiAssistant)}" placeholder="Ex.: Secretária Comercial FCAP"></label><label>Webhook / endpoint da IA<input name="ai_webhook" value="${esc(cfg.aiWebhook)}" placeholder="https://..."></label><label>Estado da integração<input value="${cfg.calendarConnected?'Simulado na prévia':'Google pendente'}" disabled></label></div><label>Prompt-base da secretária<textarea name="ai_prompt">${esc(cfg.aiPrompt)}</textarea></label><footer class="settings-footer"><button class="btn" type="submit">Salvar configurações da prévia</button></footer></form></section><section class="panel"><h2>Resumo operacional</h2><div class="settings-summary"><div><span class="muted">Vendedores elegíveis</span><strong>${eligible.length}</strong><small>Distribuição automática por menor carga com sorteio no empate</small></div><div><span class="muted">Google Agenda</span><strong>${cfg.calendarConnected?'Prévia local da agenda corporativa':'Agenda corporativa única · pendente'}</strong><small>Confirmação real pendente</small></div><div><span class="muted">Secretária</span><strong>${esc(cfg.secretaryName||'Não definida')}</strong><small>${esc(cfg.secretaryWhatsapp||'Sem nome no WhatsApp')}</small></div><div><span class="muted">IA</span><strong>${esc(cfg.aiProvider||'Não definida')}</strong><small>${esc(cfg.aiAssistant||'Assistente não definido')}</small></div></div><div class="panel inner-panel"><h2>Próximos eventos espelhados</h2>${calendarMirrorItems().map(c=>`<div class="statline"><span><b>${esc(c.summary||'Sem título')}</b><small class="muted" style="display:block">${date(c.start?.dateTime||c.start?.date||'')}</small></span></div>`).join('')||'<p class="empty">Sem eventos para mostrar.</p>'}</div></section></div>`}

function modalHTML(){if(modal.type==='stage')return wrapModal('Criar coluna',`<form id="stage-form"><label>Nome da etapa<input name="name" required minlength="2" maxlength="70" placeholder="Ex.: Negociação"></label><label>Tipo de etapa<select name="kind"><option value="open">Em andamento</option><option value="won">Negócio ganho</option><option value="lost">Negócio perdido</option></select></label><p class="muted">A nova coluna aparecerá no final do funil.</p><footer><button class="btn ghost" data-action="close-modal" type="button">Cancelar</button><button class="btn" type="submit">Criar etapa</button></footer></form>`);if(modal.type==='r18-event')return wrapModal('Detalhes do compromisso',r18CalDetail(modal.item));if(modal.type==='lead')return leadModal(modal.item);if(modal.type==='article')return articleModal(modal.item);if(modal.type==='task')return taskModal();if(modal.type==='meeting')return meetingModal(modal.item);if(modal.type==='notification-contact')return notificationContactModal(modal.item);if(modal.type==='member')return memberModal(modal.item);return ''}
function wrapModal(title,body){
 if(title==='Detalhes da oportunidade'&&modal?.type==='lead'&&modal.item){
  const l=modal.item,thread=waThreads.find(t=>t.lead_id===l.id),owner=thread?waOwner(thread,l):waLeadOwner(l);
  return `<div class="modalback"><div class="modal r19-lead-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
   <header class="r19-lead-head"><div><span class="eyebrow">COMERCIAL / OPORTUNIDADE</span><h2>${esc(l.company_name)}</h2><small>${esc(l.contact_name||'Sem contato')} · ${esc(stage(l.stage_id).name)} ${isDemoLead(l)?'· CLIENTE FICTÍCIO':''}</small></div><button class="btn ghost" type="button" data-action="close-modal">✕ Fechar</button></header>
   <input class="r19-tab-radio" type="radio" id="r19-tab-data" name="r19-lead-tab" checked>
   <input class="r19-tab-radio" type="radio" id="r19-tab-chat" name="r19-lead-tab">
   <nav class="r19-lead-tabs" aria-label="Seções da oportunidade"><label for="r19-tab-data">Dados do cliente</label><label for="r19-tab-chat">WhatsApp ${thread?'· 1 conversa':''}</label></nav>
   <section class="r19-lead-pane r19-lead-data" aria-label="Dados cadastrais e histórico de atendimento">${body}</section>
   <section class="r19-lead-pane r19-lead-chat" aria-label="Histórico da conversa do WhatsApp"><div class="r19-lead-chat-head"><div><span class="eyebrow">WHATSAPP CORPORATIVO</span><h3>${esc(l.contact_name||l.company_name)}</h3><p>${esc(l.company_name)} · Responsável: ${esc(owner)}</p></div>${thread?.is_demo?'<span class="r18-demo-badge">CONVERSA FICTÍCIA</span>':''}</div><div class="r19-lead-chat-messages">${thread?waMessageHTML(thread):'<p class="empty">Este cliente ainda não possui conversa vinculada ao WhatsApp corporativo.</p>'}</div><footer class="r19-lead-chat-foot"><span>${thread?'Somente leitura; nenhuma mensagem real foi enviada nesta demonstração.':'A integração do WhatsApp será configurada posteriormente.'}</span><button type="button" class="btn secondary" data-action="open-whatsapp" data-id="${esc(l.id)}" ${thread?'':'disabled'}>Abrir na central WhatsApp</button></footer></section>
  </div></div>`;
 }
 return `<div class="modalback"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="flex space"><h2>${esc(title)}</h2><button class="btn ghost" data-action="close-modal">✕ Fechar</button></div>${body}</div></div>`;
}
function cleanUrl(value){try{const url=new URL(String(value||''));return url.protocol==='https:'?url.href:''}catch{return ''}}
function linkField(url,label){const href=cleanUrl(url);return href?`<a target="_blank" rel="noopener noreferrer" href="${esc(href)}">${esc(label)} ↗</a>`:''}
function leadAiPanel(l){if(!l||!has('analyst.use'))return '';const items=analyses.filter(a=>a.lead_id===l.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));const a=items[0];const result=a?`<div class="analysis-results"><div class="analysis-score"><strong>${Number(a.score)||0}<small>/100</small></strong><span>Potencial estimado para abordagem</span><span class="tag">${esc(a.interest||'indeterminado')}</span><span class="tag">${Number(a.score)>=75?'Quente':Number(a.score)>=45?'Morno':'Frio'} para primeiro contato</span></div><div class="analysis-summary"><h4>Diagnóstico</h4><p>${esc(a.executive_summary||'Sem resumo')}</p><h4>Primeira mensagem sugerida</h4><blockquote>${esc(a.first_message||'Ainda não disponível. Gere uma nova análise.')}</blockquote><button type="button" class="btn secondary" data-action="copy-first-message" data-id="${esc(l.id)}" ${a.first_message?'':'disabled'}>Copiar mensagem</button><h4>Atendimento comercial</h4><p>${esc(a.service_quality||'Sem informações suficientes para avaliar o atendimento.')}</p><h4>Próximo passo</h4><p>${esc(a.next_action||'Validar necessidades')}</p>${a.risks?`<h4>Pontos de atenção</h4><p>${esc(a.risks)}</p>`:''}${Array.isArray(a.research_sources)&&a.research_sources.length?`<h4>Fontes públicas consultadas ou indicadas</h4><ul>${a.research_sources.map(url=>`<li>${linkField(url,url)}</li>`).join('')}</ul>`:'<p class="muted">Nenhuma fonte pública verificável registrada nesta análise.</p>'}<small class="muted">Estimativa assistida por IA. Revise as fontes antes de abordar.</small></div></div>`:'<p class="muted">Ainda não há diagnóstico. A IA pode pesquisar fontes públicas da empresa e analisar o histórico de atendimento.</p>';return `<section class="lead-analysis"><div class="flex space"><div><span class="eyebrow">INTELIGÊNCIA COMERCIAL</span><h3>IA Analítica deste lead</h3><p class="muted">Site, Instagram, LinkedIn, TikTok, histórico e recomendação de primeiro contato.</p></div><button class="btn" data-action="analyse-lead" data-id="${esc(l.id)}">${a?'Atualizar diagnóstico':'Pesquisar e analisar'}</button></div>${aiMessage?`<div class="notice">${esc(aiMessage)}</div>`:''}${result}</section>`}
function leadModal(l){return wrapModal(l?'Detalhes da oportunidade':'Cadastrar lead',`<form id="lead-form"><input type="hidden" name="id" value="${esc(l?.id||'')}"><div class="grid2"><label>Empresa *<input name="company_name" required minlength="2" maxlength="180" value="${esc(l?.company_name||'')}"></label><label>Nome do contato<input name="contact_name" maxlength="120" value="${esc(l?.contact_name||'')}"></label><label>Telefone / WhatsApp<input name="phone" maxlength="40" value="${esc(l?.phone||'')}"></label><label>E-mail<input name="email" type="email" maxlength="180" value="${esc(l?.email||'')}"></label><label>Setor<input name="segment" maxlength="140" value="${esc(l?.segment||'')}"></label><label>Cargo<input name="role_title" maxlength="120" value="${esc(l?.role_title||'')}"></label><label>Etapa<select name="stage_id" required>${stageOpts(l?.stage_id||stages[0]?.id)}</select></label><label>Responsável<select name="assigned_to">${teamOpts(l?.assigned_to)}</select></label><label>Prioridade<select name="priority">${['baixa','media','alta'].map(v=>`<option ${l?.priority===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Temperatura<select name="temperature">${['frio','morno','quente'].map(v=>`<option ${l?.temperature===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Valor estimado (R$)<input type="number" min="0" step="0.01" name="estimated_value" value="${Number(l?.estimated_value||0)}"></label><label>Origem<input name="source" value="${esc(l?.source||'manual')}"></label></div><h3>Presença digital da empresa</h3><div class="grid2"><label>Site oficial<input type="url" name="website_url" placeholder="https://..." value="${esc(l?.website_url||'')}"></label><label>Instagram<input type="url" name="instagram_url" placeholder="https://www.instagram.com/..." value="${esc(l?.instagram_url||'')}"></label><label>LinkedIn<input type="url" name="linkedin_url" placeholder="https://www.linkedin.com/company/..." value="${esc(l?.linkedin_url||'')}"></label><label>TikTok<input type="url" name="tiktok_url" placeholder="https://www.tiktok.com/@..." value="${esc(l?.tiktok_url||'')}"></label></div><label>Necessidade / dor do cliente<textarea name="need">${esc(l?.need||'')}</textarea></label><label>Observações<textarea name="notes">${esc(l?.notes||'')}</textarea></label>${l&&waThreads.some(w=>w.lead_id===l.id)?`<div class="r17-wa-lead-cta"><span>Conversa vinculada ao WhatsApp corporativo</span><button class="btn secondary" type="button" data-action="open-whatsapp" data-id="${esc(l.id)}">Abrir conversa</button></div>`:''}<footer><button type="button" class="btn ghost" data-action="close-modal">Cancelar</button><button class="btn" type="submit" ${has('leads.edit')?'':'disabled'}>Salvar oportunidade</button></footer></form>${l?`${leadAiPanel(l)}<section class="lead-history"><h3>Histórico de atendimento</h3><form id="interaction-form"><input type="hidden" name="lead_id" value="${esc(l.id)}"><div class="grid2"><label>Tipo<select name="kind"><option>nota</option><option>ligacao</option><option>whatsapp</option><option>reuniao</option></select></label><label>Resumo<input name="body" required maxlength="5000"></label></div><button class="btn secondary" ${has('leads.edit')?'':'disabled'}>Adicionar ao histórico</button></form><div id="history-list"><p class="muted">Carregando histórico...</p></div></section>`:''}`)}
function taskModal(){return wrapModal('Nova tarefa',`<form id="task-form"><label>Descrição<input name="title" required minlength="2"></label><label>Responsável<select name="assigned_to" required>${teamOpts(member.user_id)}</select></label><label>Lead relacionado<select name="lead_id">${opts(leads,'id','company_name')}</select></label><label>Prazo<input name="due_at" type="datetime-local" required></label><p class="muted">Depois da conexão com o Google Agenda, a secretária IA poderá usar esta tarefa para lembretes e organização.</p><button class="btn">Salvar tarefa</button></form>`)}
function meetingModal(m){return wrapModal(m?'Editar agendamento':'Nova reunião',`<form id="meeting-form"><input type="hidden" name="id" value="${esc(m?.id||'')}"><label>Assunto<input name="title" required minlength="3" maxlength="160" value="${esc(m?.title||'')}"></label><label>Lead<select name="lead_id">${opts(leads,'id','company_name',m?.lead_id)}</select></label><label>Responsável<select name="assigned_to" required>${teamOpts(m?.assigned_to||member.user_id)}</select></label><div class="grid2"><label>Início<input name="start_at" type="datetime-local" value="${esc(isoLocal(m?.start_at))}" required></label><label>Fim<input name="end_at" type="datetime-local" value="${esc(isoLocal(m?.end_at))}" required></label></div><label>Observações<textarea name="notes" maxlength="3000">${esc(m?.notes||'')}</textarea></label><p class="muted">${m?'Ao salvar, a alteração fica registrada no CRM e gera avisos internos para a equipe responsável. O envio externo exige integração ativada.':'A reunião será criada como solicitada e poderá ser confirmada no Google Agenda após a integração.'} Horários exibidos no fuso do seu navegador.</p><footer><button type="button" class="btn ghost" data-action="close-modal">Cancelar</button><button class="btn" type="submit">${m?'Salvar agendamento':'Criar reunião'}</button></footer></form>`)}
function articleModal(a){return wrapModal(a?'Editar artigo':'Novo artigo',`<form id="article-form"><input type="hidden" name="id" value="${esc(a?.id||'')}"><label>Título<input name="title" required minlength="5" maxlength="200" value="${esc(a?.title||'')}"></label><label>URL do artigo (slug)<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value="${esc(a?.slug||'')}"></label><div class="grid2"><label>Categoria<input name="category" maxlength="90" value="${esc(a?.category||'Gestão')}"></label><label>URL HTTPS da capa<input name="cover_url" type="url" value="${esc(a?.cover_url||'')}"></label></div><label>Enviar nova imagem de capa (JPG, PNG ou WEBP até 5 MB)<input type="file" name="cover_file" accept="image/jpeg,image/png,image/webp"></label><label>Tags SEO (separadas por vírgula)<input name="seo_tags" maxlength="450" placeholder="consultoria empresarial, gestão, Recife" value="${esc((a?.seo_tags||[]).join(', '))}"></label><small class="muted">Use termos relevantes para o artigo. Tags não garantem posição no Google.</small><label>Resumo / chamada<textarea name="excerpt" rows="3" maxlength="700">${esc(a?.excerpt||'')}</textarea></label><label>Texto do artigo (separe parágrafos com uma linha vazia)<textarea name="body" required style="min-height:240px">${esc(a?.body||'')}</textarea></label><label>Status<select name="status"><option value="rascunho" ${a?.status!=='publicado'?'selected':''}>Rascunho</option><option value="publicado" ${a?.status==='publicado'?'selected':''}>Publicado</option></select></label><footer><button type="button" class="btn ghost" data-action="close-modal">Cancelar</button><button class="btn">Salvar artigo</button></footer></form>`)}
async function moveLeadToStage(leadId,stageId){if(!has('leads.edit'))throw Error('Sem permissão de edição');const lead=leadById(leadId);if(!lead||!stages.some(s=>s.id===stageId))throw Error('Lead ou etapa inválidos');if(lead.stage_id===stageId)return;if(window.__FCAP_PREVIEW_R9__){lead.stage_id=stageId;render();toast('Prévia: lead movido apenas na memória');return}const {error}=await supabase.from('fcap_leads').update({stage_id:stageId}).eq('id',leadId);if(error)throw error;lead.stage_id=stageId;render();toast('Lead movido para '+stage(stageId).name)}

// FCAPJR_R20R2_PIPELINE_SCROLL_PROOF - rolagem vertical independente + horizontal acessivel no topo.
let r20r2PipelineScrollLeft=0;
const r20r2ColumnScroll=new Map();
let r20r2ResizeObserver=null;
function wirePipelineNavigation(){
 if(r20r2ResizeObserver){r20r2ResizeObserver.disconnect();r20r2ResizeObserver=null;}
 const board=root.querySelectorAll('#r20r2-kanban')[0];
 const track=root.querySelectorAll('#r20r2-top-scroll')[0];
 const spacer=root.querySelectorAll('#r20r2-top-width')[0];
 if(!board||!track||!spacer)return;
 function syncWidth(){
  spacer.style.width=Math.max(board.scrollWidth,board.clientWidth)+'px';
  track.classList.toggle('r20r2-no-overflow',board.scrollWidth<=board.clientWidth+2);
 }
 syncWidth();
 board.scrollLeft=r20r2PipelineScrollLeft;
 track.scrollLeft=board.scrollLeft;
 board.addEventListener('scroll',()=>{
  r20r2PipelineScrollLeft=board.scrollLeft;
  if(Math.abs(track.scrollLeft-board.scrollLeft)>1)track.scrollLeft=board.scrollLeft;
 },{passive:true});
 track.addEventListener('scroll',()=>{
  if(Math.abs(board.scrollLeft-track.scrollLeft)>1)board.scrollLeft=track.scrollLeft;
  r20r2PipelineScrollLeft=board.scrollLeft;
 },{passive:true});
 root.querySelectorAll('.kanban .column-cards').forEach(list=>{
  const id=list.closest('[data-drop-stage]')?.dataset.dropStage;
  if(!id)return;
  list.scrollTop=r20r2ColumnScroll.get(id)||0;
  list.addEventListener('scroll',()=>{r20r2ColumnScroll.set(id,list.scrollTop)},{passive:true});
 });
 if(typeof ResizeObserver==='function'){
  r20r2ResizeObserver=new ResizeObserver(syncWidth);
  r20r2ResizeObserver.observe(board);
  board.querySelectorAll('.column').forEach(col=>r20r2ResizeObserver.observe(col));
 }
}
function wireDrag(){if(!has('leads.edit'))return;let draggingId='';root.querySelectorAll('[data-drag-lead]').forEach(card=>{card.addEventListener('dragstart',e=>{draggingId=card.dataset.dragLead;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggingId);card.classList.add('dragging')});card.addEventListener('dragend',()=>{draggingId='';root.querySelectorAll('.column').forEach(x=>x.classList.remove('over'));card.classList.remove('dragging')})});root.querySelectorAll('[data-drop-stage]').forEach(col=>{col.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';col.classList.add('over')});col.addEventListener('dragleave',e=>{if(!col.contains(e.relatedTarget))col.classList.remove('over')});col.addEventListener('drop',async e=>{e.preventDefault();col.classList.remove('over');const id=draggingId||e.dataTransfer.getData('text/plain');try{await moveLeadToStage(id,col.dataset.dropStage)}catch(err){toast(err.message||String(err),true)}})})}
root.addEventListener('change',e=>{if(e.target.id==='r18-calendar-filter'){r18CalendarFilter=e.target.value;render()}if(e.target.id==='r20-palette'){const color=e.target.value;if(!['vivid','soft','deep'].includes(color))return;r20Palette=color;document.documentElement.dataset.fcapPalette=color;try{localStorage.setItem('fcap-r20-palette',color)}catch{}render()}});
root.addEventListener('change',e=>{if(e.target.id==='r17-wa-owner'){waFilters.owner=e.target.value;render()}if(e.target.id==='r17-wa-type'){waFilters.type=e.target.value;render()}});
root.addEventListener('change',async e=>{if(e.target.matches('[data-move-lead]'))try{await moveLeadToStage(e.target.dataset.moveLead,e.target.value)}catch(err){toast(err.message||String(err),true)}});
async function save(table,payload,id){const query=id?supabase.from(table).update(payload).eq('id',id):supabase.from(table).insert(payload);const {error}=await query;if(error)throw error}
async function callEdge(name,body){const {data,error}=await supabase.functions.invoke(name,{body});if(error)throw error;if(data?.error)throw new Error(data.error);return data}
async function history(id){const {data}=await supabase.from('fcap_interactions').select('*').eq('lead_id',id).order('created_at',{ascending:false});const el=document.getElementById('history-list');if(el)el.innerHTML=(data||[]).map(r=>`<div class="statline"><span><b>${esc(r.kind)}</b><small style="display:block">${esc(r.body)}</small></span><small>${date(r.created_at)}</small></div>`).join('')||'<p class="muted">Sem interações registradas.</p>'}
root.addEventListener('click',async e=>{const b=e.target.closest('[data-action],[data-page]');if(!b)return;
 if(b.dataset.page){if(!visible(b.dataset.page))return;page=b.dataset.page;modal=null;if(page==='conversas'){const candidates=conversationCandidates();if(!candidates.some(x=>x.id===conversationLeadId))conversationLeadId=candidates[0]?.id||null;conversationHistoryStatus='loading';conversationHistory=[];}render();if(page==='conversas'&&conversationLeadId)await loadConversationHistory(conversationLeadId);return}
 const action=b.dataset.action,id=b.dataset.id;
 try{
 if(action==='r23-toggle-demo'){if(!r23PreviewAllowed())throw Error('Prévia reservada à diretoria');r23Presentation=!r23Presentation;render();return}
 if(action==='r23-scale-month'){r23TrendScale='month';render();return}
 if(action==='r23-scale-week'){r23TrendScale='week';render();return}
  if(action==='r20r2-pan'){
   const board=root.querySelectorAll('#r20r2-kanban')[0];
   if(!board)return;
   const direction=b.dataset.dir==='left'?-1:1;
   const col=board.querySelectorAll('.column')[0];
   const distance=(col?.getBoundingClientRect()?.width||280)+12;
   const next=Math.max(0,Math.min(board.scrollWidth-board.clientWidth,board.scrollLeft+direction*distance*2));
   board.scrollTo({left:next,behavior:'smooth'});
   return;
  }

  if(action==='r20-mini-date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(b.dataset.day||''))return;r18CalendarAnchor=b.dataset.day;r18CalendarMode='day';render();return}
  if(action==='r20-cal-type'){const v=b.dataset.type;if(!['all','meeting','task'].includes(v))return;r18CalendarFilter=r18CalendarFilter===v?'all':v;render();return}
  if(action==='r20-cal-owner'){const owner=b.dataset.owner;if(owner!=='all'&&!r20CalendarAllOwners().includes(owner))return;r20CalendarOwner=r20CalendarOwner===owner?'all':owner;render();return}
  if(action==='r18-cal-mode'){if(!['day','week','month'].includes(b.dataset.mode))return;r18CalendarMode=b.dataset.mode;render();return}
  if(action==='r18-cal-day'){if(!/^\d{4}-\d{2}-\d{2}$/.test(b.dataset.day||''))return;r18CalendarAnchor=b.dataset.day;r18CalendarMode='day';render();return}
  if(action==='r18-cal-today'){r18CalendarAnchor=r18DateKey();render();return}
  if(action==='r18-cal-prev'||action==='r18-cal-next'){const step=action==='r18-cal-next'?1:-1;if(r18CalendarMode==='month'){const d=new Date(`${r18CalendarAnchor||r18DateKey()}T12:00:00Z`);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+step);r18CalendarAnchor=d.toISOString().slice(0,10)}else{r18CalendarAnchor=r18ShiftDate(r18CalendarAnchor||r18DateKey(),step*(r18CalendarMode==='week'?7:1))}render();return}
  if(action==='r18-cal-event'){if(!['meeting','task'].includes(b.dataset.kind))return;modal={type:'r18-event',item:{id,kind:b.dataset.kind}};render();return}
  if(['edit-meeting','confirm-meeting','take-meeting'].includes(action)&&meetings.find(x=>x.id===id)?.__demo){toast('Reunião fictícia: use a agenda apenas para visualizar. Nenhum evento será enviado.');return}
  if(action==='complete-task'&&tasks.find(x=>x.id===id)?.__demo){toast('Tarefa fictícia: nenhuma alteração foi salva.');return}
if(action==='theme-toggle'){const dark=document.documentElement.dataset.fcapTheme==='dark';document.documentElement.dataset.fcapTheme=dark?'light':'dark';localStorage.setItem('fcap_theme',dark?'light':'dark');return}
 if(action==='demo-inbound-site'||action==='demo-inbound-social'){
  if(!window.__FCAP_PREVIEW_R9__||!manageTeam())throw Error('A simulação é exclusiva da prévia administrativa');
  const channel=action==='demo-inbound-site'?'site_diagnostico':'social_instagram';
  const selected=chooseInboundSeller(members,leads);const id='inbound-demo-'+Date.now();
  leads.unshift({id,company_name:'Lead fictício '+(leads.length+1),contact_name:'Contato demonstrativo',segment:'Serviços',source:channel,stage_id:stages[0]?.id||'st1',assigned_to:selected?.user_id||null,priority:'media',temperature:'morno',estimated_value:0,created_at:new Date().toISOString()});
  render();toast(selected?'Prévia: lead sorteado para '+selected.full_name:'Prévia: sem vendedor elegível. Lead pendente de atribuição.');return
 }
  if(action==='director-report'){if(!has('reports.view')||!['admin','gestor'].includes(member.role))throw Error('Relatório restrito à gestão');reportDirector();toast('Relatório gerado. Abra o arquivo HTML para imprimir ou salvar em PDF.');return}
  if(action==='new-notification-contact'||action==='edit-notification-contact'){
    if(member.role!=='admin')throw Error('Somente administradores gerenciam destinatários');
    const contact=action==='edit-notification-contact'?notificationContacts.find(x=>x.id===id):null;
    if(action==='edit-notification-contact'&&!contact)throw Error('Contato não encontrado');
    modal={type:'notification-contact',item:contact};render();return;
  }
 if(action==='logout'){await supabase.auth.signOut();return}
 if(action==='refresh'){await load();render();if(page==='conversas'&&conversationLeadId)await loadConversationHistory(conversationLeadId);toast('Dados atualizados');return}
 if(action==='close-modal'){modal=null;render();return}
 if(action==='new-member'||action==='edit-member'){if(!manageTeam())throw Error('Apenas administradores podem configurar funcionários');modal={type:'member',item:action==='edit-member'?members.find(m=>m.user_id===id):null};render();return}
 if(action==='member-select-none'){document.querySelectorAll('#member-form input[name=permissions]').forEach(c=>{if(!c.disabled)c.checked=false});return}
  if(action==='new-stage'){if(!stageManager())throw Error('Somente administradores e gestores com permissão de edição podem criar colunas');modal={type:'stage'};render();return}
  if(action==='delete-stage'){if(!stageManager())throw Error('Sem permissão para excluir colunas');const s=stages.find(x=>x.id===id);if(!s)throw Error('Etapa inexistente');if(stages.length<=1)throw Error('Não é permitido excluir a última coluna');if(leads.some(l=>l.stage_id===id))throw Error('Mova os leads desta coluna antes de excluir');if(!confirm('Excluir a coluna "'+s.name+'"? Esta ação não pode ser desfeita.'))return;if(window.__FCAP_PREVIEW_R9__){stages=stages.filter(x=>x.id!==id);render();toast('Prévia: coluna excluída apenas da memória');return}const {error}=await supabase.from('fcap_stages').delete().eq('id',id);if(error)throw error;await load();render();toast('Coluna excluída');return}
  if(action==='copy-first-message'){const a=analyses.filter(x=>x.lead_id===id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];if(!a?.first_message)throw Error('Mensagem indisponível');await navigator.clipboard.writeText(a.first_message);toast('Mensagem copiada');return}
  if(action==='analyse-lead'){if(!has('analyst.use'))throw Error('Sem permissão de IA Analítica');const l=leadById(id);if(!l)throw Error('Lead não encontrado');if(window.__FCAP_PREVIEW_R9__){toast('Prévia offline: análise externa indisponível. Visualize o exemplo abaixo.');return}aiMessage='Pesquisando fontes públicas e avaliando atendimento...';render();const r=await callEdge('fcap-ai',{action:'analyse',leadId:id});aiMessage='Análise concluída: '+Number(r.score||0)+'/100';await load();modal={type:'lead',item:leadById(id)};render();await history(id);return}
  if(action==='new-lead'){if(!has('leads.edit'))throw Error('Sem permissão para editar leads');modal={type:'lead',item:null};render();return}
 if(action==='open-conversation'||action==='select-conversation-lead'){
  if(!has('leads.view'))throw Error('Sem permissão para histórico comercial');
  const target=leadById(id);if(!target)throw Error('Lead não autorizado ou inexistente');
  modal={type:'lead',item:target};render();await history(id);return;
 }
 if(action==='wa-select'){if(!waThreads.some(x=>x.id===id))throw Error('Conversa fora da sua lista');waSelectedId=id;render();return}
 if(action==='wa-refresh'){await loadWhatsApp();render();return}
 if(action==='open-whatsapp'){
  if(!has('leads.view'))throw Error('Sem permissão para visualizar conversas');
  const target=waThreads.find(t=>t.lead_id===id&&leads.some(l=>l.id===id));
  if(!target){toast('Ainda não há conversa do WhatsApp para este lead. A API oficial será conectada depois.',true);return}
  waSelectedId=target.id;waFilters={search:'',owner:'all',type:'all'};modal=null;page='whatsapp';render();return;
 }
 if(action==='view-lead'){modal={type:'lead',item:leadById(id)};render();await history(id);return}
 if(action==='new-task'||action==='new-meeting'){if(!has('agenda.edit'))throw Error('Sem permissão para editar a agenda');modal={type:action==='new-task'?'task':'meeting'};render();return}
  if(action==='edit-meeting'){if(!has('agenda.edit'))throw Error('Sem permissão para editar agendamentos');const target=meetings.find(x=>x.id===id);if(!target)throw Error('Agendamento não encontrado');if(target.google_event_id||target.status!=='solicitada')throw Error('Reunião sincronizada ou confirmada: a edição exige integração com o Google Agenda');if(!['admin','gestor'].includes(member.role)&&target.assigned_to!==member.user_id)throw Error('Agendamento fora da sua agenda');modal={type:'meeting',item:target};render();return}
 if(action==='new-article'||action==='edit-article'){if(!has('blog.edit'))throw Error('Sem permissão para editar o blog');modal={type:'article',item:articles.find(a=>a.id===id)||null};render();return}
 if(action==='complete-task'){if(!has('agenda.edit'))throw Error('Sem permissão para concluir tarefas');const r=await supabase.from('fcap_tasks').update({completed_at:new Date().toISOString()}).eq('id',id);if(r.error)throw r.error;await load();render();return}
 if(action==='mark-alerts'){if(!has('alerts.view'))throw Error('Sem permissão para avisos');const ids=alerts.filter(a=>!a.read_at).map(a=>a.id);if(!ids.length)return;const r=await supabase.from('fcap_alerts').update({read_at:new Date().toISOString()}).in('id',ids);if(r.error)throw r.error;await load();render();return}
 if(action==='export-csv'){if(!canManage())throw Error('Sem permissão');const fields=['company_name','contact_name','email','phone','segment','source','priority','temperature','estimated_value','notes'];const csv=[fields,...leads.map(l=>fields.map(k=>String(l[k]??'')))].map(row=>row.map(cell=>{const safe=/^[\s]*[=+@-]/.test(cell)?'\''+cell:cell;return '"'+safe.replace(/"/g,'""')+'"'}).join(';')).join('\r\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fcapjr-leads.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Exportação iniciada');return}
 if(action==='import-json'){if(!canManage())throw Error('Sem permissão');const file=document.getElementById('leads-import-file')?.files?.[0];if(!file)throw Error('Selecione um arquivo JSON');if(file.size>1024*1024)throw Error('Arquivo deve ter até 1 MB');const list=JSON.parse(await file.text());if(!Array.isArray(list)||list.length>200||list.length===0)throw Error('O JSON deve conter entre 1 e 200 registros');const existing=new Set(leads.map(l=>slugify(l.company_name)));const rows=list.map(x=>({company_name:String(x.company_name||x.empresa||'').trim().slice(0,180),contact_name:String(x.contact_name||x.nome||'').slice(0,120),phone:String(x.phone||x.whatsapp||x.telefone||'').slice(0,40),email:String(x.email||'').slice(0,180),segment:String(x.segment||x.setor||'').slice(0,120),source:'importacao',stage_id:stages[0]?.id,assigned_to:null,notes:String(x.notes||'').slice(0,3000)})).filter(x=>x.company_name.length>=2&&!existing.has(slugify(x.company_name)));if(!rows.length)throw Error('Nenhum lead novo válido');if(!confirm(`Importar ${rows.length} leads? Revise o arquivo e confirme a origem legítima dos contatos.`))return;const {error}=await supabase.from('fcap_leads').insert(rows);if(error)throw error;await load();render();toast(`${rows.length} leads importados`);return}
 if(action==='save-prospect'){if(!has('prospector.use')||!has('leads.edit'))throw Error('Sem permissão para incluir prospecções');const p=prospects[Number(b.dataset.index)];if(!p)return;const normalized=s=>slugify(s);if(leads.some(l=>normalized(l.company_name)===normalized(p.company_name))){toast('Empresa já cadastrada',true);return}const payload={company_name:p.company_name,contact_name:p.decision_maker||'',phone:p.phone||'',email:p.email||'',segment:p.segment||'',need:p.opportunity||'',notes:'Fontes públicas: '+(p.sources||[]).join(', '),stage_id:stages[0]?.id,source:'prospeccao_ia',priority:Number(p.score)>=80?'alta':'media',assigned_to:member.user_id};if(!payload.stage_id)throw Error('Etapas do funil não configuradas');await save('fcap_leads',payload);await load();render();toast('Empresa cadastrada no CRM');return}
 if(action==='connect-google'){if(!has('integrations.manage'))throw Error('Sem permissão para Google Agenda');if(window.__FCAP_PREVIEW_R9__){const cfg=saveAppSettings({calendarConnected:true});calendarItems=calendarMirrorItems().length?calendarMirrorItems():meetings.map(m=>({summary:m.title,start:{dateTime:m.start_at},status:m.status}));render();toast('Prévia: Google Agenda marcado como conectado para demonstração');return}const r=await callEdge('fcap-calendar',{action:'start'});if(!r.url)throw Error('URL de autorização não recebida');window.location.assign(r.url);return}
 if(action==='list-google'){if(!has('integrations.manage'))throw Error('Sem permissão para Google Agenda');if(window.__FCAP_PREVIEW_R9__){calendarItems=meetings.map(m=>({summary:m.title,start:{dateTime:m.start_at},status:m.status}));render();toast('Prévia: espelho do Google Agenda atualizado com eventos de demonstração');return}const r=await callEdge('fcap-calendar',{action:'list'});calendarItems=r.events||[];render();return}
 if(action==='take-meeting'){if(!has('agenda.edit'))throw Error('Sem permissão');const r=await supabase.from('fcap_meetings').update({assigned_to:member.user_id}).eq('id',id).is('assigned_to',null);if(r.error)throw r.error;await load();render();toast('Reunião atribuída a você');return}
 if(action==='confirm-meeting'){if(!has('integrations.manage')||!has('agenda.edit'))throw Error('Sem permissão para confirmar reuniões');if(!confirm('Criar este evento no seu Google Agenda e confirmar a reunião no CRM?'))return;const r=await callEdge('fcap-calendar',{action:'create',meetingId:id});await load();render();toast(r.message||'Reunião confirmada no Google Agenda');return}
 }catch(err){toast(err.message||String(err),true)}});
root.addEventListener('change',e=>{if(e.target.id==='member-role'){const role=e.target.value,preset=rolePresets[role]||[];document.querySelectorAll('#member-form input[name=permissions]').forEach(c=>{c.checked=preset.includes(c.value);c.disabled=role==='admin'});document.querySelector('[data-action=member-select-none]')?.toggleAttribute('disabled',role==='admin')}});
root.addEventListener('change',e=>{
 const id=e.target?.id;
 if(id==='r17-dashboard-period'){dashboardFilters.period=e.target.value;render();return}
 if(id==='r17-dashboard-owner'){dashboardFilters.owner=e.target.value;render();return}
 if(id==='r17-dashboard-source'){dashboardFilters.source=e.target.value;render();return}
 if(id==='r22-trend-months'){dashboardTrendMonths=Math.max(1,Math.min(12,Math.trunc(Number(e.target.value)||6)));render();return}
 if(id==='r23-trend-weeks'){r23TrendWeeks=Math.max(1,Math.min(4,Math.trunc(Number(e.target.value)||4)));render();return}
 if(id==='r22-trend-demo'){dashboardTrendIncludeDemo=!!e.target.checked;render();return}
 if(id==='r17-pipeline-owner'){pipelineFilters.owner=e.target.value;render();return}
 if(id==='r17-pipeline-priority'){pipelineFilters.priority=e.target.value;render();return}
 if(id==='r17-pipeline-stale'){pipelineFilters.stale=e.target.value;render();return}
 if(id==='r17-conversation-owner'){conversationFilters.owner=e.target.value;const found=conversationCandidates();if(!found.some(x=>x.id===conversationLeadId)){conversationLeadId=found[0]?.id||null;conversationHistoryStatus='idle';conversationHistory=[];}render();if(conversationLeadId)loadConversationHistory(conversationLeadId);return}
 if(id==='r17-conversation-activity'){conversationFilters.activity=e.target.value;const found=conversationCandidates();if(!found.some(x=>x.id===conversationLeadId)){conversationLeadId=found[0]?.id||null;conversationHistoryStatus='idle';conversationHistory=[];}render();if(conversationLeadId)loadConversationHistory(conversationLeadId);return}
});
root.addEventListener('input',e=>{
 if(e.target.id==='r17-wa-search'){
  waFilters.search=e.target.value;const pos=e.target.selectionStart;render();const box=document.getElementById('r17-wa-search');if(box){box.focus();try{box.setSelectionRange(pos,pos)}catch{}}return;
 }
 if(e.target.id==='r17-pipeline-search'||e.target.id==='r17-conversation-search'){
  const id=e.target.id,q=e.target.value,at=e.target.selectionStart;
  if(id==='r17-pipeline-search')pipelineFilters.search=q;else conversationFilters.search=q;
  if(id==='r17-conversation-search'){const found=conversationCandidates();if(!found.some(x=>x.id===conversationLeadId)){conversationLeadId=found[0]?.id||null;conversationHistoryStatus='idle';conversationHistory=[];}}render();if(id==='r17-conversation-search'&&conversationLeadId&&conversationHistoryStatus==='idle')loadConversationHistory(conversationLeadId);const restored=document.getElementById(id);if(restored){restored.focus();try{restored.setSelectionRange(at,at)}catch{}}
  return;
 }
 if(e.target.id==='lead-filter'){const q=e.target.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');const rows=leads.filter(l=>[l.company_name,l.contact_name,l.segment].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q));document.getElementById('lead-rows').innerHTML=leadRows(rows)}if(e.target.name==='title'&&e.target.closest('#article-form')){const slug=e.target.closest('form').querySelector('[name=slug]');if(!slug.dataset.edited)slug.value=slugify(e.target.value)}if(e.target.name==='slug')e.target.dataset.edited='1'});
root.addEventListener('submit',async e=>{e.preventDefault();if(loading)return;const f=e.target;const d=Object.fromEntries(new FormData(f));loading=true;const btn=f.querySelector('button[type=submit],button:not([type])');if(btn)btn.disabled=true;
  try{if(f.id==='stage-form'){if(!stageManager())throw Error('Permissão insuficiente');const name=String(d.name||'').trim();if(name.length<2||name.length>70)throw Error('Nome inválido');if(stages.some(s=>s.name.toLowerCase()===name.toLowerCase()))throw Error('Já existe etapa com este nome');if(!['open','won','lost'].includes(d.kind))throw Error('Tipo inválido');if(window.__FCAP_PREVIEW_R9__){stages.push({id:'demo-stage-'+Date.now(),name,kind:d.kind,position:stages.length+1});modal=null;render();toast('Prévia: coluna criada apenas na memória');return}const pos=Math.max(0,...stages.map(x=>Number(x.position)||0))+1;await save('fcap_stages',{name,kind:d.kind,position:pos});modal=null;await load();render();toast('Coluna criada');return}
  if(f.id==='login-form'){const {error}=await supabase.auth.signInWithPassword({email:String(d.email).trim(),password:d.password});if(error)throw Error('Credenciais inválidas');await loginCheck();return}
 if(f.id==='settings-form'){if(!has('integrations.manage'))throw Error('Somente administradores e gestores podem alterar as configurações');if(!window.__FCAP_PREVIEW_R9__)throw Error('Configurações ainda não conectadas ao backend. Aguarde a etapa de integração.');const file=f.querySelector('[name=secretary_photo]')?.files?.[0];let secretaryPhoto=appSettings().secretaryPhoto||'';if(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3*1024*1024)throw Error('Envie uma imagem JPG, PNG ou WEBP de até 3 MB');secretaryPhoto=await readFileAsDataUrl(file)}saveAppSettings({secretaryName:String(d.secretary_name||'').trim(),secretaryWhatsapp:String(d.secretary_whatsapp||'').trim(),aiProvider:String(d.ai_provider||'').trim(),aiAssistant:String(d.ai_assistant||'').trim(),aiWebhook:String(d.ai_webhook||'').trim(),aiPrompt:String(d.ai_prompt||'').trim(),secretaryPhoto});render();toast('Configurações salvas na prévia local');return}
   if(f.id==='notification-contact-form'){
     if(member.role!=='admin')throw Error('Somente administradores podem gerenciar contatos');
     const id=String(d.id||'');
     const payload={full_name:String(d.full_name||'').trim().slice(0,120),phone_e164:normalizeNotificationPhone(d.phone_e164),notify_meetings:!!f.querySelector('[name=notify_meetings]:checked'),notify_changes:!!f.querySelector('[name=notify_changes]:checked'),receive_director_report:!!f.querySelector('[name=receive_director_report]:checked'),consent_confirmed:!!f.querySelector('[name=consent_confirmed]:checked'),active:!!f.querySelector('[name=active]:checked')};
     if(payload.full_name.length<2)throw Error('Informe o nome do destinatário');
     const query=id?supabase.from('fcap_notification_contacts').update(payload).eq('id',id):supabase.from('fcap_notification_contacts').insert({...payload,created_by:member.user_id});
     const {error}=await query;if(error)throw error;
     modal=null;await load();render();toast('Destinatário salvo. Nenhum comunicado externo foi enviado.');return;
   }
 if(f.id==='member-form'){
  if(!manageTeam())throw Error('Somente o administrador pode configurar funcionários');
  const role=String(d.role||'');if(!rolePresets[role])throw Error('Cargo inválido');
  const permissions=[...f.querySelectorAll('input[name="permissions"]:checked')].map(x=>x.value).filter(x=>allPermissions.includes(x));
  const payload={action:d.user_id?'update':'invite',user_id:d.user_id||undefined,full_name:String(d.full_name||'').trim(),email:String(d.email||'').trim().toLowerCase(),phone:String(d.phone||'').trim(),role,active:!!f.querySelector('[name=active]')?.checked,permissions:role==='admin'?allPermissions:permissions};
  if(payload.user_id===member.user_id)throw Error('Para segurança, não altere sua própria conta por este painel');
  await callEdge('fcap-members',payload);
  modal=null;await load();render();toast(payload.action==='invite'?'Funcionário registrado. Confira o envio do convite.':'Permissões atualizadas.');return;
 }
 if(f.id==='lead-form'){if(!has('leads.edit'))throw Error('Sem permissão');const id=d.id||null;delete d.id;d.estimated_value=Number(d.estimated_value||0);d.assigned_to=['admin','gestor'].includes(member.role)?(d.assigned_to||null):member.user_id;await save('fcap_leads',d,id)}
 if(f.id==='task-form'){if(!has('agenda.edit'))throw Error('Sem permissão');d.lead_id=d.lead_id||null;if(!['admin','gestor'].includes(member.role))d.assigned_to=member.user_id;d.due_at=new Date(d.due_at).toISOString();await save('fcap_tasks',d)}
  if(f.id==='meeting-form'){if(!has('agenda.edit'))throw Error('Sem permissão');const meetingId=d.id||null;delete d.id;d.lead_id=d.lead_id||null;if(!['admin','gestor'].includes(member.role))d.assigned_to=member.user_id;d.start_at=new Date(d.start_at).toISOString();d.end_at=new Date(d.end_at).toISOString();if(d.end_at<=d.start_at)throw Error('O horário de término deve ser posterior ao início');if(meetingId){const prev=meetings.find(x=>x.id===meetingId);if(!prev)throw Error('Reunião não encontrada');if(prev.google_event_id||prev.status!=='solicitada')throw Error('Reunião confirmada no Google Agenda exige sincronização antes de alterar');if(!['admin','gestor'].includes(member.role)&&prev.assigned_to!==member.user_id)throw Error('Reunião fora de sua responsabilidade');await save('fcap_meetings',d,meetingId)}else{d.status='solicitada';await save('fcap_meetings',d)}}
 if(f.id==='article-form'){if(!has('blog.edit'))throw Error('Sem permissão');const id=d.id||null;delete d.id;d.seo_tags=[...new Set(String(d.seo_tags||'').split(',').map(x=>x.trim().toLowerCase()).filter(x=>x.length>=2&&x.length<=50))].slice(0,12);const cover=f.querySelector('[name=cover_file]')?.files?.[0];delete d.cover_file;if(cover){if(!['image/jpeg','image/png','image/webp'].includes(cover.type)||cover.size>5*1024*1024)throw Error('Imagem deve ser JPG/PNG/WEBP de até 5 MB');const ext=cover.type==='image/png'?'png':cover.type==='image/webp'?'webp':'jpg';const path=crypto.randomUUID()+'.'+ext;const upload=await supabase.storage.from('fcap-blog').upload(path,cover,{contentType:cover.type,upsert:false});if(upload.error)throw upload.error;d.cover_url=supabase.storage.from('fcap-blog').getPublicUrl(path).data.publicUrl}d.slug=slugify(d.slug);if(d.cover_url&&!/^https:\/\//i.test(d.cover_url))throw Error('A capa deve ter URL HTTPS');d.published_at=d.status==='publicado'?(articles.find(x=>x.id===id)?.published_at||new Date().toISOString()):null;if(!id)d.author_id=member.user_id;await save('fcap_articles',d,id)}
 if(f.id==='r17-conversation-note-form'){
    if(!has('leads.edit'))throw Error('Sem permissão para registrar atendimento');
    if(!leadById(d.lead_id))throw Error('Lead não encontrado ou indisponível');
    const kind=String(d.kind||''),body=String(d.body||'').trim();
    if(!['nota','whatsapp','ligacao','reuniao'].includes(kind)||body.length<3||body.length>5000)throw Error('Informe um tipo válido e um resumo de 3 a 5.000 caracteres');
    if(window.__FCAP_PREVIEW_R9__)throw Error('Registros manuais indisponíveis na prévia local');
    await save('fcap_interactions',{lead_id:d.lead_id,author_id:member.user_id,kind,body});
    await load();render();await loadConversationHistory(d.lead_id);toast('Registro comercial salvo no CRM');return;
   }
   if(f.id==='interaction-form'){if(!has('leads.edit'))throw Error('Sem permissão');d.author_id=member.user_id;await save('fcap_interactions',d);await history(d.lead_id);f.reset();toast('Interação registrada');return}
 if(f.id==='prospector-form'){
  if(!has('prospector.use'))throw Error('Sem permissão');
  const requested=getProspectorQuantity(d.quantity);
  if(requested===null)throw Error('Informe um número inteiro entre 1 e 100 empresas.');
  prospectorLast={term:String(d.term||'').trim(),region:String(d.region||'').trim(),quantity:String(requested)};
  prospects=[];
  searchMessage=`Buscando ${requested} empresa${requested===1?'':'s'} em fontes públicas. Resultados dependem de fontes verificáveis.`;
  render();
  const seen=new Set();
  let rounds=0,withoutNew=0,interrupted='';
  const maxRounds=Math.min(12,Math.ceil(requested/10)+2);
  while(prospects.length<requested && rounds<maxRounds && withoutNew<2){
    const remaining=requested-prospects.length;
    const batch=Math.min(10,remaining);
    rounds++;
    const status=document.getElementById('prospector-status');
    if(status)status.textContent=`Pesquisando... ${prospects.length} de ${requested} empresas identificadas (etapa ${rounds} de até ${maxRounds}).`;
    let response;
    try{
      response=await callEdge('fcap-ai',{
        action:'prospect',term:prospectorLast.term,region:prospectorLast.region,
        quantity:batch,exclude:prospects.map(p=>p.company_name)
      });
    }catch(err){
      if(prospects.length===0)throw err;
      interrupted=err.message||'Serviço indisponível';break;
    }
    const next=Array.isArray(response.companies)?response.companies:[];
    let added=0;
    for(const p of next){
      if(!p || !p.company_name)continue;
      const key=slugify(p.company_name);
      if(!key || seen.has(key))continue;
      seen.add(key);
      prospects.push(p);
      added++;
      if(prospects.length>=requested)break;
    }
    withoutNew=added===0?withoutNew+1:0;
  }
  searchMessage=`Solicitadas: ${requested}. Encontradas: ${prospects.length}. ${interrupted?'Consulta interrompida: '+interrupted+'. ':''}${prospects.length<requested?'Pode haver menos empresas verificáveis ou o limite operacional da consulta foi atingido. ':''}Confira as fontes antes de cadastrar.`;
  render();return;
 }
 if(f.id==='secretary-form'){if(!has('secretary.use'))throw Error('Sem permissão');secretaryQuestion=d.question;secretaryMessage='Consultando dados comerciais...';render();const r=await callEdge('fcap-ai',{action:'secretary',question:d.question});secretaryMessage=r.reply||'Sem resposta';render();return}
 if(f.id==='analyst-form'){if(!has('analyst.use'))throw Error('Sem permissão');aiMessage='Gerando diagnóstico...';render();const r=await callEdge('fcap-ai',{action:'analyse',leadId:d.lead_id});aiMessage=`Análise concluída: score ${r.score}/100`;await load();render();return}
 modal=null;await load();render();toast('Salvo com sucesso');
 }catch(err){toast(err.message||String(err),true);if(f.id==='prospector-form')searchMessage='Erro na pesquisa: '+(err.message||err);if(f.id==='analyst-form')aiMessage='Erro na análise: '+(err.message||err);if(f.id==='secretary-form')secretaryMessage='Erro na consulta: '+(err.message||err);if(['prospector-form','analyst-form','secretary-form'].includes(f.id))render()}
 finally{loading=false;if(btn&&btn.isConnected)btn.disabled=false}});
try{document.documentElement.dataset.fcapTheme=localStorage.getItem('fcap_theme')==='dark'?'dark':'light'}catch{}
init();
