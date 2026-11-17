# Deploy dos apps Neo VoIP na VPS do 3CX

Os apps rodam em Docker **ao lado do 3CX**, sem mexer nele:

```
Internet ─► nginx (já existe, é do 3CX) ─► arquivo próprio neovoip-apps.conf
                                            ├─ connecmob.connectelecom.com.br          → 127.0.0.1:3001  appquilometragem
                                            ├─ proposal-assistant.connectelecom.com.br → 127.0.0.1:3002  proposal-assistant
                                            ├─ (depois) bot MSN Talk                    → 127.0.0.1:3300
                                            └─ (depois) painel de monitoramento         → 127.0.0.1:3010  Uptime Kuma
```

- Containers escutam **só em 127.0.0.1** — nenhuma porta nova aberta na internet.
- Cada container tem **limite de memória e CPU** — um app travado não derruba a telefonia.
- Bancos de dados ficam no **Supabase (nuvem)** — nada de banco nesta VPS.
- Os nomes dos subdomínios são sugestões; se mudar, troque em `nginx/neovoip-apps.conf` e nos `env/*.env`.

## 0. Antes de tudo

1. **hPanel → VPS → Snapshots → Criar snapshot.** É o "botão de voltar" caso algo afete o 3CX.
2. Fazer fora do horário de atendimento.
3. Descobrir o IPv4 da VPS: `curl -4 -s ifconfig.me`

## 1. DNS

Os registros **A** de `connecmob.connectelecom.com.br` e `proposal-assistant.connectelecom.com.br`
precisam apontar para o IPv4 da VPS. Conferir:

```bash
getent ahosts connecmob.connectelecom.com.br; getent ahosts proposal-assistant.connectelecom.com.br; curl -4 -s ifconfig.me; echo
```

O bot (MSN Talk) e o painel de monitoramento ganham subdomínio numa etapa seguinte.

## 2. Conferir como o nginx do 3CX carrega configurações

```bash
nginx -T 2>/dev/null | grep -nE "^# configuration file|include " | head -30
```

Precisa aparecer `include /etc/nginx/conf.d/*.conf;`. Se não aparecer, **pare aqui** e
mande a saída — o arquivo dos apps vai em outro lugar.

## 3. Instalar Docker

```bash
apt-get update && apt-get install -y ca-certificates curl git certbot
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

Depois confira que o 3CX segue normal (painel web e uma ligação de teste).

## 4. Baixar o código

Os repositórios são privados: crie um token em GitHub → Settings → Developer settings →
Fine-grained tokens, com acesso **somente leitura (Contents: Read)** aos 3 repositórios.

```bash
mkdir -p /opt/neovoip && cd /opt/neovoip
TOKEN=cole_o_token_aqui
for r in appquilometragem proposal-assistant mcp_bitrix24; do
  git clone https://x-access-token:$TOKEN@github.com/neovoipbrasil-sudo/$r.git
done
```

## 5. Preencher as variáveis

```bash
cd /opt/neovoip/mcp_bitrix24/deploy
cp .env.example .env
cp env/quilometragem.env.example env/quilometragem.env
cp env/propostas.env.example env/propostas.env
nano .env env/quilometragem.env env/propostas.env
chmod 600 .env env/*.env
```

Cada arquivo diz de onde tirar cada valor.

## 6. Subir os containers

```bash
docker compose up -d --build quilometragem propostas
docker compose ps        # devem ficar "healthy" em ~1 min
curl -s 127.0.0.1:3001/api/health; curl -s 127.0.0.1:3002/api/health
```

## 7. Publicar com HTTPS

```bash
mkdir -p /var/www/certbot
cp nginx/neovoip-proxy.conf /etc/nginx/neovoip-proxy.conf
cp nginx/neovoip-apps.conf  /etc/nginx/conf.d/neovoip-apps.conf
nginx -t && systemctl reload nginx

certbot certonly --webroot -w /var/www/certbot --cert-name neovoip-apps \
  -d connecmob.connectelecom.com.br -d proposal-assistant.connectelecom.com.br \
  --deploy-hook "systemctl reload nginx"
```

Agora edite `/etc/nginx/conf.d/neovoip-apps.conf` e **descomente a Fase 2**, depois:

```bash
nginx -t && systemctl reload nginx
```

> Sempre rode `nginx -t` antes do reload: um erro nesse arquivo derrubaria também o painel do 3CX.

## 8. Reapontar integrações

- **Bitrix24:** URL do handler do bot → `https://bot.neovoip.com.br/bitrix-events`
- **MSN Talk:** webhook → `https://bot.neovoip.com.br/msntalk-events/<MSNTALK_WEBHOOK_SECRET>`
- **Supabase (os 2 projetos):** Authentication → URL Configuration → Site URL / Redirect URLs com os domínios novos.
- **Painel de relatórios:** `https://bot.neovoip.com.br/reports` — primeiro acesso `admin` / `admin` (troca obrigatória).

## 9. Monitoramento (Uptime Kuma)

Abra `https://status.neovoip.com.br`, crie o usuário admin e cadastre:

| Monitor | Tipo | Endereço |
|---|---|---|
| Quilometragem (interno) | HTTP | `http://quilometragem:3000/api/health` |
| Quilometragem (público) | HTTP | `https://connecmob.connectelecom.com.br/api/health` |
| Propostas (interno) | HTTP | `http://propostas:3000/api/health` |
| Propostas (público) | HTTP | `https://proposal-assistant.connectelecom.com.br/api/health` |
| Bot (interno) | HTTP | `http://bot:3300/health` |
| Bot (público) | HTTP | `https://bot.neovoip.com.br/health` |
| 3CX SIP | TCP | `host.docker.internal` porta `5060` |
| 3CX painel | HTTP | URL pública do 3CX |
| Supabase quilometragem | HTTP | `https://yggdrtanzrofsuijmeuw.supabase.co/auth/v1/health` (header `apikey: <anon key>`) |
| Supabase propostas | HTTP | `https://sfcmrbudlnjptmjuqwkm.supabase.co/auth/v1/health` (header `apikey: <anon key>`) |

Interno caiu = app com problema. Só o público caiu = nginx/DNS/certificado.
Em *Settings → Notifications* configure alertas (Telegram, e-mail, WhatsApp via API…) e,
se quiser, uma *Status Page* pública.
O Uptime Kuma também avisa quando o certificado HTTPS está perto de vencer.

## 10. Backup e atualização

```bash
crontab -e
# 15 3 * * * /opt/neovoip/mcp_bitrix24/deploy/backup.sh
```

O backup cobre o que não está no GitHub nem no Supabase (`.env`, dados do bot e do Uptime Kuma)
e fica em `/opt/neovoip/backups`. Copie esses arquivos para fora da VPS de vez em quando
(Google Drive, por exemplo) — o backup da Hostinger é semanal e só guarda 2 cópias.

Para publicar novas versões do código: `/opt/neovoip/mcp_bitrix24/deploy/update.sh`

## Desfazer tudo (se algo afetar o 3CX)

```bash
rm /etc/nginx/conf.d/neovoip-apps.conf && nginx -t && systemctl reload nginx
cd /opt/neovoip/mcp_bitrix24/deploy && docker compose down
```

Em último caso: restaurar o snapshot do passo 0.
