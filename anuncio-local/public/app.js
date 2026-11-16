// Anúncio Local — front-end (sem dependências)
const $ = (id) => document.getElementById(id);
const S = { generos: {}, negocio: null, criativo: null, clipes: [], audio: null, logo: null, rodando: false };

const toast = (msg, ms = 3500) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms); };
async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}
const busy = (btn, on) => { btn.disabled = on; btn.dataset.t ??= btn.textContent; btn.textContent = on ? 'Aguarde…' : btn.dataset.t; };

// ---------- status ----------
api('/api/status').then((s) => {
  S.generos = s.generos;
  $('status').textContent = `Google: ${s.places ? 'ativo' : 'demo'} · Gemini: ${s.gemini ? 'ativo' : 'demo'}`;
  const sel = $('uf');
  Object.keys(s.generos).filter((k) => k.length === 2).sort().forEach((uf) => sel.add(new Option(uf, uf)));
}).catch(() => ($('status').textContent = 'servidor offline'));

$('uf').addEventListener('change', () => aplicarEstilo($('uf').value));
function aplicarEstilo(uf) {
  const g = S.generos[uf] || S.generos.SP;
  $('uf').value = uf; $('genero').value = g.genero; $('bpm').value = g.bpm;
}

// ---------- 1. Negócio ----------
$('formNegocio').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter; busy(btn, true);
  try {
    const n = await api('/api/negocio', { nome: $('nome').value, cidade: $('cidade').value });
    S.negocio = n;
    $('negNome').textContent = n.nome; $('negCat').textContent = n.categoria ? `· ${n.categoria}` : '';
    $('negEnd').textContent = n.endereco; $('negNota').textContent = n.nota ?? '–';
    $('negTotal').textContent = `${n.totalAvaliacoes} avaliações${n.modo === 'demo' ? ' · DEMO' : ''}`;
    const ul = $('avaliacoes'); ul.replaceChildren();
    n.avaliacoes.forEach((a) => { const li = document.createElement('li'); li.textContent = `${'★'.repeat(a.nota || 5)} ${a.texto} — ${a.autor}`; ul.append(li); });
    aplicarEstilo(n.uf || 'SP');
    $('negocio').hidden = false;
  } catch (err) { toast(err.message); } finally { busy(btn, false); }
});

// ---------- 2. Criativo ----------
$('btnCriativo').addEventListener('click', async (e) => {
  const btn = e.currentTarget; busy(btn, true);
  try {
    const base = S.generos[$('uf').value] || {};
    const c = await api('/api/criativo', {
      negocio: S.negocio, uf: $('uf').value, duracao: Number($('duracao').value),
      estilo: { ...base, genero: $('genero').value, bpm: Number($('bpm').value) },
    });
    S.criativo = c;
    $('slogan').value = c.slogan || ''; $('cta').value = c.cta || '';
    $('letra').value = c.letra || ''; $('promptMusica').value = c.promptMusica || '';
    const ol = $('cenas'); ol.replaceChildren();
    (c.cenas || []).forEach((cena, i) => {
      const li = document.createElement('li');
      const h = document.createElement('strong'); h.textContent = `${cena.titulo} — “${cena.textoTela}” `;
      const b = document.createElement('button'); b.className = 'copy'; b.textContent = 'copiar';
      const ta = document.createElement('textarea'); ta.rows = 3; ta.value = cena.promptVeo; ta.id = `cena${i}`;
      b.onclick = () => copiar(ta.value);
      li.append(h, b, ta); ol.append(li);
    });
    $('passo2').hidden = false; $('passo3').hidden = false;
    desenhar(0);
    $('passo2').scrollIntoView({ behavior: 'smooth' });
  } catch (err) { toast(err.message); } finally { busy(btn, false); }
});

const copiar = (txt) => navigator.clipboard.writeText(txt).then(() => toast('Copiado'), () => toast('Não consegui copiar; selecione o texto manualmente.'));
document.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copiar($(b.dataset.copy).value)));

