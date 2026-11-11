import { auditCatalog, normalizeName } from './catalog-audit.js';

// Assistente de IA do painel de catálogo. Ele lê o catálogo com ferramentas próprias e, para mudar
// qualquer coisa, só PROPÕE operações (propose_changes). Quem aplica é a pessoa, pela interface.

const MAX_TOOL_ROUNDS = 12;
const MAX_HISTORY = 20;

const OPERATION_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['update_product', 'move_product', 'set_price', 'create_section', 'update_section', 'delete_section', 'create_product', 'delete_product'],
    },
    label: { type: 'string', description: 'Frase curta em português explicando a mudança, ex.: "Mover PABX Virtual para Telefonia em Nuvem".' },
    productId: { type: 'integer', description: 'ID do item (update_product, move_product, set_price, delete_product).' },
    sectionId: { type: 'integer', description: 'ID da pasta (update_section, delete_section) ou pasta de destino (move_product, create_product).' },
    sectionTempId: { type: 'string', description: 'Pasta de destino criada neste mesmo plano (tempId de um create_section anterior).' },
    tempId: { type: 'string', description: 'create_section: apelido para referenciar a pasta nova em operações seguintes, ex.: "nova-telefonia".' },
    parentId: { type: 'integer', description: 'create_section/update_section: pasta-mãe (0 = raiz).' },
    parentTempId: { type: 'string', description: 'create_section/update_section: pasta-mãe criada neste plano.' },
    name: { type: 'string', description: 'create_section/update_section/create_product: nome.' },
    description: { type: 'string', description: 'create_section/create_product: descrição.' },
    kind: { type: 'string', enum: ['product', 'service'], description: 'create_product: produto físico ou serviço.' },
    price: { type: 'number', description: 'set_price/create_product: preço de venda (preço base).' },
    currency: { type: 'string', description: 'Moeda, ex.: BRL.' },
    sort: { type: 'integer', description: 'Ordem de exibição (menor aparece primeiro).' },
    fields: {
      type: 'object',
      description: 'update_product: campos a mudar.',
      properties: {
        name: { type: 'string' },
        description: { type: 'string', description: 'Descrição curta (aparece na proposta).' },
        detailText: { type: 'string', description: 'Descrição detalhada.' },
        active: { type: 'boolean' },
        sectionId: { type: 'integer' },
        sort: { type: 'integer' },
      },
    },
  },
  required: ['action', 'label'],
};

export const CATALOG_AGENT_TOOLS = [
  {
    name: 'get_catalog_overview',
    description: 'Resumo do catálogo: números gerais, tipos de preço, unidades e a árvore de pastas com ID, caminho e quantidade de itens (total e ativos). Comece por aqui.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_audit',
    description: 'Problemas encontrados automaticamente: pastas vazias/duplicadas (candidatas a excluir ou fundir), itens sem preço, sem pasta, sem descrição, duplicados, nomes fora do padrão.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_products',
    description: 'Busca itens do catálogo. Sem filtros, lista todos (paginado). Retorna id, nome, tipo, pasta, preço, ativo e descrição resumida.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Trecho do nome (ignora acentos e maiúsculas).' },
        sectionId: { type: 'integer', description: 'Só itens desta pasta (0 = sem pasta).' },
        includeSubsections: { type: 'boolean', description: 'Com sectionId, inclui as subpastas. Padrão: true.' },
        type: { type: 'string', enum: ['product', 'service', 'sku', 'any'] },
        status: { type: 'string', enum: ['active', 'inactive', 'any'] },
        offset: { type: 'integer' },
        limit: { type: 'integer', description: 'Máximo 200. Padrão 100.' },
      },
    },
  },
  {
    name: 'get_product',
    description: 'Todos os dados de um item: descrições completas, preços, unidade, datas.',
    input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
  },
  {
    name: 'propose_changes',
    description: 'Propõe mudanças no catálogo para a pessoa revisar e aplicar na interface. NÃO executa nada. Use sempre que for alterar, criar, mover, renomear, reprecificar ou excluir. Pode mandar dezenas de operações num plano só, na ordem em que devem ser aplicadas (crie pastas antes de mover itens para elas; esvazie pastas antes de excluí-las).',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título do plano, ex.: "Reorganização das pastas de telefonia".' },
        summary: { type: 'string', description: 'Por que essas mudanças, em 1–3 frases.' },
        operations: { type: 'array', items: OPERATION_SCHEMA },
      },
      required: ['title', 'operations'],
    },
  },
];

