# Formulário de Pedidos (substitui Jotforms 240012991264653 + 240114299238658)

Status: em definição, seção por seção.

## Hospedagem
Rota no servidor do bot (Express / Easypanel), ex.: `/formulario`. Webhook do Bitrix só no servidor.

## Seção 0 — Quem está preenchendo
Pergunta: "Você é Vendedor (Connect) ou Revenda?"
- **Revenda** → lista com nomes das revendas → preenche automaticamente os dados da Seção 1.
- **Vendedor** → lista com vendedores da Connect → preenche automaticamente nome/e-mail/celular.
- Fonte das listas: planilha fornecida pelo usuário (pendente).
- Bitrix: vendedor = responsável (ASSIGNED_BY_ID) do negócio, pipeline Vendas Diretas.
  Revenda = pipeline Revendas; identificação da revenda no Bitrix a definir (ver proposta abaixo).

## Seção 1 — Dados da Revenda / Vendedor
Campos: CNPJ, Nome (revenda/responsável), E-mail, Celular. Pré-preenchidos pela lista, editáveis.

### Identificar a revenda no Bitrix (APROVADO em 2026-11-12)
- Cadastrar cada revenda como **Empresa** no Bitrix com tipo "Parceiro/Revenda".
- Campo personalizado no Negócio: "Revenda" (vínculo CRM → Empresa).
- Responsável do negócio de revenda: a definir.

### Dados de vendedores e revendas
O repositório é PÚBLICO: nomes, e-mails, celulares e CNPJs de vendedores/revendas NÃO ficam no código.
Ficam só no catálogo do servidor (volume), cadastrados pelo painel `/formulario/admin`, que importa as
planilhas CSV usadas hoje (vendedores: `NOME;E-MAIL;CELULAR;ID`; revendas: `NOME;CNPJ;ID DO RESPONSÁVEL;NOME DO RESPONSÁVEL;E-MAIL;CELULAR`).
- Vendedores: responsável do card = o próprio vendedor (ID do usuário no Bitrix).
- Revendas: responsável do card = "ID do responsável" da planilha.
- Uma revenda tem preço especial no Neo Vox Nuvem Pré 1 (R$ 39,90 em vez de R$ 25,00) — CONFIRMADO: manter; cadastrar na aba "Preços especiais".

## Seção 2 — Tipo de cliente
- Pergunta: "O cliente é Pessoa Física (CPF) ou Pessoa Jurídica (CNPJ)?"
- Busca no Bitrix pelo CPF/CNPJ para achar lead/contato/empresa existente.
- PJ: ao digitar o CNPJ, preencher razão social, nome fantasia, data de fundação e endereço via BrasilAPI (pública, gratuita); vendedor confere/edita.
- PF: não existe API pública de CPF; endereço preenchido pelo CEP via ViaCEP (pública, gratuita).

## Seção 3a — Cliente Pessoa Física (todos os campos obrigatórios)
- Cliente: nome completo, CPF (validado), data de nascimento, celular, e-mail.
- Endereço de cobrança: CEP (ViaCEP preenche) → rua, nº, bairro, complemento, cidade, UF.
- Gestor do contrato: nome, celular, e-mail — botão "Mesmo que o cliente".
- Responsável financeiro: nome, celular, e-mail — botão "Mesmo que o cliente".
- Responsável técnico: nome, celular, e-mail — botão "Mesmo que o cliente".
- Testemunha: nome, e-mail — informada pelo vendedor.
- Upload: cópia do RG ou CNH.

## Seção 3b — Cliente Pessoa Jurídica (todos obrigatórios, salvo indicado)
- CNPJ (validado) → BrasilAPI preenche: razão social, nome fantasia, data de fundação, endereço, Simples Nacional.
- Indicador de IE: Contribuinte / Contribuinte Isento / Não Contribuinte. Nº da IE só aparece e é obrigatório se "Contribuinte".
- Inscrição municipal; Simples Nacional (Sim/Não, auto); Retenção de ISS (Sim/Não).
- Sócio principal: nome, CPF, nascimento, celular, e-mail.
- Botão "+ Adicionar sócio" com os mesmos campos (substitui a caixa de texto livre).
- Endereço de cobrança (auto pela BrasilAPI, editável; CEP via ViaCEP).
- Gestor, financeiro e técnico: nome, celular, e-mail — botão "Mesmo que o sócio principal".
- Testemunha: nome, e-mail (vendedor informa).
- Upload: última alteração contratual + CNH/CPF dos sócios.

