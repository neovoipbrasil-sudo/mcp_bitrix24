import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, appendFileSync } from 'fs';
import path from 'path';

const DEFAULT_PATH = new URL('./catalogo-padrao.json', import.meta.url);

// Catálogo do formulário (planos, preços, vendedores, revendas, regras) num JSON no volume
// persistente. Na primeira execução copia o catálogo padrão. Cada gravação registra quem
// alterou e quando em <arquivo>.historico.jsonl, com o catálogo anterior completo.
export function createCatalogStore({ filePath, now = () => new Date() }) {
  const historyPath = filePath.replace(/\.json$/, '') + '.historico.jsonl';

  function ensureDir() {
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  function persist(data) {
    ensureDir();
    const tmp = filePath + '.tmp';
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    renameSync(tmp, filePath);
  }

  function load() {
    if (!existsSync(filePath)) {
      const seeded = JSON.parse(readFileSync(DEFAULT_PATH, 'utf-8'));
      persist(seeded);
      return seeded;
    }
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }

  return {
    get: load,

    // Visão pública (o que o navegador do vendedor recebe): sem a chave de acesso.
    getPublic() {
      const c = load();
      return { ...c, regras: { ...c.regras, chaveAcesso: undefined } };
    },

    save(next, { usuario }) {
      const erro = validarCatalogo(next);
      if (erro) throw new Error(erro);
      const anterior = load();
      ensureDir();
      appendFileSync(historyPath, JSON.stringify({ quando: now().toISOString(), usuario, anterior }) + '\n', 'utf-8');
      persist({ ...next, versao: (Number(anterior.versao) || 0) + 1, atualizadoEm: now().toISOString(), atualizadoPor: usuario });
      return load();
    },

    history({ limit = 30 } = {}) {
      if (!existsSync(historyPath)) return [];
      return readFileSync(historyPath, 'utf-8').trim().split('\n').filter(Boolean)
        .map((l) => JSON.parse(l)).reverse().slice(0, limit)
        .map(({ quando, usuario, anterior }) => ({ quando, usuario, versao: anterior?.versao }));
    },
  };
}

const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function validarCatalogo(c) {
  if (!c || typeof c !== 'object') return 'Catálogo inválido.';
  for (const k of ['regras', 'tiposVox', 'planosVox', 'licencasPhone', 'gravacao', 'vendedores', 'revendas']) {
    if (!c[k]) return `Catálogo sem a seção "${k}".`;
  }
  if (!num(c.regras.descontoPercent) || c.regras.descontoPercent > 100) return 'Desconto deve estar entre 0 e 100%.';
  const ids = new Set();
  for (const p of c.planosVox) {
    if (!p.id || !p.nome) return 'Todo plano precisa de código e nome.';
    if (ids.has(p.id)) return `Código de plano repetido: ${p.id}.`;
    ids.add(p.id);
    if (!num(p.precoCheio)) return `Preço inválido no plano ${p.nome}.`;
    if (!c.tiposVox.some((t) => t.id === p.tipo)) return `O plano ${p.nome} usa um tipo que não existe (${p.tipo}).`;
  }
  for (const l of c.licencasPhone) {
    for (const f of c.regras.fidelidades) if (!num(l.precos?.[String(f)])) return `Preço de ${f} meses inválido na ${l.nome}.`;
  }
  for (const v of [...c.vendedores, ...c.revendas]) {
    if (!v.id || !v.nome) return 'Todo vendedor/revenda precisa de código e nome.';
    if (!Number.isInteger(Number(v.bitrixUserId)) || Number(v.bitrixUserId) <= 0) return `ID do Bitrix inválido para ${v.nome}.`;
  }
  return null;
}
