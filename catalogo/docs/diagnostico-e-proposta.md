# Catálogo de produtos — diagnóstico e proposta de organização

Leitura feita em 2026-11-11 (snapshot em `catalogo/data/`).

**Status (2026-11-11):** fases A e B aplicadas (29 operações de pasta + 118 itens movidos, 0 erros, conferido
com nova leitura). Backup de antes: `data/snapshot-20261111-185434.json`.

**Status (2026-11-16):** fases C e D aplicadas (200 itens renomeados/medidas, 15 desativados, pastas 54, 60, 72, 78
excluídas — com 18 e 58 dentro da 54 — 0 erros, 0 divergências na conferência). Backup de antes:
`data/snapshot-20261116-154255.json`. Resultado: 203 itens ativos, 22 inativos, 34 pastas, nenhum item sem pasta,
nenhum nome ativo duplicado. Pendente: preços de 30 itens em R$ 0 (`data/precos-pendentes.csv`).

## 1. O que existe hoje

| | Quantidade |
|---|---|
| Catálogos | 2 — "Catálogo de produtos do CRM" (iblock 14) e o de variações (iblock 16) |
| Pastas | 31 (12 na raiz) |
| Itens principais | 225 — 54 produtos simples, 167 produtos com variação, 4 serviços |
| Variações | 167 (uma por produto com variação, criada automaticamente) |
| Tipo de preço | 1 (BASE, em BRL) |
| Negócios analisados | 3.254 |

### Problemas encontrados

| Problema | Quantidade | Impacto |
|---|---|---|
| Itens **sem pasta** | 67 (30%) | Difícil achar ao montar uma proposta |
| Itens **nunca usados** em negócios | 93 | Poluem a busca |
| Nomes **duplicados** (a diferença está escondida na descrição: Venda / Locação 12, 24, 36 meses) | 15 grupos, 47 itens | O vendedor escolhe o item errado |
| Preço **zerado ou vazio** | 33 | Proposta sai com R$ 0 |
| **Sem unidade de medida** | 127 | Quantidade aparece sem unidade |
| Nomes com espaço sobrando ou erro de digitação ("Servido", "GPX" em vez de "GXP", "fre", "Taxa de inst") | 16+ | Aparência e busca |
| Pasta-raiz "Neo VoIP" que contém metade do catálogo, e outras linhas soltas na raiz | — | Hierarquia confusa |
| Serviços cadastrados como "produto com variação" | ~110 | Só cosmético. **Não vamos converter**: mudar o tipo exige recriar o item e quebraria o vínculo com os negócios |

### Pastas atuais e o que fazer com cada uma

| ID | Pasta atual | Itens | Ação proposta |
|---|---|---|---|
| 54 | Neo VoIP (raiz) | 1 | **Excluir** depois de promover as subpastas para a raiz |
| 12 | Neo Vox | 28 | Mover para a raiz → "Telefonia Fixa · Neo Vox" |
| 80 / 82 / 84 | Full / Smart / Flex Nuvem | 6 / 6 / 4 | Manter dentro de Neo Vox |
| 8 | Revenda (Partner) — **inativa** | 7 inativos | Mover para dentro de Neo Vox e **ativar**: os itens "Partner" ativos vão para ela (ex.: o item 336 tem 80 negócios) |
| 10 | Neo Phone | 7 | Mover para a raiz → "PABX em Nuvem · Neo Phone" |
| 52 | Neo Chat | 3 | Mover para a raiz → "Atendimento Digital · MSN Talk / Neo Chat"; recebe ~30 itens que estão sem pasta |
| 16 | Internet | 4 | Mover para a raiz → "Internet · Links"; recebe os links e as taxas de instalação de link que estão sem pasta |
| 14 | Serviços Adicionais | 12 | Mover para a raiz → "Serviços · Instalação, Ativação e Portabilidade" |
| 116 | "Telefonia móvel " | 0 + subpastas | Manter; corrigir o nome → "Telefonia Móvel · Neo Vox Mobile" |
| 118 / 120 / 122 / 124 / 126 | Subpastas de móvel | 12 | Manter |
| 64 | Aparelho IP | 38 | Vai para a nova pasta "Equipamentos" → "Telefones IP" |
| 68 | Aparelho Audio | 2 | → "Equipamentos" → "Headsets e Áudio" |
| 66 | Conversor | 4 | → "Equipamentos" → "Conversores e ATAs" |
| 70 | Roteador | 1 | → "Equipamentos" → "Rede e Acessórios" |
| 60 | Telefone | 1 | **Excluir** depois de mover o item para "Telefones IP" (é o mesmo GXP1610) |
| 72 | Portabilidade | 2 | **Excluir** depois de mover os itens para "Serviços" |
| 56 | EMI Telecom | 1 + subpastas | Manter → "Parceiro EMI Telecom · UnVoIP" |
| 38 / 40 | UnVoIP SIP / UnVoIP ME | 3 / 1 | Manter dentro de EMI |
| 74 / 76 | Licença PRO / Licença Enterprise (raiz) | 6 / 6 | Mover para dentro de EMI (são licenças UnVoIP Talk) |
| 62 / 78 | Ramais / Ramal (duplicadas) | 2 / 1 | Juntar em "Ramais" dentro de EMI; **excluir** a 78 |
| 18 | Revenda - Waldey Junior (CENOTEL) | **0** | **Excluir** (vazia) |
| 58 | Neo Talks | **0** | **Excluir** (vazia) |