Pendente: complemento do endereço obrigatório ou opcional (sugestão: opcional).

Decidido (2026-11-16): complemento do endereço é OPCIONAL (PF e PJ); demais campos obrigatórios.

## Tabela de preços (fonte: `Downloads/Revenda - CSV.xlsx`)
Regra: desconto FIXO de 50% sobre a mensalidade dos serviços com fidelidade (Neo Vox, Neo Phone). Adicionais sem desconto, salvo indicado. Preços ficarão num arquivo de configuração (fácil de atualizar).

### Neo Vox Ilimitado (por canal SIP/linha) — cheio → com 50%
| Fidelidade | 1–20 canais | ≥21 canais |
|---|---|---|
| 12 meses | Plano 1: 179,80 → 89,90 | Plano 4: 171,80 → 85,90 |
| 24 meses | Plano 2: 151,80 → 75,90 | Plano 5: 141,80 → 70,90 |
| 36 meses | Plano 3: 119,80 → 59,90 | Plano 6: 99,80 → 49,90 |
Vale igual para: Full Nuvem Ilimitado, Smart Nuvem Ilimitado e Full Nuvem Ilimitado Partner ("JR").

### Neo Vox Tarifado (Pós) — assinatura cheio → 50% | minuto Fixo Local / Fixo LDN / Móvel Local / Móvel LDN
- Full Nuvem POS 1 (12m): 59,80 → 29,90 | 0,079 / 0,099 / 0,149 / 0,239
- Full Nuvem POS 2 (24m): 57,80 → 28,90 | idem
- Full Nuvem POS 3 (36m): 55,80 → 27,90 | idem
- Nuvem 0800 POS (36m): 285,94 → 142,97 | 0,21 / 0,49 / 0,49 / 0,49

### Neo Vox Pré (sem fidelidade) — recarga por linha | minuto LC / LDN / VC1-3
- Pré 1: 25,00 (preço especial de uma revenda: 39,90) | 0,061 / 0,208 / 0,256
- Pré 2: 50,00 | 0,061 / 0,178 / 0,238
- Pré 3: 75,00 | 0,061 / 0,163 / 0,230
- Pré 4: 150,00 | 0,061 / 0,148 / 0,221
- Pré 5: 500,00 | 0,061 / 0,134 / 0,212
- Pré 6: 1.000,00 | 0,061 / 0,119 / 0,203
- Ativação R$ 25,00 por linha.

### Neo Phone — licença por ramal (cheio → 50%)
| Licença | 12m | 24m | 36m |
|---|---|---|---|
| Essentials | 55,94 → 27,97 | 39,94 → 19,97 | 23,94 → 11,97 |
| Basic | 71,94 → 35,97 | 55,94 → 27,97 | 39,94 → 19,97 |
| Standard | 87,94 → 43,97 | 71,94 → 35,97 | 55,94 → 27,97 |

### Serviços adicionais (mensal; comissão 100% da 1ª fatura)
- Linhas 0800 Tarifado: 219,80 → 109,90
- DID/DDR adicional: 6,50 (12m e 24m) / 12,00 (36m) — conferir
- Portabilidade: 9,50 por número
- Discador automático: 239,97 · Grupo Call Center: 239,97
- Gravação extra: 1 ano 7,97 · 2 anos 11,97 · 5 anos 19,97 (90 dias inclusos em Basic/Standard)
- URA Reversa: 194,00 → 97,00 (12m: 97,00)
- Siga-me: 18,90 por canal (só planos ilimitados; tarifado não paga)
- Suporte hora técnica (3CX): sem preço na planilha
- LDI (internacional): tabela informativa por país (aba "Plano LDI")
- Instalação: remota R$ 50,00 · presencial R$ 180,00 (do Jotform)

