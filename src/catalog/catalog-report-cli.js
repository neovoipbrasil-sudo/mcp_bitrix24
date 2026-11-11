#!/usr/bin/env node
// Leitura completa do catálogo + diagnóstico, em Markdown (ou JSON com --json).
//   B24_DEFAULT_WEBHOOK=https://<portal>/rest/<id>/<token>/ node src/catalog/catalog-report-cli.js > catalogo.md
//   node src/catalog/catalog-report-cli.js --json > catalogo.json
import { fileURLToPath } from 'url';
import { Bitrix24Client } from '../bitrix24/client.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';
import { createCatalogService } from './catalog-service.js';
import { auditCatalog } from './catalog-audit.js';

const money = (v, cur) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur ?? ''}`.trim());
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export function renderMarkdown(snapshot, audit) {
  const out = [];
  const s = audit.stats;
  out.push(`# Catálogo de produtos e serviços — leitura de ${new Date(snapshot.loadedAt).toLocaleString('pt-BR')}`, '');
  out.push(`- **${s.sections}** pastas (${s.emptySections} vazias)`);
  out.push(`- **${s.products}** itens, **${s.activeProducts}** ativos, **${s.services}** serviços`);
  out.push(`- Por tipo: ${Object.entries(s.byType).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  out.push(`- **${s.withoutPrice}** itens ativos sem preço · **${s.withoutSection}** ativos sem pasta`);
  out.push(`- Tipos de preço: ${snapshot.priceTypes.map(t => `${t.name}${t.base ? ' (base)' : ''}`).join(', ') || '—'}`, '');

  out.push('## Pastas', '', '| ID | Pasta | Itens (ativos/total) | Subpastas |', '|---:|---|---:|---:|');
  for (const sec of [...snapshot.sections].sort((a, b) => a.path.join('/').localeCompare(b.path.join('/'), 'pt-BR'))) {
    out.push(`| ${sec.id} | ${cell(sec.path.join(' › '))} | ${sec.activeCount}/${sec.totalCount} | ${sec.children.length} |`);
  }
  out.push('');

  out.push('## Diagnóstico', '');
  if (!audit.findings.length) out.push('Nenhum problema encontrado.', '');
  let group = null;
  for (const f of audit.findings.slice().sort((a, b) => a.group.localeCompare(b.group, 'pt-BR'))) {
    if (f.group !== group) {
      group = f.group;
      out.push(`### ${group}`, '');
    }
    out.push(`- **[${f.severity}] ${f.title}** — ${f.detail}`);
    for (const op of f.operations.slice(0, 20)) out.push(`  - sugestão: ${op.label}`);
    if (f.operations.length > 20) out.push(`  - … mais ${f.operations.length - 20} sugestões`);
  }
  out.push('');

  out.push('## Itens', '', '| ID | Nome | Tipo | Pasta | Preço | Ativo | Descrição |', '|---:|---|---|---|---:|:---:|---|');
  for (const p of [...snapshot.products].filter(p => p.type !== 4).sort((a, b) => a.sectionPath.join('/').localeCompare(b.sectionPath.join('/'), 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'))) {
    out.push(`| ${p.id} | ${cell(p.name)} | ${p.typeLabel} | ${cell(p.sectionPath.join(' › ') || '—')} | ${money(p.price, p.currency)} | ${p.active ? 'sim' : 'não'} | ${cell(p.description).slice(0, 120)} |`);
  }
  return out.join('\n') + '\n';
}

async function main() {
  const json = process.argv.includes('--json');
  const service = createCatalogService({ client: new Bitrix24Client(resolveWebhook()) });
  const snapshot = await service.getSnapshot();
  const audit = auditCatalog(snapshot);
  process.stdout.write(json ? JSON.stringify({ snapshot, audit }, null, 2) : renderMarkdown(snapshot, audit));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err.response?.data?.error_description || err.message);
    process.exit(1);
  });
}
