// Resultado final do 2º turno 2026: mapa por cidades, gráficos e relatório compartilhável.
// Dados: TSE (/api/tse) + malha municipal do IBGE (/api/ibge). Sem dependências.
import { UF_META, UF_PATHS } from './uf-paths.js';

const P = new URLSearchParams(location.search);
const ELE = /^\d+$/.test(P.get('ele') || '') ? P.get('ele') : '6258';
const E6 = 'e' + ELE.padStart(6, '0');
const T = `/api/tse/ele2026/${ELE}`;
const C = [{ n: 'Lula', p: 'PT', col: '#e11d2e' }, { n: 'Flávio Bolsonaro', p: 'PL', col: '#3b82f6' }];
const SLOT = { 13: 0, 22: 1, 91: 0, 92: 1 };
const $ = (s) => document.querySelector(s);
const nf = new Intl.NumberFormat('pt-BR');
const pf = (n, d = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const NS = 'http://www.w3.org/2000/svg';
const UFS = Object.keys(UF_META).filter((u) => u !== 'zz');
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function getJ(url, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { signal: ctrl.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

// ---------- parsing do arquivo unificado (-u.json) ----------
function parse(j) {
  const c = (j?.carg || []).find((x) => Number(x.cd) === 1) || j?.carg?.[0];
  if (!c) return null;
  const v = [0, 0];
  (c.agr || []).forEach((a) => (a.par || []).forEach((p) => (p.cand || []).forEach((x) => {
    const s = SLOT[Number(x.n)]; if (s !== undefined) v[s] += Number(x.vap) || 0;
  })));
  const V = j.v || {}, E = j.e || {}, S = j.s || {};
  return { v, valid: +V.vv || 0, blank: +V.vb || 0, nul: +V.tvn || 0, tv: +V.tv || 0, te: +E.te || 0, comp: +E.c || 0, abst: +E.a || 0,
    st: +S.st || 0, ts: +S.ts || 0, final: j.tf === 's', ht: j.ht || j.hg || '', dt: j.dt || j.dg || '' };
}
const lead = (v) => (v[0] > v[1] ? 0 : 1);
const marg = (v) => (v[0] + v[1] ? (Math.abs(v[0] - v[1]) / (v[0] + v[1])) * 100 : 0);
const band = (m) => (m < 5 ? 0.32 : m < 15 ? 0.5 : m < 30 ? 0.7 : m < 50 ? 0.85 : 1);

let nat = null; const st = {};
const cities = {}; const loading = {}; const ufBB = {}; const tally = [0, 0];
let cmP = null, total = 0, done = 0;

// ---------- cabeçalho ----------
function renderHero() {
  const [a, b] = nat.v, t = a + b, w = lead(nat.v);
  $('#p0').textContent = pf((a / t) * 100) + '%'; $('#p1').textContent = pf((b / t) * 100) + '%';
  $('#v0').textContent = nf.format(a) + ' votos'; $('#v1').textContent = nf.format(b) + ' votos';
  $('#sp0').style.width = (a / t) * 100 + '%'; $('#sp1').style.width = (b / t) * 100 + '%';
  $('#h-title').textContent = `${C[w].n} ${nat.final ? 'é o presidente eleito' : 'lidera a apuração'}`;
  $('#h-sub').textContent = `Diferença de ${nf.format(Math.abs(a - b))} votos (${pf(marg(nat.v))} p.p.) · atualizado ${nat.dt} ${nat.ht}`.trim();
  const sum = [0, 0]; UFS.concat('zz').forEach((u) => st[u] && (sum[0] += st[u].v[0], sum[1] += st[u].v[1]));
  const ok = sum[0] === a && sum[1] === b;
  const items = [[nat.final, 'Totalização final TSE'], [nat.ts && nat.st === nat.ts, `${pf((nat.st / (nat.ts || 1)) * 100)}% das seções (${nf.format(nat.st)})`],
    [ok, ok ? 'Soma dos estados confere com o total' : 'Soma dos estados difere do total nacional'], [nat.valid + nat.blank + nat.nul === nat.tv, 'Válidos + brancos + nulos = total']];
  $('#checks').innerHTML = items.map(([g, s]) => `<li class="${g ? 'ok' : 'bad'}">${s}</li>`).join('');
  const sEl = $('#status'); sEl.textContent = nat.final ? 'Totalização final' : 'Apuração parcial'; sEl.classList.toggle('ok', nat.final);
}

// ---------- gráficos ----------
function renderCharts() {
  const rows = UFS.filter((u) => st[u]);
  const won = [0, 0]; rows.forEach((u) => won[lead(st[u].v)]++);
  const wonHTML = (x, lab) => `<div class="big"><span class="a">${x[0]}</span><span class="b">${x[1]}</span></div><div class="split"><i style="width:${(x[0] / ((x[0] + x[1]) || 1)) * 100}%"></i><i style="width:${(x[1] / ((x[0] + x[1]) || 1)) * 100}%"></i></div><p class="muted">${lab}</p>`;
  $('#won').innerHTML = wonHTML(won, 'estados (incluindo DF) em que cada candidato ficou à frente') + '<div id="cwon"></div>';
  renderCityWon();
  const n = nat;
  const part = [['Comparecimento', n.comp / n.te * 100, '#22c55e'], ['Abstenção', n.abst / n.te * 100, '#f59e0b'], ['Votos válidos', n.valid / n.tv * 100, '#38bdf8'], ['Brancos', n.blank / n.tv * 100, '#a78bfa'], ['Nulos', n.nul / n.tv * 100, '#94a3b8']];
  $('#part').innerHTML = part.map(([l, p, c]) => `<div class="row"><span>${l}</span><div class="bar"><i style="width:${p}%;background:${c}"></i></div><b>${pf(p)}%</b></div>`).join('') +
    `<p class="muted">${nf.format(n.comp)} compareceram de ${nf.format(n.te)} eleitores aptos.</p>`;
  const sorted = rows.slice().sort((x, y) => (st[y].v[0] - st[y].v[1]) / (st[y].v[0] + st[y].v[1]) - (st[x].v[0] - st[x].v[1]) / (st[x].v[0] + st[x].v[1]));
  const mx = Math.max(...sorted.map((u) => marg(st[u].v)), 1);
  $('#margins').innerHTML = sorted.map((u) => { const m = marg(st[u].v), w = lead(st[u].v), len = (m / mx) * 50;
    return `<div class="mrow" data-uf="${u}" role="button" tabindex="0"><b>${u.toUpperCase()}</b><div class="dv"><i style="background:${C[w].col};${w ? 'left:50%' : 'right:50%'};width:${len}%"></i></div><em>${pf(m, 1)}</em></div>`; }).join('');
  const regs = {}; rows.forEach((u) => { const r = UF_META[u].reg; (regs[r] ||= [0, 0]); regs[r][0] += st[u].v[0]; regs[r][1] += st[u].v[1]; });
  $('#regions').innerHTML = Object.entries(regs).map(([r, v]) => { const t = v[0] + v[1], p0 = (v[0] / t) * 100;
    return `<div class="reg"><b>${r}</b><div class="stack"><span style="width:${p0}%;background:${C[0].col}">${pf(p0, 1)}%</span><span style="width:${100 - p0}%;background:${C[1].col};justify-content:flex-end">${pf(100 - p0, 1)}%</span></div></div>`; }).join('');
}
function renderCityWon() {
  const el = $('#cwon'); if (!el) return; const t = tally[0] + tally[1];
  el.innerHTML = t ? `<div class="big" style="margin-top:18px"><span class="a">${nf.format(tally[0])}</span><span class="b">${nf.format(tally[1])}</span></div><div class="split"><i style="width:${(tally[0] / t) * 100}%"></i><i style="width:${(tally[1] / t) * 100}%"></i></div><p class="muted">${nf.format(t)} cidades carregadas até agora</p>` : '<p class="muted" style="margin-top:14px">Carregue as cidades no mapa para ver quantas cada um venceu.</p>';
}

// ---------- mapa de estados ----------
const svgS = $('#svgS'), svgC = $('#svgC'), gC = $('#gC');
function renderStateMap() {
  svgS.innerHTML = UFS.map((u) => { const r = st[u]; const f = r && r.v[0] + r.v[1] ? `fill="${C[lead(r.v)].col}" fill-opacity="${band(marg(r.v) * 1.6)}"` : `fill="var(--empty)"`;
    return `<path d="${UF_PATHS[u]}" data-uf="${u}" ${f}><title>${UF_META[u].name}</title></path>`; }).join('');
}
svgS.addEventListener('click', (e) => { const u = e.target.dataset?.uf; if (u) selectUF(u); });

// ---------- cidades ----------
const MX = (lo) => ((lo * Math.PI) / 180 + 1.3) * 900;
const MY = (la) => (0.1 - Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360))) * 900;
function toPath(g, bb) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; let d = '';
  for (const poly of polys) for (const ring of poly) { let px = 1e9, py = 1e9, f = true;
    for (const [lo, la] of ring) { const x = MX(lo), y = MY(la); if (!f && Math.abs(x - px) < 0.35 && Math.abs(y - py) < 0.35) continue;
      d += (f ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1); f = false; px = x; py = y;
      if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y; }
    d += 'Z'; }
  return d;
}
function paint(el, r) { if (!r || r[0] + r[1] === 0) return; el.setAttribute('fill', C[lead(r)].col); el.setAttribute('fill-opacity', band(marg(r))); }
let rafP = 0;
function progress() {
  if (rafP) return; rafP = requestAnimationFrame(() => { rafP = 0; $('#prog').hidden = total > 0 && done >= total;
    $('#prog-fill').style.width = (total ? (done / total) * 100 : 0) + '%'; $('#prog-text').textContent = `Cidades carregadas: ${nf.format(done)} de ${nf.format(total)}`; renderCityWon(); });
}
const getCM = () => (cmP ||= getJ(`${T}/config/mun-${E6}-cm.json`, 25000));

