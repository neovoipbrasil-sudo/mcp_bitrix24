import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createFakeCatalogClient } from './fake-portal.js';
import { createCatalogService, listAll } from './catalog-service.js';
import { auditCatalog } from './catalog-audit.js';
import { createCatalogAgent } from './catalog-agent.js';
import { createCatalogPanel } from './catalog-panel.js';
import { renderMarkdown } from './catalog-report-cli.js';
import { createReportUserStore } from '../reports/report-users.js';
import { createReportsPanel } from '../reports/reports-panel.js';

let client, service;
beforeEach(() => {
  client = createFakeCatalogClient();
  service = createCatalogService({ client });
});

describe('listAll', () => {
  it('pages through result.<key> 50 at a time', async () => {
    const items = Array.from({ length: 120 }, (_, i) => ({ id: i + 1 }));
    const calls = [];
    const fake = { call: async (m, p) => { calls.push(p.start); return { result: { things: items.slice(p.start, p.start + 50) }, total: items.length }; } };
    expect(await listAll(fake, 'x.list', {}, 'things')).toHaveLength(120);
    expect(calls).toEqual([0, 50, 100]);
  });
});

describe('catalog snapshot', () => {
  it('builds folder paths, recursive counts, base prices and variation counts', async () => {
    const snap = await service.getSnapshot();
    const telefonia = snap.sections.find(s => s.id === 1);
    expect(telefonia.totalCount).toBe(2); // 102 direto + 101 em PABX
    expect(snap.sections.find(s => s.id === 2).path).toEqual(['Telefonia', 'PABX']);
    const ramal = snap.products.find(p => p.id === 101);
    expect(ramal).toMatchObject({ typeLabel: 'Serviço', price: 39.9, currency: 'BRL', sectionPath: ['Telefonia', 'PABX'] });
    expect(snap.products.find(p => p.id === 108).variations).toBe(2);
    expect(client.calls.find(c => c.method === 'catalog.product.list').params.filter).toEqual({ iblockId: 14 });
  });

  it('caches the snapshot until forced', async () => {
    await service.getSnapshot();
    await service.getSnapshot();
    expect(client.calls.filter(c => c.method === 'catalog.catalog.list')).toHaveLength(1);
    await service.getSnapshot({ force: true });
    expect(client.calls.filter(c => c.method === 'catalog.catalog.list')).toHaveLength(2);
  });
});

describe('catalog audit', () => {
  it('flags empty, duplicate and inactive-only folders and item problems', async () => {
    const { findings, stats } = auditCatalog(await service.getSnapshot());
    const kinds = findings.map(f => f.kind);
    expect(stats.emptySections).toBe(1);
    expect(findings.find(f => f.kind === 'empty_section').targets).toEqual([{ type: 'section', id: 5 }]);
    const dup = findings.find(f => f.kind === 'duplicate_section');
    expect(dup.targets.map(t => t.id).sort()).toEqual([3, 4]);
    // mantém a pasta 3 (mais itens) e esvazia a 4 antes de excluí-la
    expect(dup.operations.map(o => o.action)).toEqual(['move_product', 'move_product', 'delete_section']);
    expect(dup.operations.at(-1).sectionId).toBe(4);
    expect(kinds).toContain('inactive_section');
    expect(kinds).toContain('duplicate_product');
    expect(kinds).toContain('no_section');
    expect(findings.find(f => f.kind === 'no_price').targets.map(t => t.id)).toEqual([102, 104]);
    expect(findings.find(f => f.kind === 'service_as_product').targets.map(t => t.id)).toEqual([102]);
    expect(findings.find(f => f.kind === 'product_name_spaces').operations[0].fields.name).toBe('Telefone IP Intelbras V3501');
    expect(findings[0].severity).toBe('alta');
  });
});