$('btnBaixarPacote').onclick = () => {
  const n = S.negocio, c = S.criativo;
  const cenas = [...document.querySelectorAll('#cenas textarea')].map((t, i) => `CENA ${i + 1} (${c.cenas[i].titulo}):\n${t.value}`).join('\n\n');
  const txt = `ANÚNCIO: ${n.nome} (${n.cidade}-${n.uf})\nSlogan: ${$('slogan').value}\nCTA: ${$('cta').value}\n\n=== FLOW (Veo, 9:16, 8s) ===\n${cenas}\n\n=== MÚSICA (Gemini/Lyria) ===\nEstilo: ${$('promptMusica').value}\n\nLetra:\n${$('letra').value}\n`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
  a.download = `pacote-${slug(n.nome)}.txt`; a.click();
};
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- 3. Montagem ----------
$('clipes').addEventListener('change', async (e) => {
  S.clipes = await Promise.all([...e.target.files].map(carregarMidia));
  toast(`${S.clipes.length} clipe(s) carregado(s)`); desenhar(0);
});
$('musica').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  S.audio = new Audio(URL.createObjectURL(f)); S.audio.preload = 'auto';
  S.audio.onloadedmetadata = () => toast(`Música: ${S.audio.duration.toFixed(1)}s`);
});
$('logo').addEventListener('change', async (e) => { if (e.target.files[0]) { S.logo = (await carregarMidia(e.target.files[0])).el; desenhar(0); } });
['template', 'cor', 'oferta', 'slogan', 'cta'].forEach((id) => $(id).addEventListener('input', () => !S.rodando && desenhar(1.5)));

function carregarMidia(file) {
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('image/')) { const i = new Image(); i.onload = () => ok({ tipo: 'img', el: i }); i.onerror = erro; i.src = url; return; }
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.onloadeddata = () => ok({ tipo: 'video', el: v }); v.onerror = erro; v.src = url;
  });
}

const cv = $('canvas'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
const duracaoTotal = () => (S.audio && isFinite(S.audio.duration) ? S.audio.duration : Number($('duracao').value));

function cover(el, zoom = 1) {
  const sw = el.videoWidth || el.naturalWidth, sh = el.videoHeight || el.naturalHeight;
  if (!sw) return;
  const s = Math.max(W / sw, H / sh) * zoom, w = sw * s, h = sh * s;
  ctx.drawImage(el, (W - w) / 2, (H - h) / 2, w, h);
}
function texto(t, x, y, { size = 72, cor = '#fff', peso = 800, max = W - 140, alinhar = 'center', sombra = true, linhaAlt = 1.15, umaLinha = false } = {}) {
  const fonte = (s) => (ctx.font = `${peso} ${s}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`);
  fonte(size);
  if (umaLinha) { while (size > 24 && ctx.measureText(String(t)).width > max) fonte(size -= 2); y += (arguments[3]?.size ?? 72) / 2 - size / 2; max = Infinity; }
  ctx.textAlign = alinhar; ctx.textBaseline = 'top'; ctx.fillStyle = cor;
  if (sombra) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 18; }
  const linhas = []; let atual = '';
  for (const p of String(t).split(' ')) { const prova = atual ? `${atual} ${p}` : p; if (ctx.measureText(prova).width > max && atual) { linhas.push(atual); atual = p; } else atual = prova; }
  if (atual) linhas.push(atual);
  linhas.forEach((l, i) => ctx.fillText(l, x, y + i * size * linhaAlt));
  ctx.shadowBlur = 0;
  return linhas.length * size * linhaAlt;
}
function caixa(x, y, w, h, r, fill) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }
const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function fundo(t, D) {
  if (!S.clipes.length) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    const h = (t * 20) % 360;
    g.addColorStop(0, `hsl(${h},60%,22%)`); g.addColorStop(1, $('cor').value);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); return;
  }
  const seg = D / S.clipes.length, i = Math.min(S.clipes.length - 1, Math.floor(t / seg)), c = S.clipes[i];
  if (c.tipo === 'img') cover(c.el, 1 + 0.12 * ((t - i * seg) / seg)); // Ken Burns
  else cover(c.el);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, W, H);
}

