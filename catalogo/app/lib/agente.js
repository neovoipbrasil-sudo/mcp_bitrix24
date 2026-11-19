// Agente de IA do catálogo: conversa em português, consulta o catálogo por ferramentas
// e só PROPÕE alterações. Quem aplica é o usuário, clicando em "Aplicar" na interface.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import * as cat from './catalogo.js';

const MODEL = process.env.CATALOGO_MODEL || 'claude-opus-5-5';
let anthropic;
const api = () => (anthropic ??= new Anthropic());

const SYSTEM = `Você é o assistente do catálogo de produtos e serviços do Bitrix24 da empresa (telefonia, PABX em nuvem, atendimento digital, internet, telefonia móvel e equipamentos). Você conversa em português do Brasil com quem cuida do catálogo e ajuda a consultar, organizar e editar itens, preços e pastas.

Como trabalhar:
- Consulte sempre com as ferramentas antes de afirmar algo sobre o catálogo. Não invente IDs, nomes ou preços.
- Você NÃO grava nada sozinho. Toda mudança vai em propor_alteracoes; a pessoa revisa o "antes → depois" na tela e clica em Aplicar. Depois de propor, diga em uma frase o que propôs e que está aguardando a aprovação — nunca diga que já foi feito.
- Se o pedido for ambíguo (qual item, qual preço, qual pasta), pergunte antes de propor. Se houver vários itens parecidos, liste-os com ID e preço e confirme quais.
- Agrupe numa única proposta as alterações de um mesmo pedido.
- Para tirar um item de uso, desative (ativo: false). Não existe excluir item: excluir apagaria o histórico.
- Uma pasta só pode ser excluída vazia; mova os itens antes, em outra proposta já aplicada.

Padrões do catálogo:
- Nome: "<Produto> <variante> — <Modalidade>", com travessão. Ex.: "Fanvil X1S (Fast, com fonte) — Locação 24 meses", "Neo Vox Full Nuvem Ilimitado 3 — 36 meses", "Grandstream GXP1610 — Venda".
- Unidade de medida: "Unidade" para venda de equipamento, taxas, instalação e ativação; "Mês" para planos, licenças, locação e pacotes mensais.
- Preços em reais (BRL). Preço é o preço de venda base. R$ 0 significa preço ainda não definido.
- Texto contratual longo vai na descrição, não no nome.

Respostas: diretas, com **negrito** em nomes e valores importantes e listas quando houver vários itens. Valores no formato R$ 1.234,56.`;

const alteracaoSchema = z.object({
  tipo: z.enum(['item.atualizar', 'item.preco', 'item.criar', 'pasta.criar', 'pasta.atualizar', 'pasta.excluir']),
  id: z.number().int().optional(),
  ref: z.string().optional(),
  preco: z.number().nullable().optional(),
  campos: z.record(z.any()).optional(),
});
const schemas = {
  listar_pastas: z.object({}),
  buscar_itens: z.object({ texto: z.string().optional(), pasta_id: z.number().int().optional(), ativo: z.boolean().optional(), sem_preco: z.boolean().optional(), limite: z.number().int().min(1).max(250).optional() }),
  ver_item: z.object({ id: z.number().int() }),
  propor_alteracoes: z.object({ resumo: z.string().min(1), alteracoes: z.array(alteracaoSchema).min(1).max(300) }),
};

const TOOLS = [
  { name: 'listar_pastas', description: 'Árvore de pastas do catálogo com ID, nome, pasta-mãe, se está ativa e quantos itens tem (ativos/total).', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'buscar_itens',
    description: 'Busca itens do catálogo. "texto" casa com nome, ID e caminho da pasta (sem acento, todas as palavras). pasta_id inclui as subpastas. Devolve ID, nome, pasta, preço, unidade, ativo e se é serviço.',
    input_schema: {
      type: 'object', additionalProperties: false,
      properties: {
        texto: { type: 'string' }, pasta_id: { type: 'integer' },
        ativo: { type: 'boolean', description: 'true = só ativos, false = só inativos; omita para todos' },
        sem_preco: { type: 'boolean', description: 'true = só itens com preço R$ 0 ou sem preço' },
        limite: { type: 'integer', description: 'padrão 60, máximo 250' },
      },
    },
  },
  { name: 'ver_item', description: 'Todos os dados de um item: nome, pasta, preço, unidade, ativo, descrição e resumo.', input_schema: { type: 'object', additionalProperties: false, properties: { id: { type: 'integer' } }, required: ['id'] } },
  {
    name: 'propor_alteracoes',
    description: `Registra uma proposta de alterações para a pessoa revisar e aplicar na interface. NÃO aplica nada. Tipos de alteração:
- item.atualizar: {tipo, id, campos: {nome?, ativo?, pastaId?, unidade? ("Mês", "Unidade", "Licença" ou ID), descricao?, resumo?, ordem?}}
- item.preco: {tipo, id, preco} (número em reais)
- item.criar: {tipo, campos: {nome, pastaId, unidade?, descricao?, servico? (true = serviço)}, preco?}
- pasta.criar: {tipo, ref?, campos: {nome, paiId? (null = raiz), ordem?}} — outras alterações da mesma proposta podem usar pastaId/paiId "@<ref>"
- pasta.atualizar: {tipo, id, campos: {nome?, paiId?, ativo?, ordem?}}
- pasta.excluir: {tipo, id} — só pasta vazia
Devolve o ID da proposta e o antes → depois validado, ou o erro de validação para você corrigir.`,
    input_schema: {
      type: 'object', additionalProperties: false, required: ['resumo', 'alteracoes'],
      properties: {
        resumo: { type: 'string', description: 'Uma frase descrevendo a proposta' },
        alteracoes: {
          type: 'array', minItems: 1, maxItems: 300,
          items: {
            type: 'object', required: ['tipo'],
            properties: {
              tipo: { type: 'string', enum: ['item.atualizar', 'item.preco', 'item.criar', 'pasta.criar', 'pasta.atualizar', 'pasta.excluir'] },
              id: { type: 'integer' }, ref: { type: 'string' }, preco: { type: ['number', 'null'] }, campos: { type: 'object' },
            },
          },
        },
      },
    },
  },
];

