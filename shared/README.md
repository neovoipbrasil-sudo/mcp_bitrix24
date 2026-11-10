# Código compartilhado

Usado por todos os projetos do repositório (`mcp-bitrix24`, `bot`, `msntalk`, `reports`).
Não importa nenhum desses projetos.

| Pasta | Conteúdo |
|---|---|
| `bitrix24/` | `client.js` (HTTP com rate limit e novas tentativas em 429/502/503/timeout), `reader.js`, `writer.js` |
| `tools/` | Uma ferramenta por área do Bitrix24: CRM, tarefas, usuários, disco, calendário, catálogo, configuração do portal, chamada universal |
| `utils/` | Paginação, rate limiter, resolução do webhook, mapeamento de usuários, leitura do CSV do OTRS, pasta de dados (`data-dir.js`) |

Qualquer mudança aqui afeta todos os projetos — rode `npm test` na raiz.
