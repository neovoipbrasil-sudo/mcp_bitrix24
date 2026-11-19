import { describe, it, expect, vi } from 'vitest';
import { readFileSync, mkdtempSync } from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { isValidCPF, isValidCNPJ, isValidPhone, mask, phoneDigits, validateValue, isValidDate } from './shared/validators.js';
import { calcularPedido, resolverPlanoVox, contarNumerosPortabilidade, tiposVoxDisponiveis } from './shared/pricing.js';
import { validarPedido } from './shared/validate-order.js';
import { createCatalogStore } from './catalog-store.js';
import { createPedidosRouter } from './router.js';
import { enviarPedidoAoBitrix } from './bitrix-order.js';
import { F } from './bitrix-fields.js';

// Pessoas fictícias: o catálogo padrão não traz vendedores/revendas reais (repositório público).
const catalogo = {
  ...JSON.parse(readFileSync(new URL('./catalogo-padrao.json', import.meta.url), 'utf-8')),
  vendedores: [{ id: 'v1', nome: 'Vendedor Teste', email: 'vendedor@exemplo.com.br', celular: '5561900000001', bitrixUserId: 762, ativo: true }],
  revendas: [{ id: 'r1', nome: 'Revenda Teste', cnpj: '11222333000181', email: 'revenda@exemplo.com.br', celular: '5561900000002', responsavelNome: 'Gerente', bitrixUserId: 500, ativo: true }],
  precosEspeciais: [{ revendaCnpj: '11222333000181', planoId: 'pre-1', preco: 39.9 }],
};
const arquivo = [{ nome: 'doc.pdf', tipo: 'application/pdf', base64: Buffer.from('%PDF-1.4 teste').toString('base64') }];
const end = { cep: '70714-020', logradouro: 'SCN Quadra 4', numero: '702', complemento: '', bairro: 'Asa Norte', cidade: 'Brasília', uf: 'DF' };
const pess = (n) => ({ nome: n, celular: '+55 (61) 9 9999-0000', email: 'teste@empresa.com.br' });

function pedidoPJ(over = {}) {
  return {
    origem: { tipo: 'vendedor', id: 'v1', nome: 'Vendedor Teste', email: 'vendedor@exemplo.com.br', celular: '5561900000001', cnpj: '' },
    cliente: {
      tipo: 'PJ',
      pj: { cnpj: '11.222.333/0001-81', razaoSocial: 'Empresa Teste LTDA', nomeFantasia: 'Teste', dataFundacao: '01/02/2010', indicadorIE: 'Não Contribuinte', inscricaoEstadual: '', inscricaoMunicipal: '', simples: 'Sim', retencaoISS: 'Não',
        socios: [{ nome: 'Fulano de Tal', cpf: '529.982.247-25', nascimento: '10/10/1980', celular: '5561999990000', email: 'fulano@empresa.com.br' }], endereco: end },
      contatos: { gestor: pess('Gestor'), financeiro: pess('Fin'), tecnico: pess('Tec'), testemunha: { nome: 'Testemunha', email: 't@empresa.com.br' } },
    },
    produtos: 'ambos',
    fidelidade: 24,
    vox: { tipoId: 'full', linhas: 30, ddd: '61', adicionais: { quer: true, quantidade: 2 } },
    portabilidades: [],
    phone: { licencas: { essentials: 2, basic: 1, standard: 0 }, gravacao: { id: '1a', pacotes: 1 }, discador: false, grupoCallCenter: false },
    conclusao: { vencimento: 10, instalacao: 'remota', observacoes: 'Nada', endereco: end },
    arquivos: { documentos: arquivo },
    ...over,
  };
}

describe('validadores', () => {
  it('valida CPF, CNPJ e telefone com DDI+DDD+9 dígitos', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    expect(isValidCNPJ('11.222.333/0001-82')).toBe(false);
    expect(isValidPhone('+55 (61) 9 9999-0000')).toBe(true);
    expect(isValidPhone('+55 (61) 3333-0000')).toBe(false); // 8 dígitos não
    expect(isValidPhone('+55 (20) 9 9999-0000')).toBe(false); // DDD inexistente
  });
  it('máscara de telefone e gravação só com dígitos, sem "+"', () => {
    expect(mask.phone('61999990000')).toBe('+55 (61) 9 9999-0000');
    expect(phoneDigits('+55 (61) 9 9999-0000')).toBe('5561999990000');
  });
  it('datas: inválida, futura e menor de idade', () => {
    expect(isValidDate('31/02/2020')).toBe(false);
    expect(validateValue('birth', '01/01/2020', {})).toMatch(/18 anos/);
    expect(validateValue('email', 'a@gmial.com')).toMatch(/gmail.com/);
  });
});