function cartaoFinal(t, D) {
  const n = S.negocio, p = easeOut((t - (D - 3.5)) / 0.6), cor = $('cor').value;
  ctx.fillStyle = `rgba(0,0,0,${0.75 * p})`; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = p;
  if (S.logo) { const s = 260 / Math.max(S.logo.naturalWidth, S.logo.naturalHeight); ctx.drawImage(S.logo, W / 2 - S.logo.naturalWidth * s / 2, 470, S.logo.naturalWidth * s, S.logo.naturalHeight * s); }
  let y = 780; y += texto(n.nome, W / 2, y, { size: 104 }) + 30;
  if (n.nota) { texto(`${'★'.repeat(Math.round(n.nota))}  ${n.nota} no Google`, W / 2, y, { size: 56, cor, max: W - 160, umaLinha: true }); y += 100; }
  caixa(140, y + 20, W - 280, 150, 75, cor);
  texto($('cta').value || 'Chama no WhatsApp', W / 2, y + 62, { size: 52, cor: '#000', sombra: false, max: W - 340, umaLinha: true });
  texto(n.endereco || '', W / 2, y + 230, { size: 36, peso: 500, cor: '#ddd' });
  ctx.globalAlpha = 1;
}

const TEMPLATES = {
  depoimento(t, D) {
    const n = S.negocio, cor = $('cor').value;
    texto(n.nome, W / 2, 150, { size: 92 });
    const revs = n.avaliacoes.length ? n.avaliacoes : [{ texto: S.criativo?.slogan || '', nota: 5 }];
    const util = D - 3.5, dur = util / revs.length, i = Math.min(revs.length - 1, Math.floor(t / dur)), r = revs[i];
    const p = easeOut((t - i * dur) / 0.5), y = 1260 + (1 - p) * 120;
    ctx.globalAlpha = p; caixa(70, y, W - 140, 520, 36, 'rgba(255,255,255,.94)');
    texto('★'.repeat(r.nota || 5), W / 2, y + 40, { size: 64, cor, sombra: false });
    texto(`“${r.texto.length > 150 ? r.texto.slice(0, 147) + '…' : r.texto}”`, W / 2, y + 130, { size: 44, peso: 600, cor: '#111', sombra: false, max: W - 220 });
    texto(`${r.autor || 'Cliente'} · avaliação no Google`, W / 2, y + 450, { size: 30, peso: 500, cor: '#666', sombra: false });
    ctx.globalAlpha = 1;
  },
  oferta(t, D) {
    const cor = $('cor').value, p = easeOut(t / 0.8), pulso = 1 + 0.04 * Math.sin(t * 6);
    ctx.save(); ctx.translate(W / 2, 520); ctx.scale(p, p);
    texto(($('slogan').value || S.negocio.nome).toUpperCase(), 0, -120, { size: 118, peso: 900 }); ctx.restore();
    const of = $('oferta').value;
    if (of && t > 1) { const q = easeOut((t - 1) / 0.5); caixa(-W + q * (W + 60), 1150, W - 120, 200, 24, cor); texto(of, -W + q * (W + 60) + (W - 120) / 2, 1195, { size: 60, cor: '#000', sombra: false, max: W - 220, umaLinha: true }); }
    ctx.save(); ctx.translate(W / 2, 1600); ctx.scale(pulso, pulso);
    caixa(-380, -75, 760, 150, 75, '#25D366'); texto($('cta').value || 'Chama no WhatsApp', 0, -32, { size: 50, sombra: false, max: 680, umaLinha: true }); ctx.restore();
  },
  karaoke(t, D) {
    const cor = $('cor').value, linhas = S.criativo?.linhasTela?.length ? S.criativo.linhasTela : [S.negocio.nome];
    texto(S.negocio.nome, W / 2, 140, { size: 70, cor });
    const util = D - 3.5, dur = util / linhas.length, i = Math.min(linhas.length - 1, Math.floor(t / dur));
    const prog = Math.min(1, (t - i * dur) / dur), p = easeOut(prog / 0.25);
    ctx.globalAlpha = p;
    const h = texto(linhas[i], W / 2, 860, { size: 96, peso: 900 });
    caixa(140, 880 + h, (W - 280) * prog, 14, 7, cor);
    ctx.globalAlpha = 0.5; if (linhas[i + 1]) texto(linhas[i + 1], W / 2, 1000 + h, { size: 56, peso: 600 });
    ctx.globalAlpha = 1;
  },
};

