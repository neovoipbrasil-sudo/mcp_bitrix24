# catalogo/ — organização e edição do catálogo de produtos e serviços do Bitrix24

Ferramentas e documentos para ler, organizar e editar o Catálogo Comercial do portal.
É separado do servidor MCP (`src/`) e do bot; só reaproveita o cliente HTTP `src/bitrix24/client.js`.

```
catalogo/
├── app/                              editor web com agente de IA (Node.js)
│   ├── server.js                     servidor local (http://localhost:3400)
│   ├── lib/catalogo.js               leitura do catálogo + propostas (validar, aplicar, desfazer)
│   ├── lib/agente.js                 agente Claude: consulta o catálogo e PROPÕE alterações
│   └── public/                       interface (HTML/CSS/JS, sem build)
├── docs/
│   ├── bitrix24-catalogo.md          como o catálogo do Bitrix24 funciona (API, cuidados)
│   ├── diagnostico-e-proposta.md     diagnóstico, estrutura adotada e status das fases
│   └── revisao-fase-cd.md            lista nome antigo → novo aplicada nas fases C/D
├── scripts/                          PowerShell 5.1+, sem dependências
│   ├── B24.psm1                      cliente REST (lê B24_DEFAULT_WEBHOOK do .env da raiz)
│   ├── ler-catalogo.ps1              snapshot completo → data/snapshot-*.json (somente leitura)
│   ├── uso-em-negocios.ps1           em quantos negócios cada produto aparece (somente leitura)
│   ├── gerar-plano-ab.ps1 / -cd.ps1  planos da reorganização (fases A–D)
│   └── aplicar-plano.ps1             aplica um plano por fase (-Simular para testar; retomável)
└── data/                             snapshots, planos, histórico e planilhas (fora do git)
```

## Editor com agente de IA

```bash
npm install
npm run catalogo
```

Abra http://localhost:3400. Precisa no `.env` da raiz: `B24_DEFAULT_WEBHOOK` (escopo `catalog`) e
`ANTHROPIC_API_KEY` (para o assistente; a conta precisa ter créditos). Opcional: `CATALOGO_MODEL`
(padrão `claude-opus-5-5`) e `CATALOGO_PORT` (padrão 3400).

- **Tabela:** edite nome, preço, unidade e ativo direto na linha; selecione várias para mover de pasta,
  ativar ou desativar. As mudanças ficam em rascunho até **Revisar alterações**.
- **Assistente:** peça em português ("reajuste em 5% a locação dos Fanvil", "quais itens estão sem preço?",
  "crie o serviço X a R$ 180 em Serviços"). Ele consulta o catálogo e monta uma proposta.
- **Propostas:** tudo vira uma proposta com o "antes → depois". Nada é gravado no Bitrix24 até clicar em
  **Aplicar**. Cada proposta aplicada é salva em `data/historico/` e tem botão **Desfazer**.
- **Importar planilha de preços:** lê `data/precos-pendentes.csv` (coluna `preco_novo`) e monta uma proposta.
- Segurança: itens não são excluídos, só desativados. Pasta só é excluída vazia, conferida de novo no
  Bitrix24 na hora. O servidor só escuta em `127.0.0.1`.

## Scripts de leitura

```powershell
powershell -ExecutionPolicy Bypass -File catalogo\scripts\ler-catalogo.ps1
powershell -ExecutionPolicy Bypass -File catalogo\scripts\uso-em-negocios.ps1
```

O relatório de uso em negócios também precisa do escopo `crm` no webhook.
