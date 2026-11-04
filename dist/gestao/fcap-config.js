// FCAP Jr. R15 | Configuracao PUBLICA do ambiente de testes.
// URL e chave PUBLISHABLE sao publicas; autorizacao depende de Auth + RLS no Supabase.
// Nunca incluir credenciais privadas, chaves de IA, segredos OAuth ou tokens pessoais neste arquivo.
window.FCAP_CONFIG = Object.freeze({
  supabaseUrl: 'https://zcxnyavlzawjoemelwig.supabase.co',
  supabaseAnonKey: 'sb_publishable_NmEnhHQDNsxdqDTL6XZQWw_ZmwZGp4f',
  turnstileSiteKey: '' // Integracao com Turnstile sera configurada separadamente.
});