describe('preços', () => {
  it('escolhe o plano pela fidelidade e quantidade de linhas', () => {
    expect(resolverPlanoVox(catalogo, { tipoId: 'full', fidelidade: 24, linhas: 30 }).plano.id).toBe('full-5');
    expect(resolverPlanoVox(catalogo, { tipoId: 'smart', fidelidade: 12, linhas: 20 }).plano.id).toBe('smart-1');
    expect(resolverPlanoVox(catalogo, { tipoId: 'full-pos', fidelidade: 36, linhas: 3 }).plano.id).toBe('full-pos-3');
  });
  it('planos Partner só para revendas', () => {
    expect(tiposVoxDisponiveis(catalogo, { origemTipo: 'vendedor' }).map((t) => t.id)).not.toContain('partner');
    expect(tiposVoxDisponiveis(catalogo, { origemTipo: 'revenda' }).map((t) => t.id)).toContain('partner');
  });
  it('calcula Neo Vox + Neo Phone com 50% de desconto', () => {
    const c = calcularPedido(catalogo, pedidoPJ());
    expect(c.erros).toEqual([]);
    expect(c.vox.precoUnit).toBe(70.9); // 141,80 com 50%
    expect(c.vox.totalLinhas).toBe(2127);
    expect(c.vox.adicionais.total).toBe(13); // 2 × 6,50 (24 meses)
    expect(c.vox.cfop).toBe('5303');
    // 2 × 19,97 + 1 × 27,97 + gravação 7,97
    expect(c.phone.mensal).toBe(75.88);
    expect(c.instalacao).toBe(50);
    expect(c.totalContrato).toBe(Math.round(((2127 + 13) * 24 + 75.88 * 24 + 50) * 100) / 100);
  });
  it('preço especial de revenda no Pré 1 e ativação por linha', () => {
    const p = pedidoPJ({ origem: { tipo: 'revenda', id: 'r1', cnpj: '11.222.333/0001-81', nome: 'Revenda Teste', email: 'revenda@exemplo.com.br', celular: '5561900000002' }, produtos: 'vox', fidelidade: null, vox: { tipoId: 'pre', planoPreId: 'pre-1', linhas: 2, ddd: '11', adicionais: { quer: false } } });
    const c = calcularPedido(catalogo, p);
    expect(c.vox.precoUnit).toBe(39.9);
    expect(c.vox.ativacao).toBe(50);
    expect(c.vox.cfop).toBe('6303');
  });
  it('trava de portabilidade e mínimo de ramais / Grupo Call Center', () => {
    const bloco = { modo: 'faixa', faixa: { inicio: '5561933330000', fim: '5561933330049' } };
    expect(contarNumerosPortabilidade(bloco)).toBe(50);
    const c = calcularPedido(catalogo, pedidoPJ({ portabilidades: [bloco], phone: { licencas: { standard: 13 }, gravacao: { id: '90d' } } }));
    expect(c.portabilidade.numeros).toBe(50);
    expect(c.erros.some((e) => e.campo === 'portabilidade')).toBe(true); // 50 > 30 linhas + 2 adicionais
    expect(c.phone.grupoCallCenterObrigatorio).toBe(true); // 13 Standard > 12
    expect(c.phone.grupoCallCenter).toBe(239.97);
  });
});

describe('validação do pedido', () => {
  it('pedido completo passa', () => {
    expect(validarPedido(catalogo, pedidoPJ()).erros).toEqual([]);
  });
  it('acusa portabilidade acima do contratado, ramais abaixo do mínimo e IE de contribuinte', () => {
    const p = pedidoPJ({ portabilidades: [{ cidade: 'Brasília', uf: 'DF', operadora: 'Vivo', modo: 'faixa', faixa: { inicio: '5561933330000', fim: '5561933330049' }, titular: { mesmoCliente: true }, tecnico: pess('T'), fatura: arquivo }],
      phone: { licencas: { essentials: 1 }, gravacao: { id: '90d' } } });
    p.cliente.pj.indicadorIE = 'Contribuinte';
    const campos = validarPedido(catalogo, p).erros.map((e) => e.campo);
    expect(campos).toContain('portabilidade');
    expect(campos).toContain('phone');
    expect(campos).toContain('cliente.pj.inscricaoEstadual');
  });
});