function desenhar(t) {
  if (!S.negocio) return;
  const D = duracaoTotal();
  ctx.clearRect(0, 0, W, H); fundo(t, D);
  if (S.logo && t < D - 3.5) { const s = 150 / Math.max(S.logo.naturalWidth, S.logo.naturalHeight); ctx.drawImage(S.logo, 50, 50, S.logo.naturalWidth * s, S.logo.naturalHeight * s); }
  if (t < D - 3.5) TEMPLATES[$('template').value](t, D);
  else cartaoFinal(t, D);
}

// Reprodução em tempo real (prévia e exportação usam o mesmo motor)
let audioCtx, audioDest, audioSrc;
function rodar({ gravar }) {
  return new Promise((fim) => {
    if (!S.negocio) return fim(null);
    S.rodando = true;
    const D = duracaoTotal(), seg = S.clipes.length ? D / S.clipes.length : D;
    let recorder, partes = [], atual = -1;
    if (S.audio) {
      audioCtx ??= new AudioContext();
      if (!audioSrc) { audioSrc = audioCtx.createMediaElementSource(S.audio); audioDest = audioCtx.createMediaStreamDestination(); audioSrc.connect(audioDest); audioSrc.connect(audioCtx.destination); }
      audioCtx.resume(); S.audio.currentTime = 0; S.audio.play();
    }
    if (gravar) {
      const stream = cv.captureStream(30);
      if (S.audio) audioDest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
      const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
      recorder.ondataavailable = (e) => e.data.size && partes.push(e.data);
      recorder.onstop = () => fim(new Blob(partes, { type: recorder.mimeType }));
      recorder.start(250);
    }
    const t0 = performance.now();
    const loop = () => {
      const t = S.audio ? S.audio.currentTime : (performance.now() - t0) / 1000;
      const i = Math.min(S.clipes.length - 1, Math.floor(t / seg));
      if (S.clipes.length && i !== atual) {
        S.clipes.forEach((c, k) => k !== i && c.tipo === 'video' && c.el.pause());
        atual = i; const c = S.clipes[i];
        if (c.tipo === 'video') { c.el.currentTime = 0; c.el.loop = true; c.el.play(); }
      }
      desenhar(Math.min(t, D));
      $('exportInfo').textContent = `${gravar ? 'Gravando' : 'Prévia'}: ${t.toFixed(1)}s / ${D.toFixed(1)}s`;
      if (t < D) return requestAnimationFrame(loop);
      S.rodando = false; S.audio?.pause(); S.clipes.forEach((c) => c.tipo === 'video' && c.el.pause());
      if (recorder) recorder.stop(); else fim(null);
    };
    requestAnimationFrame(loop);
  });
}

$('btnPreview').onclick = () => !S.rodando && rodar({ gravar: false });
$('btnExportar').onclick = async (e) => {
  if (S.rodando) return;
  const btn = e.currentTarget; busy(btn, true);
  try {
    const blob = await rodar({ gravar: true });
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const a = $('download'); a.href = URL.createObjectURL(blob); a.download = `anuncio-${slug(S.negocio.nome)}.${ext}`;
    a.textContent = `Baixar anúncio (${ext.toUpperCase()}, ${(blob.size / 1e6).toFixed(1)} MB)`; a.hidden = false;
    $('exportInfo').textContent = 'Pronto. Formato 1080×1920 para Reels, Status e TikTok.';
  } catch (err) { toast(err.message); } finally { busy(btn, false); }
};
window.__S = S; window.__desenhar = desenhar; // para testes
