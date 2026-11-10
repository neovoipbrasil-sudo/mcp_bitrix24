# MCP_Bitrix24

Repositório com as integrações da Neovoip com o **Bitrix24**. Cada projeto fica na
sua própria pasta; o código de acesso ao Bitrix24 que todos usam fica em `shared/`.

| Pasta | Projeto | Como roda |
|---|---|---|
| [`mcp-bitrix24/`](mcp-bitrix24/README.md) | **Servidor MCP do Bitrix24** — conecta o Claude (Desktop/Code) ao portal | Na sua máquina, via Claude Desktop/Code (stdio) |
| [`bot/`](bot/README.md) | **Bot "Assistente"** — chat 1:1 no Bitrix24 que executa pedidos com o Claude | Servidor HTTP no EasyPanel |
| [`msntalk/`](msntalk/README.md) | **Integração MSN Talk → Bitrix24** — mensagens na timeline do Lead/Deal | Dentro do servidor do bot (rota `/msntalk-events/:secret`) |
| [`reports/`](reports/README.md) | **Relatórios Help Desk** — gerador de relatório + painel web `/reports` | Gerador via linha de comando; painel dentro do servidor do bot |
| [`shared/`](shared/README.md) | Código comum: cliente HTTP do Bitrix24, ferramentas (CRM, tarefas…) e utilitários | Usado por todos os projetos |
| [`docs/planejados/`](docs/planejados/) | Projetos ainda não implementados (ex.: integração SZ.chat) | — |

```
MCP_Bitrix24/
├── mcp-bitrix24/   index.js + README do servidor MCP
├── bot/            servidor do bot (bootstrap.js) + docs/
├── msntalk/        sincronização MSN Talk → timeline + docs/
├── reports/        relatório Help Desk e painel /reports
├── shared/
│   ├── bitrix24/   cliente HTTP (rate limit, retry), reader, writer
│   ├── tools/      uma ferramenta por área (crm, tasks, disk, …)
│   └── utils/      paginação, rate limiter, webhook, CSV do OTRS, pasta de dados
├── docs/planejados/
├── Dockerfile      imagem do servidor (bot + MSN Talk + painel de relatórios)
└── package.json    dependências e scripts de todos os projetos
```

## Comandos

```bash
npm install                 # instala as dependências (uma vez, para todos os projetos)
npm test                    # roda os testes de todos os projetos
npm run start:mcp           # servidor MCP (normalmente é o Claude Desktop que inicia)
npm run start:bot           # servidor do bot + MSN Talk + painel /reports
npm run register:bot        # registra o bot no Bitrix24 (uma vez)
npm run report:helpdesk -- --panel --all   # gera o relatório Help Desk para o painel
```

As variáveis de ambiente de todos os projetos estão em [`.env.example`](.env.example).

## Dependências entre as pastas

- `bot/` importa `msntalk/` e `reports/` porque o servidor do bot é quem expõe as rotas deles.
- Todos importam `shared/`. `shared/` não importa nenhum projeto.
- Ao alterar algo em `shared/`, rode `npm test` — os testes de todos os projetos usam esse código.