function loadUF(uf) {
  if (loading[uf]) return loading[uf];
  return (loading[uf] = (async () => {
    const id = UF_META[uf].ibge;
    const [gj, nm, cm] = await Promise.all([getJ(`/api/ibge?t=malha&uf=${id}`, 40000), getJ(`/api/ibge?t=nomes&uf=${id}`, 40000), getCM()]);
    if (!gj || !cm) { $('#map-note').textContent = !gj ? 'Não consegui carregar a malha de cidades do IBGE.' : 'Não consegui carregar a lista de municípios do TSE.'; delete loading[uf]; return; }
    const names = {}, byKey = new Map(), byName = new Map();
    (nm || []).forEach((m) => { const c = String(m.id); names[c] = m.nome; byKey.set(c, c); if (!byKey.has(c.slice(0, 6))) byKey.set(c.slice(0, 6), c); byKey.set(c.slice(2), c); byName.set(norm(m.nome), c); });
    const mu = (cm.abr || []).find((a) => String(a.cd).toLowerCase() === uf)?.mu || [];
    const tse = {}; let hit = 0;
    mu.forEach((m) => { const c = byKey.get(String(m.cdi)) || byName.get(norm(m.nm || m.ds || m.n)); if (c) { tse[c] = String(m.cd).padStart(5, '0'); hit++; } });
    const bb = [1e9, 1e9, -1e9, -1e9], g = document.createElementNS(NS, 'g'), list = [];
    (gj.features || []).forEach((f) => { const code = String(f.properties?.codarea || f.properties?.id || ''); const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', toPath(f.geometry, bb)); el.setAttribute('fill', 'var(--empty)'); el.dataset.u = uf; el.dataset.i = list.length;
      g.appendChild(el); list.push({ code, name: names[code] || 'Cidade', el, tse: tse[code], r: null }); });
    ufBB[uf] = bb; cities[uf] = list; gC.appendChild(g); total += list.filter((c) => c.tse).length; progress();
    if (hit < mu.length * 0.9) $('#map-note').textContent = `Atenção: só ${hit} de ${mu.length} cidades de ${uf.toUpperCase()} foram ligadas ao mapa.`;
    const key = `r26:${ELE}:${uf}`; let cache = null; try { cache = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
    const out = {};
    await pool(list.filter((c) => c.tse), 10, async (c) => {
      let r = cache?.[c.code]; if (!r) { const p = parse(await getJ(`${T}/dados/${uf}/${uf}${c.tse}-c0001-${E6}-u.json`)); r = p && p.v; }
      if (r) { c.r = r; out[c.code] = r; paint(c.el, r); tally[lead(r)]++; }
      done++; progress(); });
    if (nat?.final && !cache) { try { localStorage.setItem(key, JSON.stringify(out)); } catch {} }
  })());
}

let vb = [0, 0, 644, 664], raf = 0;
function zoomTo(bb) {
  const pad = Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.08 + 4, to = [bb[0] - pad, bb[1] - pad, bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad], from = vb.slice(), t0 = performance.now();
  cancelAnimationFrame(raf);
  const step = (t) => { const k = Math.min(1, (t - t0) / 320), e = 1 - Math.pow(1 - k, 3); vb = from.map((x, i) => x + (to[i] - x) * e); svgC.setAttribute('viewBox', vb.map((x) => x.toFixed(1)).join(' ')); if (k < 1) raf = requestAnimationFrame(step); };
  raf = requestAnimationFrame(step);
}
function setMode(m) { svgS.hidden = m !== 'S'; svgC.hidden = m === 'S'; }
async function selectUF(uf) {
  mark(uf); setMode('C'); await loadUF(uf); if (ufBB[uf]) zoomTo(ufBB[uf]); showState(uf);
}
async function showAll() {
  mark('B'); setMode('C'); $('#cbox').innerHTML = '<p class="muted">Carregando todas as cidades. Isso baixa milhares de pequenos arquivos do TSE, então pode levar alguns minutos.</p>';
  zoomTo([0, 0, 644, 664]); await pool(UFS, 3, (u) => loadUF(u));
}
function mark(k) { document.querySelectorAll('#chips button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k))); }
$('#chips').innerHTML = `<button data-k="S" aria-pressed="true">Estados</button><button data-k="B" aria-pressed="false">Cidades · Brasil</button>` + UFS.map((u) => `<button data-k="${u}" aria-pressed="false">${u.toUpperCase()}</button>`).join('');
$('#chips').addEventListener('click', (e) => { const k = e.target.dataset?.k; if (!k) return; if (k === 'S') { mark('S'); setMode('S'); showNat(); } else if (k === 'B') showAll(); else selectUF(k); });

// ---------- detalhes ----------
function bars(v, extra = '') {
  const t = v[0] + v[1] || 1;
  return [0, 1].map((i) => `<div class="row"><b style="color:${C[i].col}">${C[i].n.split(' ')[0]}</b><div class="bar"><i style="width:${(v[i] / t) * 100}%;background:${C[i].col}"></i></div><span>${pf((v[i] / t) * 100)}% · ${nf.format(v[i])}</span></div>`).join('') + extra;
}
function showState(uf) { const r = st[uf]; if (r) $('#cbox').innerHTML = `<h3>${UF_META[uf].name}</h3>${bars(r.v)}<p class="muted">${C[lead(r.v)].n} venceu por ${pf(marg(r.v))} p.p.</p>`; }
function showNat() { $('#cbox').innerHTML = '<p class="muted">Selecione uma cidade ou estado no mapa.</p>'; svgC.setAttribute('viewBox', '0 0 644 664'); vb = [0, 0, 644, 664]; }
svgC.addEventListener('click', (e) => {
  const { u, i } = e.target.dataset || {}; if (u === undefined) return; const c = cities[u][+i];
  $('#sel').setAttribute('d', c.el.getAttribute('d'));
  $('#cbox').innerHTML = c.r ? `<h3>${c.name} · ${u.toUpperCase()}</h3>${bars(c.r)}<p class="muted">${C[lead(c.r)].n} venceu por ${pf(marg(c.r))} p.p.</p>` : `<h3>${c.name} · ${u.toUpperCase()}</h3><p class="muted">Resultado ainda não carregado.</p>`;
});
$('#margins').addEventListener('click', (e) => { const u = e.target.closest('.mrow')?.dataset.uf; if (u) { selectUF(u); $('#chips').scrollIntoView({ behavior: 'smooth', block: 'start' }); } });

// ---------- relatório compartilhável ----------
const sel = () => [...document.querySelectorAll('#toggles input:checked')].map((i) => i.value);
function reportText() {
  const s = sel(), [a, b] = nat.v, t = a + b, w = lead(nat.v), L = [`🗳️ Resultado ${nat.final ? 'final' : 'parcial'} do 2º turno 2026 (TSE)`];
  if (s.includes('res')) L.push('', `${C[w].n} ${nat.final ? 'venceu' : 'lidera'}:`, `• ${C[0].n}: ${pf((a / t) * 100)}% (${nf.format(a)} votos)`, `• ${C[1].n}: ${pf((b / t) * 100)}% (${nf.format(b)} votos)`, `Diferença: ${nf.format(Math.abs(a - b))} votos (${pf(marg(nat.v))} p.p.)`);
  if (s.includes('map')) { const x = [0, 0]; UFS.forEach((u) => st[u] && x[lead(st[u].v)]++); L.push('', `Estados vencidos: ${C[0].n.split(' ')[0]} ${x[0]} × ${x[1]} ${C[1].n.split(' ')[0]}`); }
  if (s.includes('city') && tally[0] + tally[1]) L.push(`Cidades vencidas: ${nf.format(tally[0])} × ${nf.format(tally[1])} (${nf.format(tally[0] + tally[1])} carregadas)`);
  if (s.includes('part')) L.push('', `Comparecimento: ${pf((nat.comp / nat.te) * 100)}% · Abstenção: ${pf((nat.abst / nat.te) * 100)}%`, `Brancos: ${pf((nat.blank / nat.tv) * 100)}% · Nulos: ${pf((nat.nul / nat.tv) * 100)}%`);
  L.push('', `Mapa por cidades e gráficos: ${location.origin}/resultado.html`); return L.join('\n');
}
async function buildCanvas() {
  await document.fonts.ready; const s = sel(), W = 1080, pad = 60, cv = document.createElement('canvas'); cv.width = W; cv.height = 3400; const x = cv.getContext('2d');
  const F = (w, z) => `${w} ${z}px Geist, system-ui, sans-serif`; let y = 0;
  const tx = (t, X, Y, z, w, col, al = 'left') => { x.font = F(w, z); x.fillStyle = col; x.textAlign = al; x.fillText(t, X, Y); };
  const INK = '#f5f7fa', MUT = '#8a92a4', [a, b] = nat.v, t = a + b, w = lead(nat.v);
  x.fillStyle = '#0b0d11'; x.fillRect(0, 0, W, 3400);
  const g1 = x.createRadialGradient(0, 0, 0, 0, 0, 700); g1.addColorStop(0, 'rgba(225,29,46,.3)'); g1.addColorStop(1, 'transparent'); x.fillStyle = g1; x.fillRect(0, 0, W, 800);
  const g2 = x.createRadialGradient(W, 0, 0, W, 0, 700); g2.addColorStop(0, 'rgba(59,130,246,.3)'); g2.addColorStop(1, 'transparent'); x.fillStyle = g2; x.fillRect(0, 0, W, 800);
  y = 100; tx(`RESULTADO ${nat.final ? 'FINAL' : 'PARCIAL'} · 2º TURNO 2026`, pad, y, 26, 600, MUT);
  const bar = (Y, p0, h = 18) => { x.fillStyle = '#1a1e29'; x.beginPath(); x.roundRect(pad, Y, W - 2 * pad, h, h / 2); x.fill(); x.save(); x.beginPath(); x.roundRect(pad, Y, W - 2 * pad, h, h / 2); x.clip(); x.fillStyle = C[0].col; x.fillRect(pad, Y, (W - 2 * pad) * p0, h); x.fillStyle = C[1].col; x.fillRect(pad + (W - 2 * pad) * p0, Y, (W - 2 * pad) * (1 - p0), h); x.restore(); };
  if (s.includes('res')) {
    y += 70; tx(`${C[w].n} ${nat.final ? 'é o presidente eleito' : 'lidera a apuração'}`, pad, y, 54, 700, INK);
    y += 150; tx(pf((a / t) * 100) + '%', pad, y, 120, 700, C[0].col); tx(pf((b / t) * 100) + '%', W - pad, y, 120, 700, C[1].col, 'right');
    y += 52; tx(C[0].n, pad, y, 32, 600, INK); tx(C[1].n, W - pad, y, 32, 600, INK, 'right');
    y += 42; tx(nf.format(a) + ' votos', pad, y, 28, 400, MUT); tx(nf.format(b) + ' votos', W - pad, y, 28, 400, MUT, 'right');
    y += 36; bar(y, a / t); y += 70; tx(`Diferença: ${nf.format(Math.abs(a - b))} votos (${pf(marg(nat.v))} p.p.)`, pad, y, 30, 500, INK);
  }
  if (s.includes('map')) {
    y += 60; const S = 760 / 640, ox = (W - 760) / 2; x.save(); x.translate(ox, y); x.scale(S, S);
    UFS.forEach((u) => { const r = st[u]; x.globalAlpha = r && r.v[0] + r.v[1] ? band(marg(r.v) * 1.6) : 1; x.fillStyle = r && r.v[0] + r.v[1] ? C[lead(r.v)].col : '#1a1e29'; const p = new Path2D(UF_PATHS[u]); x.fill(p); x.globalAlpha = 1; x.strokeStyle = '#0b0d11'; x.lineWidth = 1.2; x.stroke(p); });
    x.restore(); y += 760 + 30; const n = [0, 0]; UFS.forEach((u) => st[u] && n[lead(st[u].v)]++);
    tx(`Estados: ${n[0]} × ${n[1]}`, W / 2, y, 34, 700, INK, 'center');
    if (s.includes('city') && tally[0] + tally[1]) { y += 46; tx(`Cidades: ${nf.format(tally[0])} × ${nf.format(tally[1])}`, W / 2, y, 28, 500, MUT, 'center'); }
  } else if (s.includes('city') && tally[0] + tally[1]) { y += 70; tx(`Cidades vencidas: ${nf.format(tally[0])} × ${nf.format(tally[1])}`, pad, y, 34, 700, INK); y += 30; bar(y, tally[0] / (tally[0] + tally[1])); }
  if (s.includes('reg')) {
    y += 80; tx('Por região', pad, y, 34, 700, INK); const regs = {}; UFS.forEach((u) => { const r = UF_META[u].reg; (regs[r] ||= [0, 0]); regs[r][0] += st[u]?.v[0] || 0; regs[r][1] += st[u]?.v[1] || 0; });
    Object.entries(regs).forEach(([r, v]) => { y += 58; tx(r, pad, y, 26, 500, MUT); tx(`${pf((v[0] / (v[0] + v[1])) * 100, 1)}%  ×  ${pf((v[1] / (v[0] + v[1])) * 100, 1)}%`, W - pad, y, 26, 600, INK, 'right'); y += 14; bar(y, v[0] / (v[0] + v[1]), 14); y += 14; });
  }
  if (s.includes('part')) {
    y += 80; tx('Participação', pad, y, 34, 700, INK);
    [['Comparecimento', nat.comp / nat.te], ['Abstenção', nat.abst / nat.te], ['Brancos', nat.blank / nat.tv], ['Nulos', nat.nul / nat.tv]].forEach(([l, p]) => { y += 52; tx(l, pad, y, 28, 400, MUT); tx(pf(p * 100) + '%', W - pad, y, 28, 600, INK, 'right'); });
  }
  y += 90; tx(`Fonte: TSE · ${nat.dt} ${nat.ht} · ${location.host}`, W / 2, y, 22, 400, MUT, 'center'); y += 50;
  const out = $('#preview'); out.width = W; out.height = y; out.getContext('2d').drawImage(cv, 0, 0, W, y, 0, 0, W, y); out.hidden = false; return out;
}
const msg = (s) => { $('#share-msg').textContent = s; };
const refreshText = () => { const t = reportText(); $('#txt').textContent = t; $('#b-wa').href = 'https://wa.me/?text=' + encodeURIComponent(t); return t; };
$('#toggles').addEventListener('change', refreshText);
$('#b-gen').addEventListener('click', async () => { try { await buildCanvas(); refreshText(); msg('Imagem pronta. Agora é com você: compartilhar, baixar ou ignorar.'); } catch { msg('Não consegui gerar a imagem neste navegador.'); } });
$('#b-dl').addEventListener('click', async () => { const cv = await buildCanvas(); const a = document.createElement('a'); a.download = 'resultado-2turno-2026.png'; a.href = cv.toDataURL('image/png'); a.click(); });
$('#b-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(refreshText()); msg('Texto copiado.'); } catch { msg('Não consegui copiar. Selecione o texto abaixo.'); } });
$('#b-share').addEventListener('click', async () => {
  try {
    const cv = await buildCanvas(), text = refreshText(), blob = await new Promise((r) => cv.toBlob(r, 'image/png')), file = new File([blob], 'resultado-2turno-2026.png', { type: 'image/png' });
    const data = { title: 'Resultado do 2º turno 2026', text, url: location.origin + '/resultado.html' };
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ ...data, files: [file] });
    else if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(text); msg('Compartilhamento direto indisponível aqui. Texto copiado.'); }
  } catch (e) { if (e.name !== 'AbortError') msg('Não foi possível compartilhar.'); }
});

// ---------- inicialização ----------
(async function init() {
  const [br] = await Promise.all([getJ(`${T}/dados/br/br-c0001-${E6}-u.json`),
    pool(UFS.concat('zz'), 8, async (u) => { const p = parse(await getJ(`${T}/dados/${u}/${u}-c0001-${E6}-u.json`)); if (p) st[u] = p; })]);
  nat = parse(br);
  if (!nat) { $('#h-title').textContent = 'Não consegui carregar os dados do TSE agora.'; $('#status').textContent = 'Sem conexão com o TSE'; return; }
  renderHero(); renderStateMap(); renderCharts(); refreshText();
})();
