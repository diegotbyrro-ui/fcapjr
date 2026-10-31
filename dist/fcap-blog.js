(async () => {
  'use strict';
  const c=window.FCAP_CONFIG||{};
  if (!c.supabaseUrl || !c.supabaseAnonKey) return;
  const root=document.getElementById('fcap-dynamic-articles');
  const article=document.getElementById('fcap-dynamic-article');
  if(!root&&!article)return;
  let supabase;
  try {
    const m=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm');
    supabase=m.createClient(c.supabaseUrl,c.supabaseAnonKey);
  } catch { if(article)article.textContent='Não foi possível carregar o conteúdo.';return; }
  const imageOK=url=>{try{const u=new URL(url);return ['https:'].includes(u.protocol)?u.href:'';}catch{return ''}};
  if(root){
    const {data,error}=await supabase.from('fcap_articles')
      .select('slug,title,excerpt,category,cover_url,published_at').eq('status','publicado')
      .order('published_at',{ascending:false}).limit(30);
    if(error){console.warn('FCAP blog indisponível');return;}
    for(const item of data||[]){
      const a=document.createElement('a');a.className='article';a.href='artigo.html?slug='+encodeURIComponent(item.slug);
      if(imageOK(item.cover_url)){const img=document.createElement('img');img.className='article-photo';img.loading='lazy';img.alt=item.title;img.src=imageOK(item.cover_url);a.append(img)}
      const category=document.createElement('span');category.className='article-category';category.textContent=item.category||'Gestão';
      const h=document.createElement('h3');h.textContent=item.title;
      const read=document.createElement('span');read.className='read';read.textContent='Leia mais';
      a.append(category,h,read);root.append(a);
    }
    if((data||[]).length)root.parentElement.hidden=false;
  }
  if(article){
    const slug=new URLSearchParams(location.search).get('slug')||'';
    if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)){article.textContent='Artigo não encontrado.';return;}
    const {data,error}=await supabase.from('fcap_articles')
      .select('title,excerpt,body,category,cover_url,published_at,seo_tags')
      .eq('slug',slug).eq('status','publicado').maybeSingle();
    if(error||!data){article.textContent='Artigo não encontrado.';return;}
    document.title=data.title+' | Blog FCAP JR.';
    const metaDescription=document.querySelector('meta[name="description"]')||document.createElement('meta');metaDescription.name='description';metaDescription.content=String(data.excerpt||'').slice(0,155);if(!metaDescription.isConnected)document.head.append(metaDescription);
    // Tags podem ajudar a organizar assuntos, mas nao garantem posicionamento.
    // A antiga meta keywords nao e criterio de ranking do Google.
    article.replaceChildren();
    const eyebrow=document.createElement('span');eyebrow.className='eyebrow';eyebrow.textContent=data.category;
    const h=document.createElement('h1');h.textContent=data.title;
    const intro=document.createElement('p');intro.textContent=data.excerpt;
    article.append(eyebrow,h,intro);
    if(imageOK(data.cover_url)){const img=document.createElement('img');img.src=imageOK(data.cover_url);img.alt=data.title;img.style.cssText='width:100%;max-height:460px;object-fit:cover;border-radius:14px;margin:20px 0';article.append(img)}
    if(Array.isArray(data.seo_tags)&&data.seo_tags.length){const list=document.createElement('div');list.setAttribute('aria-label','Assuntos relacionados');list.style.cssText='display:flex;flex-wrap:wrap;gap:7px;margin:20px 0';for(const tag of data.seo_tags.slice(0,12)){const span=document.createElement('span');span.textContent=tag;span.style.cssText='padding:6px 10px;background:#edf3ff;border-radius:50px;color:#245bd7;font-size:12px';list.append(span)}article.append(list)}
    for(const part of (data.body||'').split(/\n\s*\n/).filter(Boolean)){
      const p=document.createElement('p');p.textContent=part.trim();p.style.cssText='font-size:17px;line-height:1.85;margin:22px 0;color:#26384b';article.append(p);
    }
  }
})();
