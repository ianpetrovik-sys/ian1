// Anúncio Local — servidor sem dependências (Node 20+).
// Faz proxy para Google Places (avaliações) e Gemini (letra + roteiro) mantendo as chaves no .env.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');

// .env mínimo (sem dotenv)
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const PORT = Number(process.env.PORT || 5180);
const PLACES_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const GENEROS = JSON.parse(readFileSync(path.join(ROOT, 'data/generos-uf.json'), 'utf8'));

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- Google Places ----------
async function buscarNegocio(nome, cidade) {
  if (!PLACES_KEY) return { ...mockNegocio(nome, cidade), modo: 'demo' };
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask': [
        'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents',
        'places.rating', 'places.userRatingCount', 'places.reviews', 'places.nationalPhoneNumber',
        'places.primaryTypeDisplayName', 'places.websiteUri', 'places.googleMapsUri',
      ].join(','),
    },
    body: JSON.stringify({ textQuery: `${nome} ${cidade || ''}`.trim(), languageCode: 'pt-BR', regionCode: 'BR', maxResultCount: 1 }),
  });
  if (!res.ok) throw new Error(`Places ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const p = (await res.json()).places?.[0];
  if (!p) throw new Error('Negócio não encontrado no Google. Tente incluir cidade e bairro.');
  const uf = p.addressComponents?.find(c => c.types?.includes('administrative_area_level_1'))?.shortText || '';
  const cid = p.addressComponents?.find(c => c.types?.includes('administrative_area_level_2'))?.longText || cidade || '';
  return {
    modo: 'google',
    nome: p.displayName?.text || nome,
    categoria: p.primaryTypeDisplayName?.text || '',
    endereco: p.formattedAddress || '',
    cidade: cid,
    uf,
    nota: p.rating ?? null,
    totalAvaliacoes: p.userRatingCount ?? 0,
    telefone: p.nationalPhoneNumber || '',
    site: p.websiteUri || '',
    mapa: p.googleMapsUri || '',
    avaliacoes: (p.reviews || []).map(r => ({
      autor: r.authorAttribution?.displayName || 'Cliente',
      nota: r.rating,
      texto: r.text?.text || r.originalText?.text || '',
      quando: r.relativePublishTimeDescription || '',
    })).filter(r => r.texto),
  };
}

function mockNegocio(nome, cidade) {
  return {
    nome: nome || 'Padaria Pão de Ouro', categoria: 'Padaria', endereco: `Centro, ${cidade || 'Goiânia - GO'}`,
    cidade: (cidade || 'Goiânia').split(/[-,]/)[0].replace(/\s+[A-Z]{2}$/, '').trim(), uf: (cidade || '').match(/\b([A-Z]{2})\b/)?.[1] || 'GO',
    nota: 4.8, totalAvaliacoes: 327, telefone: '(62) 99999-0000', site: '', mapa: '',
    avaliacoes: [
      { autor: 'Ana', nota: 5, texto: 'O pão de queijo sai quentinho toda hora, atendimento nota mil!', quando: 'há 1 semana' },
      { autor: 'Carlos', nota: 5, texto: 'Café da manhã caprichado e preço justo. Virei cliente fiel.', quando: 'há 2 semanas' },
      { autor: 'Júlia', nota: 5, texto: 'Bolo de cenoura com cobertura que lembra o da minha avó.', quando: 'há 1 mês' },
      { autor: 'Rafa', nota: 4, texto: 'Lugar limpo, equipe simpática, fila anda rápido.', quando: 'há 1 mês' },
    ],
  };
}

// ---------- Gemini: letra + roteiro de cenas ----------
async function gerarCriativo(neg, estilo, duracao) {
  const base = { estilo, duracao };
  if (!GEMINI_KEY) return { ...criativoLocal(neg, estilo, duracao), modo: 'demo', ...base };
  const prompt = `Você é diretor criativo de anúncios para negócios locais brasileiros.
Negócio: ${neg.nome} (${neg.categoria}) em ${neg.cidade}-${neg.uf}. Nota ${neg.nota} com ${neg.totalAvaliacoes} avaliações.
Avaliações reais do Google (use os elogios concretos, sem inventar fatos, sem citar nomes de clientes):
${neg.avaliacoes.map(a => `- (${a.nota}★) ${a.texto}`).join('\n')}
Estilo musical: ${estilo.genero}, ${estilo.bpm} BPM, instrumentos: ${estilo.instrumentos}, clima: ${estilo.clima}.
Duração do anúncio: ${duracao}s, vertical 9:16.
Responda APENAS JSON com:
{"slogan": string curto (máx 6 palavras),
 "cta": string (ex.: "Chama no WhatsApp"),
 "letra": string com tags [Verse] [Chorus] [Outro], refrão grudento que repete o nome do negócio, linguagem regional de ${neg.uf}, cabe em ${duracao}s,
 "linhasTela": array de 4 a 8 frases curtas (máx 7 palavras) para legenda karaokê,
 "promptMusica": string em inglês para gerador de música (gênero, BPM, instrumentos, voz, clima, idioma pt-BR), sem nomes de artistas,
 "cenas": array de ${Math.max(2, Math.round(duracao / 8))} objetos {"titulo": string, "promptVeo": string em inglês, cinematográfico, 9:16, 8 segundos, mostrando o tipo de negócio e o que as avaliações elogiam, sem texto na tela, sem logotipos, "textoTela": string curta pt-BR}}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const txt = (await res.json()).candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '{}';
  const j = JSON.parse(txt.replace(/^```json\s*|\s*```$/g, ''));
  return { modo: 'gemini', ...base, ...j };
}