function executar(nome, input, criadas) {
  const parsed = schemas[nome]?.safeParse(input);
  if (!parsed) return { erro: `ferramenta desconhecida: ${nome}` };
  if (!parsed.success) return { erro: `entrada inválida: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const a = parsed.data;
  switch (nome) {
    case 'listar_pastas': {
      const { pastas, itens } = cat.resumo();
      return pastas.map(p => ({ id: p.id, nome: p.nome, caminho: cat.caminho(p.id), paiId: p.paiId, ativa: p.ativo, itens: `${itens.filter(i => i.pastaId === p.id && i.ativo).length}/${itens.filter(i => i.pastaId === p.id).length}` }));
    }
    case 'buscar_itens':
      return cat.buscar({ texto: a.texto, pastaId: a.pasta_id, ativo: a.ativo, semPreco: a.sem_preco, limite: a.limite ?? 60 });
    case 'ver_item': {
      const it = cat.getItem(a.id);
      if (!it) return { erro: `item ${a.id} não existe` };
      return { id: it.id, nome: it.nome, servico: it.servico, ativo: it.ativo, pastaId: it.pastaId, pasta: cat.caminho(it.pastaId), preco: it.preco, unidade: cat.nomeUnidade(it.unidade), resumo: it.resumo.slice(0, 1500), descricao: it.descricao.slice(0, 3000) };
    }
    case 'propor_alteracoes': {
      try {
        const p = cat.criarProposta({ resumo: a.resumo, origem: 'agente', alteracoes: a.alteracoes });
        criadas.push(p.id);
        return { proposta: p.id, status: 'aguardando aprovação na interface (ainda não aplicada)', alteracoes: p.alteracoes.map(x => ({ titulo: x.titulo, mudancas: x.diffs })) };
      } catch (err) {
        return { erro: err.message };
      }
    }
  }
}

// Conversas em memória (uma por aba do navegador).
const conversas = new Map();

/** Avisos que entram na próxima mensagem da pessoa (ex.: proposta aplicada ou descartada na tela). */
export function registrarEvento(conversaId, texto) {
  const c = conversas.get(conversaId);
  if (c) c.eventos.push(texto);
}

export async function conversar(conversaId, texto) {
  if (!conversas.has(conversaId)) conversas.set(conversaId, { mensagens: [], eventos: [] });
  const conv = conversas.get(conversaId);
  const conteudo = [];
  if (conv.eventos.length) {
    conteudo.push({ type: 'text', text: `[Aconteceu na interface desde a última mensagem]\n${conv.eventos.join('\n')}` });
    conv.eventos = [];
  }
  conteudo.push({ type: 'text', text: texto });
  conv.mensagens.push({ role: 'user', content: conteudo });

  const criadas = [];
  for (let volta = 0; volta < 15; volta++) {
    let resposta;
    try {
      resposta = await api().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM,
      tools: TOOLS,
      messages: conv.mensagens,
      });
    } catch (err) {
      // Tira a mensagem da pessoa do histórico para a conversa não ficar com dois "user" seguidos sem resposta.
      if (volta === 0) conv.mensagens.pop();
      const msg = err?.error?.error?.message || err.message;
      if (err instanceof Anthropic.AuthenticationError) throw new Error('Chave da Anthropic inválida (ANTHROPIC_API_KEY no .env).');
      if (err instanceof Anthropic.RateLimitError) throw new Error('Limite de uso da API da Anthropic atingido. Tente de novo em instantes.');
      if (err instanceof Anthropic.BadRequestError && /credit balance/i.test(msg)) throw new Error('A conta da Anthropic está sem créditos. Adicione créditos em console.anthropic.com → Plans & Billing.');
      if (err instanceof Anthropic.APIError) throw new Error(`API da Anthropic (${err.status}): ${msg}`);
      throw err;
    }
    // Guarda o conteúdo inteiro (inclusive blocos de raciocínio) para a próxima volta.
    conv.mensagens.push({ role: 'assistant', content: resposta.content });

    if (resposta.stop_reason === 'refusal') {
      return { texto: 'Não consegui responder a esse pedido. Tente reformular.', propostas: criadas };
    }
    if (resposta.stop_reason === 'pause_turn') continue;
    const usos = resposta.content.filter(b => b.type === 'tool_use');
    if (resposta.stop_reason !== 'tool_use' || !usos.length) {
      const textoFinal = resposta.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return { texto: textoFinal || (resposta.stop_reason === 'max_tokens' ? '(resposta cortada — peça para continuar)' : '(sem resposta)'), propostas: criadas };
    }
    const resultados = usos.map(u => {
      const r = executar(u.name, u.input, criadas);
      return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r), ...(r && r.erro ? { is_error: true } : {}) };
    });
    conv.mensagens.push({ role: 'user', content: resultados });
  }
  return { texto: 'Parei depois de muitas consultas seguidas. Pode detalhar melhor o pedido?', propostas: criadas };
}

export function limparConversa(conversaId) {
  conversas.delete(conversaId);
}