Uma pasta só é excluída **depois de vazia**. Excluir uma pasta com itens apaga esses itens para sempre.

## 2. Estrutura proposta

```
Telefonia Fixa · Neo Vox
├── Full Nuvem Ilimitado            (Full 1–6, 12/24/36 meses)
├── Smart Nuvem Ilimitado           (Smart 1–6)
├── Nuvem Ilimitado (linha clássica) [nova] (Nuvem Ilimitado 1–6)
├── Pós-pago (POS / Flex)           (Full POS, Smart POS, Flex POS)
├── Pré-pago                 [nova] (Pré 1–6)
├── 0800                     [nova] (0800 Tarifado + ativação 0800)
└── Revenda (Partner)               (todas as versões Partner)
PABX em Nuvem · Neo Phone
├── Licenças                        (Basic, Standard, Essentials, Talk…)
└── Recursos adicionais      [nova] (gravação, call center, discador, backup, servidor on-premise)
Atendimento Digital · MSN Talk / Neo Chat
├── Licenças e planos        [nova]
├── Pacotes e adicionais     [nova] (mensagens, usuários, armazenamento, canais, API)
└── Implantação e suporte    [nova]
Internet · Links                    (dedicado, corporativo, FTTH + instalação de link)
Telefonia Móvel · Neo Vox Mobile    (sem mudança interna)
Equipamentos                 [nova]
├── Telefones IP
├── Headsets e Áudio
├── Conversores e ATAs
└── Rede e Acessórios
Serviços · Instalação, Ativação e Portabilidade
Parceiro EMI Telecom · UnVoIP
├── UnVoIP SIP · UnVoIP ME · Licença PRO · Licença Enterprise · Ramais
```

Resultado: 8 pastas na raiz, cada uma com uma linha de negócio clara, e **nenhum item sem pasta**.

## 3. Padrão de nomes

`<Produto> <variante> — <Modalidade>`. A modalidade vai no nome (hoje está só na descrição):

| Hoje | Proposto |
|---|---|
| Aparelho IP - Fanvil X1S (Fast - com Fonte) ×4 | Fanvil X1S (Fast, com fonte) — Venda / — Locação 12 meses / 24 / 36 |
| KAP 204 FXS - KHOMP ×4 | KAP 204 FXS Khomp — Venda / — Locação 12 meses / … |
| Neo Phone - Licença Standard ×3 | Neo Phone Licença Standard — 12 meses / 24 / 36 |
| Aparelho IP - Grandstream GPX 1610 | Grandstream GXP1610 — Venda / — Locação 24 meses |
| "Servido (2 núcleos e 4 RAM / MSN Talk)" | Servidor MSN Talk (2 núcleos, 4 GB RAM) |
| Licenças MSN Talk de 150 caracteres em maiúsculas | Nome curto (ex.: "MSN Talk — 1 canal WhatsApp, 3 usuários, 1 GB"); o texto contratual vai para a descrição |

Renomear no catálogo **não altera** negócios e propostas antigas: o Bitrix24 guarda o nome do produto em cada linha do negócio.

Unidade de medida: **Mês** para os serviços recorrentes (linhas, licenças, planos) e **Unidade** para equipamentos e taxas únicas.

## 4. Itens que precisam da sua decisão

| Item | Situação | Sugestão |
|---|---|---|
| 620 "fre" | R$ 0, usado em 47 negócios | O que é? Frete? Renomear |
| 582 "Taxa de instalação remota" (sem preço, 28 negócios) × 420 "Instalação Remota" (R$ 50, 52 negócios) × 886 "Instalação Remota Neo Phone" (R$ 50) | Três itens para a mesma coisa | Manter o 420 e desativar o 582 |
| 130 "Portabilidade de Números" (R$ 9,50, 212 negócios) × 572 "Portabilidade" (R$ 12,60) × 536 (R$ 0) | Três preços diferentes | Qual é o preço certo? |
| Grandstream GPX 1630 ×5 | Todos a R$ 1,00, nunca usados | Corrigir o preço ou desativar |
| Fanvil X7 V2: dois "Venda" (R$ 1.560,97 e R$ 1.674,97); GXP1610: dois "Venda" (R$ 256,97 e R$ 345,97) | Duplicados | Qual preço vale? Desativar o outro |
| 578 "Taxa de inst", 846 Headset HT301 (duplicado), 460 "Neo Talk PRO 1" (R$ 6.367,18) | Nunca usados | Desativar |
| 33 itens com preço R$ 0 (licenças MSN Talk, API, ativações) | Preço definido em cada proposta? | Manter R$ 0 só se o preço for sempre negociado |

**Regra para limpeza:** itens são **desativados**, não excluídos. Isso tira o item da busca, mas mantém o histórico. Só as pastas vazias são excluídas.

## 5. Como será aplicado

1. Novo snapshot completo (backup).
2. Fase A: criar as pastas novas e mover/renomear as pastas atuais. Itens não são afetados.
3. Fase B: mover cada item para a pasta nova.
4. Fase C: renomear, ajustar a unidade de medida e corrigir os preços que você decidir.
5. Fase D: desativar os itens que você aprovar e excluir as pastas que ficaram vazias.

Cada fase gera um arquivo de plano (`catalogo/data/plano-*.json`) e só é aplicada depois da sua revisão.