### Decisões da Seção 4 (2026-11-16)
- Smart Nuvem POS 1–3 e Flex Nuvem POS 1–3: DESCONTINUADOS (fora do formulário).
- Full Nuvem Ilimitado Partner 1–6: aparecem SÓ quando o preenchimento é de Revenda (qualquer revenda); vendedor Connect não vê.
- 0800: usar "Linhas 0800 Tarifado" 219,80 → 109,90 (o valor 285,94/142,97 está desatualizado). Tarifas de minuto do 0800 mantidas (0,21/0,49/0,49/0,49).
- DID/DDR adicional: manter 6,50 (12m/24m) e 12,00 (36m).
- URA Reversa, Siga-me, Suporte hora técnica: FORA por enquanto.
- Tarifas de minuto (Pós/Pré) e LDI: só consulta, preenchidas pelo plano.

## Painel de catálogo (editar planos, serviços e preços)
- Rota `/formulario/admin`, com o mesmo login do painel `/reports` (reaproveita `report-users` e a sessão de `src/reports/reports-panel.js`); só administradores.
- Catálogo salvo em JSON no volume persistente (`src/bot/data/catalogo-formulario.json`), carregado pelo formulário a cada acesso.
- Telas: Planos Neo Vox (nome, tipo Ilimitado/Pós/Pré, fidelidade, faixa de canais, preço cheio, tarifas de minuto, ativo/inativo); Licenças Neo Phone (preço por fidelidade); Serviços adicionais (nome, preço por fidelidade, se tem desconto, ativo/inativo); Preços especiais por revenda; Regras gerais (desconto %, ativação, instalação, CFOP); Vendedores e Revendas (nome, CNPJ, contatos, ID Bitrix).
- Preço com desconto calculado automaticamente (cheio × (1 − desconto)).
- Itens nunca são apagados: são desativados (o histórico de pedidos continua legível). Cada alteração grava quem mudou e quando.

## Seção 5 — Números adicionais e Portabilidade (2026-11-16)
- Números adicionais: "Deseja número adicional?" → quantidade → valor pela fidelidade (6,50 / 12,00).
- Portabilidade em BLOCOS REPETÍVEIS ("+ Adicionar portabilidade"), um por cidade/operadora. Cada bloco gera um CARD SEPARADO no Bitrix (hoje já dividem os cards por portabilidade); o card de portabilidade fica no MESMO pipeline do negócio principal (Vendas Diretas ou Revendas), com o mesmo responsável, e é vinculado ao negócio principal.
- Por bloco: cidade, UF, operadora de origem (lista: Vivo, Claro, TIM, Oi, Algar, Embratel, Outra → texto), números.
- Números: um campo por número, máscara (DD) XXXX-XXXX, botão "+ número". Opção "faixa em sequência" (primeiro e último) para blocos grandes.
- Titular atual: PF/PJ, botão "mesmos dados do cliente"; upload obrigatório da última fatura.
- Contato técnico da portabilidade: botão "Mesmo que o responsável técnico".
- Mantidos: aviso com as regras, R$ 9,50 por número, trava (total portado em todos os blocos ≤ linhas + adicionais).

## Regras globais de máscara e validação (2026-11-16)
Bloqueio no navegador E revalidação no servidor (o pedido não é enviado com dado inválido; o campo fica vermelho com a mensagem do erro).
- Telefone (TODOS os campos, inclusive números de portabilidade — um formato só, 9 dígitos): `+55 (61) 9 9999-9999` (DDI + DDD + número). DDI padrão +55; DDD validado (lista de DDDs brasileiros). Gravado no Bitrix só com dígitos, SEM "+" (ex.: 5561999999999).
- CPF: `000.000.000-00` com dígito verificador; rejeita sequências (111.111.111-11).
- CNPJ: `00.000.000/0000-00` com dígito verificador.
- E-mail: formato válido; avisa erros comuns de domínio (ex.: gmial.com, hotmal.com).
- Data: `DD/MM/AAAA`, data real; nascimento: maior de 18 anos e não futura; fundação: não futura.
- CEP: `00000-000`, consultado no ViaCEP (CEP inexistente é rejeitado).
- UF: lista das 27 UFs. DDD do CN: lista de DDDs válidos.
- Quantidades: só inteiros ≥ mínimo da regra (ex.: ramais ≥ 3).
- Valores em R$: calculados, somente leitura.
- Uploads: PDF, JPG ou PNG, até 10 MB por arquivo.

