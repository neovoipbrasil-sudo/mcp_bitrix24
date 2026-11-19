# Como funciona o Catálogo Comercial do Bitrix24 (resumo da documentação)

Fonte: https://apidocs.bitrix24.com/api-reference/catalog/ (consultado em 2026-11-11).

## Estrutura

- **Catálogo** (`catalog.catalog.list`): o catálogo comercial é um *information block* (iblock).
  Normalmente há um iblock de **produtos** e outro de **variações** (SKU). Todo `list` exige o `iblockId`.
- **Seções / pastas** (`catalog.section.*`): árvore hierárquica (`iblockSectionId` = pasta-mãe).
  Um produto tem uma seção principal (`iblockSectionId`) e pode estar ligado a várias (`iblockSection: [..]`).
- **Itens**:
  - Produto simples, produto com variações (pai de SKU), variações — `catalog.product.*`
  - **Serviços** — `catalog.product.service.*` (tipo 7). Não têm estoque.
  - Campo `type` indica o tipo do item (1 = simples, 3 = com variações, 4 = variação, 7 = serviço).
- **Preços** (`catalog.price.*`, `catalog.priceType.*`): o preço de venda NÃO fica no produto; fica numa
  tabela de preços por tipo de preço (o tipo "BASE" é o preço de venda padrão). `purchasingPrice` é o preço de compra.
- **Referências**: unidades de medida (`catalog.measure.*`), alíquotas de imposto (`catalog.vat.*`),
  propriedades personalizadas (`catalog.product.property.*`, enviadas como `propertyN`).

## Regras práticas da API (REST 2)

- `catalog.product.list` / `service.list`: `select` precisa ter `id` e `iblockId`; `filter` precisa ter `iblockId`.
  Paginação de 50 em 50 via `start`. Filtros com prefixos `>=`, `%`, `!=`, `!` etc.
- `catalog.product.update`: só altera os campos enviados. `iblockId` não muda. O tipo do item não é alterável —
  para "transformar" produto em serviço é preciso criar um novo item e desativar o antigo.
- `catalog.product.service.update/delete` **não checam o tipo**: um ID de produto simples também seria alterado.
  Sempre conferir com `get` antes.
- `catalog.price.modify` **substitui todos os preços** do item (os não enviados são apagados).
  Para mudar um único preço, usar `catalog.price.update` (ou `catalog.price.add` se ainda não existir).
- `catalog.section.update`: exige `iblockId` e `name` em `fields`.
- `catalog.section.delete`: apaga a pasta **e todas as subpastas**. Produtos ligados só a ela são
  **apagados de forma irreversível**; produtos ligados a outras pastas ficam. Por isso, antes de excluir uma pasta,
  mover os itens (`iblockSectionId`) para a pasta nova.
- Com controle de estoque ativo, `purchasingPrice`/`quantity` não são salvos pelo `update` (sem erro).

## Regras adotadas neste projeto

1. Toda mudança passa por um **plano** (lista de operações) revisado antes de aplicar.
2. Antes de aplicar, é gravado um **snapshot** completo em `catalogo/data/` (reversão manual possível).
3. Excluir pasta só depois de esvaziá-la; preferir **desativar** (`active: N`) a excluir item.