export const CATALOG_AGENT_SYSTEM = `Você é o assistente de catálogo da Neo Voip dentro do Bitrix24. Ajuda a equipe a organizar, revisar e editar os produtos e serviços do Catálogo Comercial. Fale em português do Brasil, de forma direta e calorosa.

Como o catálogo do Bitrix24 funciona (siga isso à risca):
- Pastas são "seções" em árvore. Um item fica numa pasta principal.
- EXCLUIR UMA PASTA NO BITRIX24 APAGA AS SUBPASTAS E OS ITENS DELA, sem volta. Por isso: nunca proponha delete_section de pasta com conteúdo sem antes mover tudo para outro lugar no mesmo plano. O sistema também bloqueia isso.
- Tipos de item: Produto (físico, tipo 1), Produto com variações (3), Variação (4), Serviço (7, intangível: instalação, mensalidade, suporte, licença). O tipo de um item existente não pode ser trocado; para "virar serviço", crie o serviço novo e desative o produto antigo.
- O preço de venda é o preço base (set_price). Ele é o que entra nos negócios e propostas do CRM.
- Desativar (active=false) esconde o item para venda sem afetar negócios antigos. Prefira desativar a excluir; proponha exclusão só de item claramente lixo/duplicado e avise o risco.

Boas práticas de organização que você deve propor e aplicar:
- No máximo 2 a 3 níveis de pastas, com nomes curtos que digam a família do item. Uma estrutura comum para operadora de telefonia/VoIP é: Telefonia em Nuvem (PABX/ramais), Números e Linhas (DID, 0800, 4004, portabilidade), Planos e Pacotes de Minutos, Equipamentos (aparelhos IP, headsets, ATAs, gateways), Serviços Técnicos (instalação, configuração, visita, suporte), Integrações e Software (CRM, URA, gravação, atendimento por chat), Descontinuados. Use isso só como ponto de partida: adapte aos itens que existem de verdade e não crie pasta que ficaria vazia.
- Nome do item: claro e consistente, "Primeira letra maiúscula", com a variante no fim. Ex.: "PABX em Nuvem — Ramal adicional", "Telefone IP Intelbras V3501". Sem códigos internos no nome quando houver campo para isso.
- Descrição curta no formato: "Função: … | Inclui: … | Cobrança: mensal/única/por uso". Não invente característica técnica ou preço: se não souber, pergunte ou deixe marcado para a equipe completar.
- Pastas vazias, duplicadas ou com um único item são candidatas a excluir ou fundir.

Como trabalhar:
- Consulte os dados com as ferramentas antes de responder; não invente IDs, nomes ou preços.
- Para qualquer mudança, chame propose_changes com operações concretas (IDs reais). Depois explique em poucas linhas o que propôs. Nunca diga que já aplicou: a pessoa revisa e aplica pela interface.
- Planos grandes são bem-vindos (por exemplo, reorganizar o catálogo inteiro), mas mantenha cada operação com um "label" claro.
- Ao listar dados use **negrito** para nomes e números importantes e listas com "-". Seja conciso.`;

function compactProduct(p) {
  return {
    id: p.id,
    name: p.name,
    type: p.typeLabel,
    active: p.active,
    sectionId: p.sectionId,
    section: p.sectionPath.join(' › ') || null,
    price: p.price,
    currency: p.currency,
    description: p.description ? p.description.slice(0, 160) : '',
  };
}

