import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Pasta dos dados persistentes do servidor (memória e histórico do bot, audit log,
// estado do MSN Talk, usuários e .html do painel de relatórios).
//
// Ordem de escolha:
//   1. DATA_DIR, se definida;
//   2. src/bot/data, se existir — caminho anterior à reorganização do repositório
//      em pastas. Mantém funcionando um volume do EasyPanel ainda montado em
//      /app/src/bot/data sem precisar mexer na configuração;
//   3. bot/data (padrão atual).
export function resolveDataDir({ env = process.env, exists = existsSync } = {}) {
  if (env.DATA_DIR) return env.DATA_DIR;
  const legacy = fileURLToPath(new URL('../../src/bot/data', import.meta.url));
  if (exists(legacy)) return legacy;
  return fileURLToPath(new URL('../../bot/data', import.meta.url));
}
