-- FCAP Jr R17 R2: corrigir grants: navegadores apenas leitura.
revoke insert,update,delete,truncate,references,trigger on public.fcap_wa_threads,public.fcap_wa_messages from authenticated;
