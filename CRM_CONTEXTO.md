# Continuidade do CRM FCAP JR.

## Estado entregue
Site institucional completo e responsivo. Última versão aprovada inclui correções de logos, foto da equipe, soluções expansíveis em largura total, quadrados decorativos e degradê suave.
A foto mantém os rostos originais; dois detalhes azuis foram substituídos por formas vetoriais para remover serrilhados.

## Arquitetura atual
HTML/CSS/JavaScript estático em dist/. Não há autenticação, banco de dados, API nem CRM. Não tratar o agendamento visual como agenda persistida/confirmada: conferir booking.js ao integrar o backend.

## Próxima etapa
Definir com Diego os usuários, permissões, funil comercial, cadastro de empresas/contatos, tarefas e integração das solicitações de diagnóstico. A tecnologia e o banco ainda precisam ser definidos. Manter o site público aprovado ao adicionar o CRM em rota própria, por exemplo /crm.
Nunca colocar senhas ou chaves privadas no frontend ou no GitHub. Usar variáveis de ambiente no backend e políticas de acesso no banco quando implementados.

## Referência
Publicação: https://fcap-jr-apresentacao-cliente.diegotbyrro.chatgpt.site
GitHub desejado: https://github.com/diegotbyrro-ui/fcapjr