// Gerador local (sem chave): monta a letra a partir dos trechos das avaliações.
function criativoLocal(neg, estilo, duracao) {
  const frases = neg.avaliacoes.map(a => a.texto.split(/[.!?]/)[0].trim()).filter(Boolean).slice(0, 4);
  const refrao = `É ${neg.nome}, ${neg.nome}!\nEm ${neg.cidade} todo mundo já falou\nNota ${neg.nota ?? 5} no Google, vem que é bom demais`;
  const letra = `[Verse]\n${frases.slice(0, 2).join('\n')}\n\n[Chorus]\n${refrao}\n\n[Verse]\n${frases.slice(2, 4).join('\n')}\n\n[Chorus]\n${refrao}\n\n[Outro]\n${neg.nome}, te espero aí!`;
  const nCenas = Math.max(2, Math.round(duracao / 8));
  const cenas = Array.from({ length: nCenas }, (_, i) => ({
    titulo: ['Abertura', 'Produto em destaque', 'Clientes felizes', 'Fachada e convite'][i % 4],
    promptVeo: [
      `Cinematic vertical 9:16 opening shot of a cozy Brazilian ${neg.categoria || 'local shop'} in ${neg.cidade}, warm morning light, slow dolly-in, shallow depth of field, no text, no logos.`,
      `Macro close-up of the signature product of a Brazilian ${neg.categoria || 'local shop'}: ${frases[0] || 'fresh and appetizing'}, steam and texture, 9:16, 8 seconds, no text.`,
      `Smiling Brazilian customers being served by friendly staff, handheld natural camera, golden hour, authentic local vibe, 9:16, no text, no logos.`,
      `Exterior facade of a welcoming Brazilian ${neg.categoria || 'shop'} at dusk, lights turning on, people walking in, slow crane up, 9:16, no text.`,
    ][i % 4],
    textoTela: [neg.nome, frases[0] || 'Feito com carinho', `⭐ ${neg.nota ?? 5} no Google`, 'Chama no WhatsApp'][i % 4],
  }));
  return {
    slogan: `O sabor que ${neg.cidade} aprova`,
    cta: neg.telefone ? `Chama no WhatsApp ${neg.telefone}` : 'Chama no WhatsApp',
    letra,
    linhasTela: [neg.nome, ...frases.map(f => f.split(' ').slice(0, 7).join(' ')), `Nota ${neg.nota ?? 5} no Google`],
    promptMusica: `Brazilian ${estilo.genero} jingle, ${estilo.bpm} BPM, ${estilo.instrumentos}, ${estilo.clima} mood, catchy chorus repeating the business name, warm male and female vocals, Brazilian Portuguese lyrics, radio-ready commercial, ${duracao} seconds.`,
    cenas,
  };
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
const SEC = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
};
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, ...SEC });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
async function lerJson(req) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 1e5) throw new Error('Corpo grande demais'); }
  return raw ? JSON.parse(raw) : {};
}
const str = (v, max = 200) => String(v ?? '').slice(0, max).trim();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return send(res, 200, { places: !!PLACES_KEY, gemini: !!GEMINI_KEY, modelo: GEMINI_MODEL, generos: GENEROS });
    }
    if (req.method === 'POST' && url.pathname === '/api/negocio') {
      const b = await lerJson(req);
      const nome = str(b.nome, 120);
      if (!nome) return send(res, 400, { erro: 'Informe o nome do negócio.' });
      const neg = await buscarNegocio(nome, str(b.cidade, 120));
      log('negocio', neg.modo, neg.nome, neg.uf, `${neg.avaliacoes.length} avaliações`);
      return send(res, 200, neg);
    }
    if (req.method === 'POST' && url.pathname === '/api/criativo') {
      const b = await lerJson(req);
      if (!b.negocio?.nome) return send(res, 400, { erro: 'Busque o negócio primeiro.' });
      const uf = str(b.uf || b.negocio.uf, 2).toUpperCase();
      const estilo = b.estilo?.genero ? { genero: str(b.estilo.genero, 60), bpm: Number(b.estilo.bpm) || 120, instrumentos: str(b.estilo.instrumentos), clima: str(b.estilo.clima) } : (GENEROS[uf] || GENEROS.SP);
      const duracao = Math.min(60, Math.max(8, Number(b.duracao) || 30));
      const neg = { ...b.negocio, avaliacoes: (b.negocio.avaliacoes || []).slice(0, 8).map(a => ({ nota: a.nota, texto: str(a.texto, 600) })) };
      const out = await gerarCriativo(neg, estilo, duracao);
      log('criativo', out.modo, neg.nome, estilo.genero);
      return send(res, 200, out);
    }
    if (req.method !== 'GET') return send(res, 405, { erro: 'Método não permitido' });
    // estáticos com proteção contra path traversal
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep) || !existsSync(file)) return send(res, 404, 'Não encontrado', 'text/plain');
    return send(res, 200, await readFile(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    log('ERRO', url.pathname, e.message);
    return send(res, 500, { erro: e.message });
  }
});

server.listen(PORT, () => log(`Anúncio Local em http://localhost:${PORT} | Places: ${PLACES_KEY ? 'on' : 'demo'} | Gemini: ${GEMINI_KEY ? GEMINI_MODEL : 'demo'}`));
