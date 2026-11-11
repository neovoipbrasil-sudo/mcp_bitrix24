# Catálogo de produtos e serviços — painel com assistente de IA

Painel web para ler, diagnosticar, organizar e editar o Catálogo Comercial do Bitrix24, com um assistente de IA que propõe as mudanças. Fica em **`https://<host-do-bot>/reports/catalogo`** e usa o mesmo login do painel de relatórios.

## Como o catálogo do Bitrix24 funciona

Resumo da documentação oficial da REST API (repositório `bitrix24/b24restdocs`, seção `api-reference/catalog`), que é a base do código em `src/catalog/`:

| Conceito | Como é no Bitrix24 | Métodos |
|---|---|---|
| Catálogo | Um "bloco de informação" (iblock). O catálogo do CRM tem o iblock de produtos e, se houver variações, um iblock de ofertas que aponta para ele (`productIblockId`). | `catalog.catalog.list` |
| Pastas | "Seções", em árvore (`iblockSectionId` = pasta-mãe). Um item tem uma pasta principal. | `catalog.section.*` |
| Tipos de item | 1 Produto, 2 Kit, 3 Produto com variações, 4 Variação, 7 Serviço. Cada tipo tem seu grupo de métodos e **o tipo de um item existente não muda**. | `catalog.product.*`, `.service.*`, `.sku.*`, `.offer.*` |
| Preço | Não é campo do produto: há um preço por tipo de preço. O tipo **base** é o preço de venda usado em negócios e propostas do CRM. | `catalog.price.*`, `catalog.priceType.list` |
| Unidade e imposto | Unidade de medida e alíquota por item. | `catalog.measure.*`, `catalog.vat.*` |
| Listas | `result.<plural>` + `total`, 50 por página (`start`). `catalog.product.list` exige `filter.iblockId` e `select`. | — |

**Atenção:** `catalog.section.delete` apaga a pasta **junto com as subpastas e os itens que só estão nela**, sem volta. Por isso o painel só exclui pasta vazia (confere na hora, relendo o catálogo) e o diagnóstico sempre propõe mover o conteúdo antes.

## O que o painel faz

1. **Leitura completa**: catálogos, pastas, todos os itens (produtos, serviços, produtos com variações e a contagem de variações), preços, tipos de preço, unidades e alíquotas. Fica em cache por 5 minutos; o botão "Recarregar do Bitrix24" força uma nova leitura.
2. **Diagnóstico** (aba "Diagnóstico"), com sugestões prontas quando dá para resolver automaticamente:
   - pastas vazias → excluir;
   - pastas duplicadas (mesmo nome ignorando acento/maiúsculas) → mover tudo para a que tem mais itens e excluir as outras;
   - pastas só com itens inativos, com um único item ou com mais de 3 níveis → revisar;
   - itens ativos sem pasta, sem preço, sem descrição, duplicados, com nome todo em maiúsculas ou com espaços sobrando;
   - itens com cara de serviço (instalação, mensalidade, suporte, licença…) cadastrados como produto.
3. **Edição**: clicar num item abre o formulário (nome, descrições, pasta, preço de venda, ordem, ativo). Seleção em massa permite mover, ativar e desativar. Pastas são criadas, renomeadas, movidas e excluídas pelo ✎ na árvore.
4. **Assistente de IA** (coluna da direita): entende pedidos em português ("proponha uma nova organização de pastas", "escreva as descrições que faltam", "quais pastas posso excluir?"). Ele consulta o catálogo com ferramentas próprias e devolve uma **proposta** com operações concretas; você marca as que quer e manda para a fila.
5. **Alterações pendentes**: tudo (edição manual, sugestão do diagnóstico, proposta da IA) vai para uma fila revisável, na ordem em que será aplicado. Só administradores do painel aplicam. Cada operação aplicada é registrada em `src/bot/data/audit.jsonl` com o usuário que aplicou; as que falham ficam na fila com o motivo.

Usuários com perfil "Leitura" veem o catálogo, o diagnóstico e conversam com a IA, mas não aplicam alterações.

## Configuração

O painel sobe junto com o bot (`node src/bot/bootstrap.js`) e usa:

- `B24_DEFAULT_WEBHOOK` — o webhook precisa do escopo **`catalog`** (leitura e escrita). Sem ele, a leitura falha com erro de acesso.
- Credencial da Anthropic já usada pelo bot (`ANTHROPIC_API_KEY`, ou `BOT_MODEL_BACKEND=claude-code`).
- `CATALOG_AGENT_MODEL` (opcional) — modelo do assistente. Padrão: `claude-opus-5-5`.

## Relatório pela linha de comando

Gera a leitura completa e o diagnóstico em Markdown (ou JSON), sem precisar do painel:

```bash
B24_DEFAULT_WEBHOOK=https://<portal>/rest/<id>/<token>/ node src/catalog/catalog-report-cli.js > catalogo.md
node src/catalog/catalog-report-cli.js --json > catalogo.json
```

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/catalog/catalog-service.js` | Leitura (snapshot) e escrita (operações) no Bitrix24 |
| `src/catalog/catalog-audit.js` | Diagnóstico: pastas para excluir/fundir, dados faltando |
| `src/catalog/catalog-agent.js` | Assistente de IA (ferramentas de leitura + `propose_changes`) |
| `src/catalog/catalog-panel.js` / `.html` | Rotas `/reports/catalogo` e a interface |
| `src/catalog/catalog-report-cli.js` | Relatório em Markdown/JSON |
| `src/catalog/fake-portal.js` | Portal de mentira para testes e demonstração |