export function runCatalogTool(name, input, snapshot) {
  switch (name) {
    case 'get_catalog_overview': {
      const { stats } = auditCatalog(snapshot);
      return {
        stats,
        catalogs: snapshot.catalogs,
        priceTypes: snapshot.priceTypes,
        baseCurrency: snapshot.baseCurrency,
        measures: snapshot.measures.map(m => `${m.id}: ${m.title} (${m.symbol})`),
        sections: [...snapshot.sections]
          .sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')))
          .map(s => ({ id: s.id, parentId: s.parentId, path: s.path.join(' › '), items: s.totalCount, activeItems: s.activeCount, subfolders: s.children.length })),
        itemsWithoutSection: snapshot.products.filter(p => !p.sectionId).length,
      };
    }
    case 'get_audit': {
      const { stats, findings } = auditCatalog(snapshot);
      return {
        stats,
        findings: findings.map(f => ({
          group: f.group,
          severity: f.severity,
          title: f.title,
          detail: f.detail,
          targets: f.targets.slice(0, 60),
          suggestedOperations: f.operations.length,
        })),
      };
    }
    case 'search_products': {
      const q = normalizeName(input.query ?? '');
      let sectionIds = null;
      if (input.sectionId !== undefined && input.sectionId !== null) {
        if (Number(input.sectionId) === 0) sectionIds = new Set([null]);
        else {
          sectionIds = new Set([Number(input.sectionId)]);
          if (input.includeSubsections !== false) {
            const stack = [Number(input.sectionId)];
            while (stack.length) {
              const s = snapshot.sections.find(x => x.id === stack.pop());
              for (const c of s?.children ?? []) if (!sectionIds.has(c)) { sectionIds.add(c); stack.push(c); }
            }
          }
        }
      }
      const typeFilter = { product: [1, 2], service: [7], sku: [3, 4] }[input.type];
      const all = snapshot.products.filter(p =>
        (!q || normalizeName(p.name).includes(q)) &&
        (!sectionIds || sectionIds.has(p.sectionId ?? null)) &&
        (!typeFilter || typeFilter.includes(p.type)) &&
        (input.status === 'inactive' ? !p.active : input.status === 'any' ? true : input.status === 'active' ? p.active : true)
      );
      const offset = Math.max(0, Number(input.offset) || 0);
      const limit = Math.min(200, Math.max(1, Number(input.limit) || 100));
      return { total: all.length, offset, items: all.slice(offset, offset + limit).map(compactProduct) };
    }
    case 'get_product': {
      const p = snapshot.products.find(x => x.id === Number(input.id));
      return p ?? { error: `Item ${input.id} não encontrado.` };
    }
    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const clean = history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }))
    .slice(-MAX_HISTORY);
  while (clean.length && clean[0].role !== 'user') clean.shift();
  return clean;
}

export function createCatalogAgent({ anthropic, catalogService, model = process.env.CATALOG_AGENT_MODEL || 'claude-opus-5-5', maxTokens = 16000 }) {
  async function chat({ message, history = [] }) {
    if (!message || !String(message).trim()) throw new Error('Mensagem vazia.');
    const snapshot = await catalogService.getSnapshot();
    const messages = [...sanitizeHistory(history), { role: 'user', content: String(message).slice(0, 8000) }];
    const proposals = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: CATALOG_AGENT_SYSTEM,
        tools: CATALOG_AGENT_TOOLS,
        messages,
      });

      const toolUses = response.content.filter(b => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        if (response.stop_reason === 'refusal') return { reply: 'Não consegui ajudar com esse pedido. Tente reformular.', proposals };
        return { reply: text || (proposals.length ? 'Preparei a proposta abaixo para você revisar.' : '(sem resposta)'), proposals };
      }

      messages.push({ role: 'assistant', content: response.content });
      const results = toolUses.map(block => {
        let result;
        if (block.name === 'propose_changes') {
          const ops = Array.isArray(block.input?.operations) ? block.input.operations : [];
          proposals.push({ title: block.input?.title || 'Proposta de alteração', summary: block.input?.summary || '', operations: ops });
          result = { ok: true, message: `Proposta com ${ops.length} operação(ões) enviada para a pessoa revisar. Ela ainda não foi aplicada.` };
        } else {
          try {
            result = runCatalogTool(block.name, block.input ?? {}, snapshot);
          } catch (err) {
            result = { error: err.message };
          }
        }
        return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) };
      });
      messages.push({ role: 'user', content: results });
    }

    return { reply: 'Parei aqui porque a análise ficou longa demais. Peça uma parte do catálogo por vez (por exemplo, uma pasta).', proposals };
  }

  return { chat };
}
