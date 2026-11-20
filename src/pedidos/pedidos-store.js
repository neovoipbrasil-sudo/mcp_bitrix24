import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'fs';
import path from 'path';

export const STATUS = ['Novo', 'Em análise', 'Contrato enviado', 'Concluído', 'Cancelado'];

const safeName = (s) => String(s || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(0, 80);

// Todos os pedidos enviados pelo formulário, salvos no volume persistente:
//   <dir>/<PED-…>/pedido.json   pedido (sem o conteúdo dos anexos), cálculo, status, cards, histórico
//   <dir>/<PED-…>/anexos/…      arquivos enviados
// Assim nada se perde se o Bitrix24 falhar, e o painel lista e reenvia.
export function createPedidosStore({ dir, now = () => new Date() }) {
  const pastaDe = (id) => {
    if (!/^PED-\d{8}-[0-9A-F]{6}$/.test(id)) throw new Error('Pedido inválido.');
    return path.join(dir, id);
  };

  function gravar(id, registro) {
    const pasta = pastaDe(id);
    mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, 'pedido.json');
    writeFileSync(arq + '.tmp', JSON.stringify(registro, null, 2), 'utf-8');
    renameSync(arq + '.tmp', arq);
    return registro;
  }

  function ler(id) {
    const arq = path.join(pastaDe(id), 'pedido.json');
    return existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf-8')) : null;
  }

  // Tira o base64 dos anexos do pedido e grava cada um como arquivo; no JSON fica só a referência.
  function separarAnexos(id, pedido) {
    const pasta = path.join(pastaDe(id), 'anexos');
    mkdirSync(pasta, { recursive: true });
    let n = 0;
    const salvar = (lista) => (lista || []).map((a) => {
      const arquivo = `${String(++n).padStart(2, '0')}-${safeName(a.nome)}`;
      writeFileSync(path.join(pasta, arquivo), Buffer.from(a.base64 || '', 'base64'));
      return { nome: a.nome, tipo: a.tipo, arquivo, tamanho: Math.floor(String(a.base64 || '').length * 0.75) };
    });
    const copia = JSON.parse(JSON.stringify(pedido));
    copia.arquivos = { documentos: salvar(pedido.arquivos?.documentos) };
    copia.portabilidades = (pedido.portabilidades || []).map((b, i) => ({ ...copia.portabilidades[i], fatura: salvar(b.fatura) }));
    return copia;
  }

  return {
    criar({ id, envioId, pedido, calculo }) {
      const registro = {
        id,
        envioId,
        criadoEm: now().toISOString(),
        status: 'Novo',
        observacoes: [],
        bitrix: { situacao: 'pendente', cards: [], erro: null, tentativas: 0 },
        email: { situacao: 'pendente' },
        pedido: separarAnexos(id, pedido),
        calculo,
        historico: [{ quando: now().toISOString(), usuario: null, acao: 'Pedido recebido pelo formulário' }],
      };
      return gravar(id, registro);
    },

    obter: ler,

    atualizar(id, fn) {
      const r = ler(id);
      if (!r) throw new Error('Pedido não encontrado.');
      fn(r);
      return gravar(id, r);
    },

    registrar(id, usuario, acao) {
      return this.atualizar(id, (r) => r.historico.push({ quando: now().toISOString(), usuario, acao }));
    },

    // Reconstrói o pedido com o conteúdo dos anexos (para reenviar ao Bitrix24).
    pedidoComAnexos(id) {
      const r = ler(id);
      const pasta = path.join(pastaDe(id), 'anexos');
      const carregar = (lista) => (lista || []).map((a) => ({ nome: a.nome, tipo: a.tipo, base64: readFileSync(path.join(pasta, a.arquivo)).toString('base64') }));
      const p = JSON.parse(JSON.stringify(r.pedido));
      p.arquivos = { documentos: carregar(p.arquivos?.documentos) };
      p.portabilidades = (p.portabilidades || []).map((b) => ({ ...b, fatura: carregar(b.fatura) }));
      return p;
    },

    caminhoAnexo(id, arquivo) {
      if (!/^[\w.-]+$/.test(arquivo)) return null;
      const r = ler(id);
      const todos = [...(r?.pedido.arquivos?.documentos || []), ...(r?.pedido.portabilidades || []).flatMap((b) => b.fatura || [])];
      const a = todos.find((x) => x.arquivo === arquivo);
      return a ? { caminho: path.join(pastaDe(id), 'anexos', arquivo), nome: a.nome, tipo: a.tipo } : null;
    },

    // Lista resumida (mais recentes primeiro).
    listar() {
      if (!existsSync(dir)) return [];
      return readdirSync(dir).filter((d) => d.startsWith('PED-')).map((d) => {
        try { return ler(d); } catch { return null; }
      }).filter(Boolean).map(resumir).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    },
  };
}

export function resumir(r) {
  const p = r.pedido;
  const c = p.cliente || {};
  return {
    id: r.id,
    criadoEm: r.criadoEm,
    status: r.status,
    origemTipo: p.origem?.tipo,
    origemNome: p.origem?.nome,
    clienteTipo: c.tipo,
    clienteNome: c.tipo === 'PF' ? c.pf?.nome : c.pj?.razaoSocial,
    clienteDoc: c.tipo === 'PF' ? c.pf?.cpf : c.pj?.cnpj,
    produtos: p.produtos,
    mensal: r.calculo?.mensal,
    adesao: r.calculo?.adesao,
    totalContrato: r.calculo?.totalContrato,
    bitrix: r.bitrix?.situacao,
    cards: (r.bitrix?.cards || []).length,
    email: r.email?.situacao,
  };
}
