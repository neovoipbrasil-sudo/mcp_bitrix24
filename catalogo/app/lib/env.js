// Carrega o .env da raiz do repositório (tolerante a BOM, espaços e aspas). Não sobrescreve variáveis já definidas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..', '..');
export const DATA_DIR = path.resolve(here, '..', '..', 'data');

export function loadEnv() {
  const file = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, value] = m;
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value.replace(/^["']|["']$/g, '');
    }
  }
}