## Seção 6 — Escolha de produtos + Neo Phone (2026-11-16)
- "Quais produtos o cliente deseja?" (Linhas + Ramais / Só Linhas / Só Ramais) vem ANTES do Neo Vox; só aparecem as seções escolhidas, tudo num formulário só.
- Fidelidade ÚNICA para o contrato (vale para Neo Vox e Neo Phone), perguntada junto com a escolha de produtos.
- Neo Phone: mínimo de 3 ramais; licenças Essentials/Basic/Standard com quantidade; preço pela fidelidade com 50%.
- Gravação extra (1/2/5 anos): nº de pacotes ≤ licenças Basic + Standard (mensagem clara com a regra).
- Grupo Call Center: marcado e obrigatório automaticamente quando licenças Standard > 12.
- Discador automático: opcional.

### Complementos da Seção 6 (2026-11-16)
- Exceção à fidelidade única: Neo Vox Pré + Neo Phone é permitido — linhas Pré ficam sem fidelidade e a fidelidade escolhida vale só para os ramais.
- Escolha do plano Ilimitado simplificada: vendedor escolhe o TIPO (Full / Smart / Partner — Partner só para revendas) + quantidade de linhas; o formulário escolhe o plano 1–6 pela fidelidade e faixa (1–20 ou ≥21). Ex.: Full + 24 meses + 30 linhas → Full Nuvem Ilimitado 5. Tipos Pós e Pré: escolhe o plano direto (Pós pela fidelidade; Pré 1–6).

## Seção 7 — Conclusão do pedido (2026-11-16)
- Dia de vencimento: 1, 5, 10, 15, 20, 25, 28.
- Instalação: Remota (R$ 50,00) / Presencial (R$ 180,00, consultar disponibilidade).
- Observações do projeto.
- Endereço de instalação OBRIGATÓRIO em ambos os tipos de instalação; botão "Mesmo endereço de cobrança"; CEP via ViaCEP; complemento opcional.
- Tela de RESUMO antes de enviar: cliente, produtos, valor mensal, adesão (ativação + instalação), valor total do contrato; botões "Voltar e corrigir" / "Confirmar e enviar".
- Após enviar: resumo por E-MAIL para quem preencheu (vendedor ou revenda) — exige configurar um remetente SMTP (a definir) — e mensagem de sucesso com o link do card no Bitrix.

## Bitrix — levantamento (2026-11-16, somente leitura)
- Pipelines: **22 = Clientes - Vendas Diretas**; **0 = Clientes - Revendas**.
- Etapas candidatas de entrada: Vendas Diretas `C22:UC_5CXUV0` "Organizar Dados - Cliente Formulario"; Revendas `NEW` "Organizar Dados" (a confirmar).
- Tipos de empresa: existe `PARTNER = Parceiro` (usar para as revendas). Presets de requisito: 5 = PJ, 7 = PF.
- Negócios têm 801 campos personalizados, com vários conjuntos duplicados. O Jotform atual grava no conjunto `UF_CRM_65BBED…`/`UF_CRM_65BBEE…` (rótulos com sufixo "(Clientes …)"), p.ex.:
  - `UF_CRM_65BBEDE80F239` CNPJ do Cliente (PJ) · `UF_CRM_65BBEDE855B0F` Razão Social · `UF_CRM_65BBEDF251687` Nome Fantasia
  - `UF_CRM_1686082285035` CPF (PF) · `UF_CRM_1686082137262` Nome Completo (PF)
  - `UF_CRM_65BBEDE7A0185` CNPJ da Revenda · `UF_CRM_65BBEDEBBEDD9`/`…EC1AA28`/`…EC62635` responsável da revenda
  - Neo Vox `UF_CRM_65BBEDFB…`–`UF_CRM_65BBEE02…`; Neo Phone `UF_CRM_65BBEE0C…`–`UF_CRM_65BBEE14…`; instalação `UF_CRM_65BBEDE8…`–`UF_CRM_65BBEDEB…`.
