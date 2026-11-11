// Análise do catálogo: aponta pastas que podem ser excluídas ou fundidas e itens com dados faltando.
// Função pura sobre o snapshot de catalog-service.js — não chama o Bitrix24.

export function normalizeName(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Palavras que indicam algo intangível cadastrado como "Produto" em vez de "Serviço".
const SERVICE_HINTS = /\b(instala[cç][aã]o|configura[cç][aã]o|implanta[cç][aã]o|suporte|manuten[cç][aã]o|mensalidade|assinatura|licen[cç]a|plano|consultoria|treinamento|visita|hora t[eé]cnica|servi[cç]o|portabilidade|ativa[cç][aã]o|setup|franquia|minutos?)\b/i;

function cleanSpaces(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function isShouting(s) {
  const letters = String(s).replace(/[^A-Za-zÀ-ÿ]/g, '');
  return letters.length >= 6 && letters === letters.toUpperCase();
}

export function auditCatalog(snapshot) {
  const { sections, products } = snapshot;
  const findings = [];
  const add = f => findings.push({ id: `${f.kind}-${findings.length + 1}`, ...f });
  const sectionById = new Map(sections.map(s => [s.id, s]));

  // ─── Pastas ──────────────────────────────────────────────────────────────
  for (const s of sections) {
    if (s.totalCount === 0 && s.children.length === 0) {
      add({
        kind: 'empty_section', severity: 'alta', group: 'Pastas para excluir',
        title: `Pasta vazia: ${s.path.join(' › ')}`,
        detail: 'Não tem itens nem subpastas. Pode ser excluída sem perder nada.',
        targets: [{ type: 'section', id: s.id }],
        operations: [{ action: 'delete_section', sectionId: s.id, label: `Excluir a pasta vazia "${s.name}"` }],
      });
    } else if (s.totalCount === 0) {
      add({
        kind: 'empty_tree', severity: 'média', group: 'Pastas para excluir',
        title: `Pasta só com subpastas vazias: ${s.path.join(' › ')}`,
        detail: 'Nenhum item em toda a árvore. Exclua as subpastas vazias primeiro e depois esta.',
        targets: [{ type: 'section', id: s.id }],
        operations: [],
      });
    } else if (s.activeCount === 0) {
      add({
        kind: 'inactive_section', severity: 'média', group: 'Pastas para revisar',
        title: `Pasta só com itens inativos: ${s.path.join(' › ')}`,
        detail: `${s.totalCount} item(ns), nenhum ativo. Avalie arquivar (mover para uma pasta "Descontinuados") ou excluir.`,
        targets: [{ type: 'section', id: s.id }],
        operations: [],
      });
    } else if (s.totalCount === 1 && s.children.length === 0 && s.parentId) {
      add({
        kind: 'tiny_section', severity: 'baixa', group: 'Pastas para revisar',
        title: `Pasta com um único item: ${s.path.join(' › ')}`,
        detail: 'Subpasta com só um item costuma ser excesso de divisão. Avalie mover o item para a pasta-mãe.',
        targets: [{ type: 'section', id: s.id }],
        operations: [],
      });
    }
    if (s.depth > 3) {
      add({
        kind: 'deep_section', severity: 'baixa', group: 'Pastas para revisar',
        title: `Pasta muito profunda (${s.depth} níveis): ${s.path.join(' › ')}`,
        detail: 'Mais de 3 níveis dificulta achar o item na hora de montar a proposta. Prefira no máximo 2–3 níveis.',
        targets: [{ type: 'section', id: s.id }],
        operations: [],
      });
    }
    const clean = cleanSpaces(s.name);
    if (clean !== s.name) {
      add({
        kind: 'section_name_spaces', severity: 'baixa', group: 'Padronização de nomes',
        title: `Espaços sobrando no nome da pasta "${clean}"`,
        detail: 'Espaços duplos ou nas pontas.',
        targets: [{ type: 'section', id: s.id }],
        operations: [{ action: 'update_section', sectionId: s.id, name: clean, label: `Renomear pasta para "${clean}"` }],
      });
    }
  }

  // Pastas com o mesmo nome (ignorando acento/maiúsculas): candidatas a fusão.
  const sectionsByName = new Map();
  for (const s of sections) {
    const key = normalizeName(s.name);
    if (!key) continue;
    if (!sectionsByName.has(key)) sectionsByName.set(key, []);
    sectionsByName.get(key).push(s);
  }
  for (const group of sectionsByName.values()) {
    if (group.length < 2) continue;
    // Mantém a que tem mais itens; as outras são esvaziadas e excluídas.
    const sorted = [...group].sort((a, b) => b.totalCount - a.totalCount || a.id - b.id);
    const keep = sorted[0];
    const operations = [];
    for (const other of sorted.slice(1)) {
      for (const pid of other.productIds) {
        const p = products.find(x => x.id === pid);
        operations.push({ action: 'move_product', productId: pid, sectionId: keep.id, label: `Mover "${p?.name ?? pid}" para ${keep.path.join(' › ')}` });
      }
      for (const childId of other.children) {
        const c = sectionById.get(childId);
        operations.push({ action: 'update_section', sectionId: childId, parentId: keep.id, label: `Mover a subpasta "${c?.name ?? childId}" para ${keep.path.join(' › ')}` });
      }
      operations.push({ action: 'delete_section', sectionId: other.id, label: `Excluir a pasta duplicada ${other.path.join(' › ')} (depois de esvaziada)` });
    }
    add({
      kind: 'duplicate_section', severity: 'alta', group: 'Pastas para fundir',
      title: `Pastas duplicadas: "${keep.name}" (${group.length}x)`,
      detail: `Mesma pasta em ${group.map(s => s.path.join(' › ')).join(' | ')}. Sugestão: manter ${keep.path.join(' › ')} (${keep.totalCount} itens) e trazer o resto para ela.`,
      targets: group.map(s => ({ type: 'section', id: s.id })),
      operations,
    });
  }

  // ─── Itens ───────────────────────────────────────────────────────────────
  const active = products.filter(p => p.active && p.type !== 4);

  const noSection = active.filter(p => !p.sectionId);
  if (noSection.length) {
    add({
      kind: 'no_section', severity: 'alta', group: 'Itens para organizar',
      title: `${noSection.length} item(ns) ativo(s) fora de qualquer pasta`,
      detail: 'Ficam soltos na raiz do catálogo. Peça ao assistente para sugerir a pasta de cada um.',
      targets: noSection.map(p => ({ type: 'product', id: p.id })),
      operations: [],
    });
  }

  const noPrice = active.filter(p => p.type !== 3 && (p.price === null || p.price === 0));
  if (noPrice.length) {
    add({
      kind: 'no_price', severity: 'alta', group: 'Itens com dados faltando',
      title: `${noPrice.length} item(ns) ativo(s) sem preço de venda`,
      detail: 'Sem preço base o item entra zerado nos negócios e propostas do CRM.',
      targets: noPrice.map(p => ({ type: 'product', id: p.id })),
      operations: [],
    });
  }

  const noDescription = active.filter(p => !cleanSpaces(p.description));
  if (noDescription.length) {
    add({
      kind: 'no_description', severity: 'média', group: 'Itens com dados faltando',
      title: `${noDescription.length} item(ns) ativo(s) sem descrição`,
      detail: 'A descrição deixa claro para que serve o item, o que inclui e como é cobrado. O assistente pode redigir.',
      targets: noDescription.map(p => ({ type: 'product', id: p.id })),
      operations: [],
    });
  }

  const productsByName = new Map();
  for (const p of active) {
    const key = normalizeName(p.name);
    if (!key) continue;
    if (!productsByName.has(key)) productsByName.set(key, []);
    productsByName.get(key).push(p);
  }
  for (const group of productsByName.values()) {
    if (group.length < 2) continue;
    add({
      kind: 'duplicate_product', severity: 'alta', group: 'Itens duplicados',
      title: `Item duplicado: "${group[0].name}" (${group.length}x)`,
      detail: group.map(p => `#${p.id} ${p.sectionPath.join(' › ') || '(sem pasta)'} — ${p.price ?? 'sem preço'} ${p.currency ?? ''}`).join(' | ') +
        '. Mantenha um e desative os outros (desativar não afeta negócios antigos; excluir pode afetar).',
      targets: group.map(p => ({ type: 'product', id: p.id })),
      operations: group
        .slice(1)
        .map(p => ({ action: 'update_product', productId: p.id, fields: { active: false }, label: `Desativar a cópia #${p.id} "${p.name}"` })),
    });
  }

  const serviceLike = active.filter(p => p.type === 1 && SERVICE_HINTS.test(p.name));
  if (serviceLike.length) {
    add({
      kind: 'service_as_product', severity: 'baixa', group: 'Tipo do item',
      title: `${serviceLike.length} item(ns) com cara de serviço cadastrado(s) como produto`,
      detail: 'Serviços (tipo 7) não controlam estoque e ficam separados no CRM. O Bitrix24 não troca o tipo de um item existente: se fizer sentido, crie o serviço e desative o produto antigo.',
      targets: serviceLike.map(p => ({ type: 'product', id: p.id })),
      operations: [],
    });
  }

  for (const p of products) {
    const clean = cleanSpaces(p.name);
    if (clean !== p.name) {
      add({
        kind: 'product_name_spaces', severity: 'baixa', group: 'Padronização de nomes',
        title: `Espaços sobrando no nome "${clean}"`,
        detail: 'Espaços duplos ou nas pontas atrapalham a busca.',
        targets: [{ type: 'product', id: p.id }],
        operations: [{ action: 'update_product', productId: p.id, fields: { name: clean }, label: `Renomear #${p.id} para "${clean}"` }],
      });
    }
  }
  const shouting = active.filter(p => isShouting(p.name));
  if (shouting.length) {
    add({
      kind: 'uppercase_names', severity: 'baixa', group: 'Padronização de nomes',
      title: `${shouting.length} nome(s) todo(s) em maiúsculas`,
      detail: 'Prefira "Primeira letra maiúscula" para leitura na proposta. O assistente pode sugerir os nomes.',
      targets: shouting.map(p => ({ type: 'product', id: p.id })),
      operations: [],
    });
  }

  const inactive = products.filter(p => !p.active);
  if (inactive.length) {
    add({
      kind: 'inactive_products', severity: 'baixa', group: 'Itens para revisar',
      title: `${inactive.length} item(ns) inativo(s)`,
      detail: 'Não aparecem para vender, mas poluem a lista. Junte-os numa pasta "Descontinuados" ou exclua os que nunca foram usados.',
      targets: inactive.map(p => ({ type: 'product', id: p.id })),
      operations: [],
    });
  }

  const rank = { alta: 0, 'média': 1, baixa: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  const byType = {};
  for (const p of products) byType[p.typeLabel] = (byType[p.typeLabel] ?? 0) + 1;

  return {
    stats: {
      sections: sections.length,
      emptySections: sections.filter(s => s.totalCount === 0).length,
      products: products.length,
      activeProducts: products.filter(p => p.active).length,
      services: products.filter(p => p.type === 7).length,
      withoutPrice: noPrice.length,
      withoutSection: noSection.length,
      byType,
    },
    findings,
  };
}
