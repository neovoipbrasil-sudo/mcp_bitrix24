# Bot "Assistente" do Bitrix24

Servidor HTTP que recebe as mensagens de um chat 1:1 com um bot do Bitrix24, interpreta
o pedido com o Claude e executa as ações no portal (com confirmação antes de qualquer escrita).
É também o processo que hospeda a integração do MSN Talk (`../msntalk`) e o painel de
relatórios (`../reports`).

## Rotas

| Rota | O que faz |
|---|---|
| `POST /bitrix-events` | Eventos do bot (`ONIMBOTV2MESSAGEADD`) vindos do Bitrix24 |
| `POST /msntalk-events/:secret` | Webhook do MSN Talk — ver `../msntalk` |
| `/reports` | Painel de relatórios com login — ver `../reports` |

## Arquivos principais

| Arquivo | Papel |
|---|---|
| `bootstrap.js` | Ponto de entrada: monta tudo e sobe o servidor (porta 3300) |
| `server.js` | Rotas HTTP |
| `register.js` | Registra o bot no Bitrix24 (`npm run register:bot`) |
| `agent-loop.js`, `tool-registry.js` | Loop de uso de ferramentas do Claude e lista de ferramentas disponíveis |
| `claude-code-adapter.js` | Executa o modelo via CLI do Claude Code (assinatura Pro) |
| `pending-actions.js` | Confirmação de ações de escrita |
| `attachment-reader.js` | Lê anexos do chat (pdf, docx, xlsx, txt/csv/md, imagens) |
| `document-generator.js`, `generate-document.js` | Gera pdf/xlsx/csv/html/md/txt e anexa no chat |
| `memory.js`, `conversation-history.js`, `audit-log.js`, `message-rate-limiter.js`, `reply.js` | Memória, histórico, auditoria, limite de mensagens e envio de respostas |

## Dados persistentes

Ficam na pasta de dados (`shared/utils/data-dir.js`): `DATA_DIR`, ou `src/bot/data` se essa
pasta antiga existir, ou `bot/data`. No EasyPanel essa pasta precisa estar num volume.

## Deploy

`Dockerfile` na raiz do repositório (`CMD node bot/bootstrap.js`). Variáveis: ver `../.env.example`
(`B24_DEFAULT_WEBHOOK`, `BOT_ID`, `BOT_TOKEN`, `MSNTALK_WEBHOOK_SECRET`, …).

## Documentação

Designs e planos de implementação em [`docs/`](docs/).