describe('applyOperations', () => {
  it('refuses to delete a folder that still has items (Bitrix would delete them too)', async () => {
    const [r] = await service.applyOperations([{ action: 'delete_section', sectionId: 4 }]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/apaga tudo/);
    expect(client.calls.some(c => c.method === 'catalog.section.delete')).toBe(false);
  });

  it('runs a duplicate-folder merge in order: moves items, then deletes the emptied folder', async () => {
    const { findings } = auditCatalog(await service.getSnapshot());
    const ops = findings.find(f => f.kind === 'duplicate_section').operations;
    const results = await service.applyOperations(ops);
    expect(results.every(r => r.ok)).toBe(true);
    expect(client.data.sections.some(s => s.id === 4)).toBe(false);
    expect(client.data.products.filter(p => p.iblockSectionId === 3).map(p => p.id).sort()).toEqual([103, 104, 105, 108]);
  });

  it('uses the right method per item type and updates or adds the base price', async () => {
    await service.applyOperations([
      { action: 'update_product', productId: 101, fields: { name: 'PABX em Nuvem — Ramal', description: 'Função: ramal | Cobrança: mensal' } },
      { action: 'set_price', productId: 101, price: 44.9 },
      { action: 'set_price', productId: 102, price: 350 },
    ]);
    const upd = client.calls.find(c => c.method === 'catalog.product.service.update');
    expect(upd.params).toEqual({ id: 101, fields: { name: 'PABX em Nuvem — Ramal', previewText: 'Função: ramal | Cobrança: mensal', previewTextType: 'text' } });
    expect(client.calls.find(c => c.method === 'catalog.price.update').params).toEqual({ id: 1, fields: { price: 44.9, currency: 'BRL' } });
    expect(client.calls.find(c => c.method === 'catalog.price.add').params.fields).toEqual({ productId: 102, catalogGroupId: 1, price: 350, currency: 'BRL' });
  });

  it('lets a plan create a folder and move items into it via tempId', async () => {
    const results = await service.applyOperations([
      { action: 'create_section', tempId: 'servicos', name: 'Serviços Técnicos' },
      { action: 'move_product', productId: 102, sectionTempId: 'servicos' },
      { action: 'create_product', kind: 'service', name: 'Visita técnica', sectionTempId: 'servicos', price: 120 },
    ]);
    expect(results.map(r => r.ok)).toEqual([true, true, true]);
    const newId = results[0].sectionId;
    expect(client.data.products.find(p => p.id === 102).iblockSectionId).toBe(newId);
    const visita = client.data.products.find(p => p.name === 'Visita técnica');
    expect(visita).toMatchObject({ type: 7, iblockSectionId: newId, iblockId: 14 });
    expect(client.data.prices.find(p => p.productId === visita.id).price).toBe(120);
  });

  it('reports a failure without stopping the rest of the plan', async () => {
    const results = await service.applyOperations([{ action: 'update_product', productId: 999, fields: { name: 'x' } }, { action: 'update_product', productId: 103, fields: { active: false } }]);
    expect(results.map(r => r.ok)).toEqual([false, true]);
    expect(client.data.products.find(p => p.id === 103).active).toBe('N');
  });
});

function fakeAnthropic(script) {
  const requests = [];
  return {
    requests,
    messages: {
      async create(req) {
        requests.push(JSON.parse(JSON.stringify(req)));
        return script.shift()(req);
      },
    },
  };
}

describe('catalog agent', () => {
  it('reads the catalog with tools and returns proposals without applying them', async () => {
    const anthropic = fakeAnthropic([
      () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'search_products', input: { query: 'telefone ip' } }] }),
      req => {
        const result = JSON.parse(req.messages.at(-1).content[0].content);
        expect(result.items.map(i => i.id)).toEqual([103, 105]);
        return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't2', name: 'propose_changes', input: { title: 'Desativar duplicado', operations: [{ action: 'update_product', productId: 105, fields: { active: false }, label: 'Desativar #105' }] } }] };
      },
      () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Propus desativar o **#105**.' }] }),
    ]);
    const agent = createCatalogAgent({ anthropic, catalogService: service, model: 'test-model' });
    const out = await agent.chat({ message: 'tem item duplicado?', history: [{ role: 'assistant', content: 'oi' }, { role: 'user', content: 'antes' }, { role: 'assistant', content: 'ok' }] });
    expect(out.reply).toContain('#105');
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0].operations[0].productId).toBe(105);
    expect(client.calls.some(c => c.method.endsWith('.update'))).toBe(false);
    // histórico começa sempre com mensagem do usuário
    expect(anthropic.requests[0].messages[0]).toEqual({ role: 'user', content: 'antes' });
    expect(anthropic.requests[0].model).toBe('test-model');
  });
});

