# Relatórios Help Desk

## Gerador (`helpdesk-report.js`)

Gera o relatório Help Desk em HTML a partir do Bitrix24 e do histórico do OTRS
(CSV, lido por `../shared/utils/parse-otrs-csv.js`), com períodos personalizados.
O HTML é criptografado (`protect-html.js`, AES-256-GCM + PBKDF2) e só abre com usuário e senha.

```bash
npm run report:helpdesk -- --panel --all   # gera para o painel /reports
```

Sem `--panel`, o arquivo vai para `reports/output/helpdesk-report.html` (ignorado pelo git).

## Painel web (`reports-panel.js`, `report-users.js`)

Montado em `/reports` pelo servidor do `../bot`. Login, troca de senha e gestão de usuários.
Primeiro acesso: `admin` / `admin`, com troca de senha obrigatória. Usuários em
`<pasta de dados>/report-users.json`; relatórios em `REPORTS_DIR` (padrão `<pasta de dados>/reports`).

## Variáveis

`B24_REPORT_USERS`, `B24_REPORT_USERS_FILE`, `REPORTS_DIR`, `DATA_DIR` — ver `../.env.example`.