- Proposta: REUTILIZAR esse mesmo conjunto (mantém modelos de contrato, relatórios e automações), criando só os campos novos necessários (ex.: "Revenda" vínculo com Empresa, sócios adicionais, blocos de portabilidade).

## Decisões de integração Bitrix (2026-11-16)
- REUTILIZAR o conjunto de campos do Jotform. Dados da revenda vão nos campos que JÁ EXISTEM (CNPJ da Revenda `UF_CRM_65BBEDE7A0185`, responsável nome/celular/e-mail `UF_CRM_65BBEDEBBEDD9`/`…EC1AA28`/`…EC62635`, Razão social da Revenda `UF_CRM_654165FAAE4A4`) — não criar campo novo de revenda. Criar só o que não existe (sócios adicionais, números por bloco de portabilidade, ID do pedido).
- Etapa de entrada: Vendas Diretas `C22:UC_5CXUV0` "Organizar Dados - Cliente Formulario"; Revendas `NEW` "Organizar Dados". CONFIRMADO.
- Lead encontrado por CPF/CNPJ → converter (lead convertido, ligado a contato/empresa/negócio).
- SEMPRE criar negócios novos (mesmo que o cliente já tenha negócio aberto). Um pedido gera VÁRIOS cards no mesmo pipeline e com o mesmo responsável:
  - 1 card Neo Vox (se houver linhas);
  - 1 card Neo Phone (se houver ramais);
  - 1 card por bloco de portabilidade (por estado/cidade/operadora).
  Todos com o mesmo "ID do pedido" e o mesmo contato/empresa, para ficarem ligados entre si.

## Pendência crítica: hospedagem
Sem acesso ao Easypanel (onde roda o bot). Opções em avaliação: recuperar o acesso ao servidor (VPS) ou hospedar em outro lugar.
- Decisão (2026-11-18): RECUPERAR o acesso ao Easypanel. Comando oficial (docs easypanel.io/docs/maintenance), executado via SSH/console da VPS:
  `docker run --rm -it -v /etc/easypanel:/etc/easypanel -v /var/run/docker.sock:/var/run/docker.sock:ro easypanel/easypanel reset-password`
  Painel em `http://<IP-da-VPS>:3000`. Pendente: identificar o provedor da VPS e o IP.

## Implementação (2026-11-18)
- Código em `src/pedidos/` (rotas em `router.js`, montadas em `/formulario` pelo `src/bot/bootstrap.js`).
  - `shared/` roda no navegador e no servidor: máscaras/validações, cálculo de preços, validação do pedido, resumo.
  - `catalogo-padrao.json` → copiado na 1ª execução para `src/bot/data/pedidos-catalogo.json` (volume persistente); histórico em `pedidos-catalogo.historico.jsonl`.
  - `bitrix-fields.js` (mapa de campos), `bitrix-order.js` (busca/cria cliente, cards, timeline, conversão do lead).
  - Pedidos enviados registrados em `src/bot/data/pedidos-enviados.jsonl`.
- Ligação entre cards do mesmo pedido: `ORIGINATOR_ID = formulario-pedidos`, `ORIGIN_ID = PED-AAAAMMDD-XXXXXX`, título "Pedido PED-… – <serviço> – <cliente>" e comentário na timeline com links para os outros cards.
- Lead: `LEAD_ID` do negócio é somente leitura na API; o lead é marcado CONVERTED, ligado ao contato/empresa e recebe comentário com os links dos cards.
- Premissas a confirmar: portabilidade cobrada uma vez (na adesão) — configurável no painel; ativação R$ 25/linha só nos planos Pré; inscrição municipal opcional.
- E-mail: variáveis `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `PEDIDOS_EMAIL_COPIA` (opcional). Sem `SMTP_HOST`, o e-mail fica desligado.
- Teste local sem Bitrix: `node src/pedidos/dev-server.js` (envio simulado; admin/teste1234).