describe('catalog panel', () => {
  let app, store;
  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-panel-'));
    store = createReportUserStore({ filePath: path.join(dir, 'users.json') });
    const agent = { chat: async ({ message }) => ({ reply: `eco: ${message}`, proposals: [] }) };
    const logged = [];
    app = express();
    app.locals.logged = logged;
    app.use('/reports', createReportsPanel({
      userStore: store,
      reportsDir: path.join(dir, 'reports'),
      extraPages: [{ path: '/catalogo', label: 'Catálogo', router: createCatalogPanel({ catalogService: service, catalogAgent: agent, auditLog: { logAction: e => logged.push(e) } }) }],
    }));
  });

  async function loginAs(username, role) {
    store.create({ username, password: 'inicial-123', role });
    store.changePassword(username, 'inicial-123', 'senha-certa-1');
    const agent = request.agent(app);
    await agent.post('/reports/login').type('form').send({ username, password: 'senha-certa-1' });
    return agent;
  }

  it('requires login', async () => {
    const res = await request(app).get('/reports/catalogo/api/data');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/reports\/login/);
  });

  it('serves the UI, the data and a nav link on the reports pages', async () => {
    const agent = await loginAs('ana', 'viewer');
    expect((await agent.get('/reports/')).text).toContain('href="/reports/catalogo"');
    expect((await agent.get('/reports/catalogo/')).text).toContain('Catálogo de produtos e serviços');
    const data = await agent.get('/reports/catalogo/api/data');
    expect(data.body.snapshot.products).toHaveLength(8);
    expect(data.body.audit.findings.length).toBeGreaterThan(0);
    expect(data.body.user).toEqual({ username: 'ana', canEdit: false });
    expect((await agent.post('/reports/catalogo/api/chat').send({ message: 'oi' })).body.reply).toBe('eco: oi');
  });

  it('only lets admins apply changes, and logs who did it', async () => {
    const viewer = await loginAs('ana', 'viewer');
    expect((await viewer.post('/reports/catalogo/api/apply').send({ operations: [{ action: 'delete_section', sectionId: 5 }] })).status).toBe(403);
    const admin = await loginAs('chefe', 'admin');
    const res = await admin.post('/reports/catalogo/api/apply').send({ operations: [{ action: 'delete_section', sectionId: 5 }] });
    expect(res.body.results[0].ok).toBe(true);
    expect(client.data.sections.some(s => s.id === 5)).toBe(false);
    expect(app.locals.logged[0]).toMatchObject({ userId: 'reports:chefe', tool: 'catalog.delete_section', result: 'ok' });
  });

  it('rejects cross-origin POSTs', async () => {
    const admin = await loginAs('chefe', 'admin');
    const res = await admin.post('/reports/catalogo/api/apply').set('Origin', 'https://evil.example').send({ operations: [{ action: 'delete_section', sectionId: 5 }] });
    expect(res.status).toBe(403);
  });
});

describe('markdown report', () => {
  it('lists folders, findings and items', async () => {
    const snap = await service.getSnapshot();
    const md = renderMarkdown(snap, auditCatalog(snap));
    expect(md).toContain('| 2 | Telefonia › PABX | 1/1 | 0 |');
    expect(md).toContain('Pastas duplicadas');
    expect(md).toContain('| 101 | PABX em Nuvem - Ramal | Serviço |');
  });
});
