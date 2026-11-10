# Integração MSN Talk → Bitrix24

Recebe as mensagens do MSN Talk (webhook `POST /msntalk-events/:secret`, exposto pelo
servidor do `../bot`) e mantém um comentário consolidado e fixado na timeline de cada
Lead/Deal aberto do contato, identificado pelo telefone.

## Arquivos

| Arquivo | Papel |
|---|---|
| `webhook-handler.js` | Converte o payload do MSN Talk num evento normalizado |
| `sync-timeline.js` | Fluxo principal: acha o Lead/Deal, cria/atualiza o comentário, cria Contato+Lead para mensagens do site e de formulário |
| `find-crm-entity.js` | Procura Leads/Deals abertos pelo telefone (contato, contatos adicionais, empresa) |
| `normalize-phone.js` | Normaliza telefones brasileiros (9º dígito) |
| `thread-store.js` | Guarda o vínculo ticket → comentário na timeline |
| `pending-store.js`, `reconcile-pending.js` | Mensagens de telefones ainda sem correspondência e a reconciliação periódica (15 min) |
| `additional-contacts-index.js`, `refresh-additional-contacts.js` | Índice de telefones de contatos adicionais, atualizado a cada 30 min |

O agendamento das rotinas periódicas fica em `../bot/bootstrap.js`.

## Variáveis

`MSNTALK_WEBHOOK_SECRET` (obrigatória) e `MSNTALK_TICKET_URL_TEMPLATE` — ver `../.env.example`.

## Documentação

Design e plano de implementação em [`docs/`](docs/).