describe('envio ao Bitrix', () => {
  it('cria 1 card por serviço + 1 por portabilidade, no pipeline do vendedor, com o responsável certo', async () => {
    const calls = [];
    let id = 100;
    const client = {
      portal: 'x.bitrix24.com.br',
      call: vi.fn(async (method, params) => {
        calls.push([method, params]);
        if (method.endsWith('.list')) return { result: [] };
        if (method === 'crm.duplicate.findbycomm') return { result: [] };
        return { result: ++id };
      }),
    };
    const bloco = { cidade: 'Brasília', uf: 'DF', operadora: 'Vivo', modo: 'lista', numeros: ['+55 (61) 9 3333-0000'], titular: { mesmoCliente: true }, tecnico: pess('T'), fatura: arquivo };
    const pedido = pedidoPJ({ portabilidades: [bloco, { ...bloco, uf: 'GO', cidade: 'Goiânia' }] });
    const calculo = calcularPedido(catalogo, pedido);
    const r = await enviarPedidoAoBitrix({ client, catalogo, pedido, calculo, pedidoId: 'PED-1', resumoTexto: 'resumo', portalHost: client.portal });
    expect(r.cards.map((c) => c.tipo)).toEqual(['vox', 'phone', 'portabilidade', 'portabilidade']);
    const deals = calls.filter(([m]) => m === 'crm.deal.add').map(([, p]) => p.fields);
    expect(deals.every((d) => d.CATEGORY_ID === 22 && d.STAGE_ID === 'C22:UC_5CXUV0' && d.ASSIGNED_BY_ID === 762 && d.ORIGIN_ID === 'PED-1')).toBe(true);
    expect(deals[0][F.pj.cnpj]).toBe('11.222.333/0001-81');
    expect(deals[0][F.pj.socio.celular]).toBe('5561999990000');
    expect(deals[2][F.port.numeroUnico]).toBe('5561933330000');
    expect(deals[3][F.port.uf]).toBe('GO');
    expect(calls.some(([m]) => m === 'crm.company.add')).toBe(true);
  });
});

describe('rotas', () => {
  function app({ enviar = vi.fn(async () => ({ pedidoId: 'PED-X', cards: [{ id: 1, tipo: 'vox', titulo: 'Neo Vox' }] })) } = {}) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pedidos-'));
    const catalogStore = createCatalogStore({ filePath: path.join(dir, 'cat.json') });
    catalogStore.save(catalogo, { usuario: 'teste' });
    const a = express();
    a.use('/formulario', createPedidosRouter({ catalogStore, bitrixClient: { portal: 'x' }, mailer: { send: async () => ({ skipped: true }) }, userStore: { get: () => null, authenticate: () => null }, enviar }));
    return { a, enviar, catalogStore };
  }
  it('recusa pedido inválido (422) e aceita o válido uma única vez por envioId', async () => {
    const { a, enviar } = app();
    const ruim = await request(a).post('/formulario/api/pedidos').send({ envioId: 'abcdefgh123', pedido: { ...pedidoPJ(), produtos: '' } });
    expect(ruim.status).toBe(422);
    const ok1 = await request(a).post('/formulario/api/pedidos').send({ envioId: 'abcdefgh123', pedido: pedidoPJ() });
    const ok2 = await request(a).post('/formulario/api/pedidos').send({ envioId: 'abcdefgh123', pedido: pedidoPJ() });
    expect(ok1.status).toBe(200);
    expect(ok2.body.pedidoId).toBe(ok1.body.pedidoId);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
  it('com chave de acesso, a API exige o link', async () => {
    const { a, catalogStore } = app();
    const c = catalogStore.get();
    catalogStore.save({ ...c, regras: { ...c.regras, chaveAcesso: 'segredo' } }, { usuario: 'admin' });
    expect((await request(a).get('/formulario/api/catalogo')).status).toBe(403);
    const ok = await request(a).get('/formulario/api/catalogo').set('cookie', 'fp_key=segredo');
    expect(ok.status).toBe(200);
    expect(ok.body.regras.chaveAcesso).toBeUndefined();
  });
});
