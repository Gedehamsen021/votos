// Mapa por estado: cada estado com a cor de quem lidera ali, atualizado sozinho a cada 30 s.
// Usa MAPA_BR (mapa-brasil.js) e as variáveis globais de app.js e compartilhar.js
// (urlResultado, normalizar, slotDe, corDe, uf, pct, fmtPp, titulo…).

const MAPA_INTERVALO_MS = 30000;
const SVG_NS = "http://www.w3.org/2000/svg";
const SIGLAS = Object.keys(MAPA_BR.estados);
const REGIOES = {
  Norte: ["ac", "am", "ap", "pa", "ro", "rr", "to"],
  Nordeste: ["al", "ba", "ce", "ma", "pb", "pe", "pi", "rn", "se"],
  "Centro-Oeste": ["df", "go", "ms", "mt"],
  Sudeste: ["es", "mg", "rj", "sp"],
  Sul: ["pr", "rs", "sc"],
};
// Ajuste fino (em unidades do mapa) da posição das siglas em estados de formato irregular.
const AJUSTE_ROTULO = { go: [-8, 14] };   // separa GO de DF
const nomeEstado = (s) => MAPA_BR.estados[s]?.nome || NOME_UF[s] || s.toUpperCase();
const temVotos = (d) => Boolean(d && d.cands.some((c) => c.votos > 0));

const mapaDados = new Map();   // sigla -> resultado normalizado mais novo
let mapaTimer = null, mapaIniciado = false, mapaAtualizadoEm = 0, resumoAgendado = false;
let ultimoPonteiro = "mouse", dicaFixa = null, dicaDe = null;

// ---------- desenho ----------
function montarMapa() {
  const svg = $("mapa");
  svg.setAttribute("viewBox", MAPA_BR.viewBox);
  // hachurado para estados ainda sem votos
  svg.innerHTML = `<defs><pattern id="hachura-sem-votos" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect class="hachura-fundo" width="6" height="6"/><line class="hachura-linha" x1="0" y1="0" x2="0" y2="6"/></pattern></defs>`;
  const estados = document.createElementNS(SVG_NS, "g");
  for (const s of SIGLAS) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", MAPA_BR.estados[s].d);
    p.setAttribute("id", `uf-${s}`);
    p.setAttribute("class", "uf");
    p.setAttribute("tabindex", "0");
    p.setAttribute("role", "button");
    p.setAttribute("aria-label", nomeEstado(s));
    p.dataset.uf = s;
    estados.append(p);
  }
  svg.append(estados);
  // contornos de destaque por cima de todos os estados
  for (const id of ["destaque-sel", "destaque-hover"]) {
    const u = document.createElementNS(SVG_NS, "use");
    u.id = id;
    svg.append(u);
  }
  const rotulos = document.createElementNS(SVG_NS, "g");
  rotulos.setAttribute("class", "uf-rotulos");
  rotulos.setAttribute("aria-hidden", "true");
  for (const s of SIGLAS) {
    const b = $(`uf-${s}`).getBBox();
    const [dx, dy] = AJUSTE_ROTULO[s] || [0, 0];
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", (b.x + b.width / 2 + dx).toFixed(1));
    t.setAttribute("y", (b.y + b.height / 2 + dy).toFixed(1));
    t.textContent = s.toUpperCase();
    rotulos.append(t);
  }
  svg.append(rotulos);
}

function classeDe(d) {
  if (!temVotos(d)) return "uf sem-votos";
  const [c1, c2] = d.cands;
  const margem = c1.pct - (c2?.pct || 0);
  const cor = slotDe.has(c1.id) ? `c${slotDe.get(c1.id)}` : "co";
  return `uf ${cor} v${margem < 5 ? 1 : margem < 15 ? 2 : 3}`;
}

function pintar(s) {
  const el = $(`uf-${s}`);
  if (!el) return;
  const d = mapaDados.get(s);
  el.setAttribute("class", classeDe(d));
  el.setAttribute("aria-label", temVotos(d)
    ? `${nomeEstado(s)}: ${titulo(d.cands[0].nome)} lidera com ${pct(d.cands[0].pct)}`
    : `${nomeEstado(s)}: sem votos apurados`);
}

function destacar(id, s) {
  const u = $(id);
  if (s && $(`uf-${s}`)) u.setAttribute("href", `#uf-${s}`);
  else u.removeAttribute("href");
}

// ---------- dica (tooltip) ----------
function preencherDica(s, comBotao) {
  const caixa = $("mapa-dica");
  const d = mapaDados.get(s);
  dicaDe = s;
  caixa.replaceChildren();
  caixa.classList.toggle("fixa", comBotao);
  caixa.append(Object.assign(document.createElement("strong"), { textContent: nomeEstado(s) }));
  const sub = (texto) => caixa.append(Object.assign(document.createElement("div"), { className: "muted", textContent: texto }));
  if (!d) { sub("carregando…"); return; }
  sub(`${pct(d.pst)} das seções apuradas`);
  if (!temVotos(d)) { sub("Sem votos apurados ainda"); return; }
  const ul = document.createElement("ul");
  for (const c of d.cands.slice(0, 3)) {
    const li = document.createElement("li");
    const cor = document.createElement("i");
    cor.style.background = corDe(c.id);
    li.append(cor, Object.assign(document.createElement("span"), { textContent: titulo(c.nome) }),
      Object.assign(document.createElement("b"), { textContent: pct(c.pct) }));
    ul.append(li);
  }
  caixa.append(ul);
  if (d.cands[1]) sub(`Vantagem do 1º: ${fmtPp(d.cands[0].pct - d.cands[1].pct)}`);
  if (comBotao) {
    const b = Object.assign(document.createElement("button"), { type: "button", className: "botao pequeno", textContent: `Ver ${nomeEstado(s)} em detalhe` });
    b.addEventListener("click", () => selecionarEstado(s));
    caixa.append(b);
  } else {
    caixa.append(Object.assign(document.createElement("div"), { className: "dica-acao", textContent: "Clique para ver em detalhe" }));
  }
}

function posicionarDica(x, y) {
  const caixa = $("mapa-dica"), area = $("mapa-caixa");
  caixa.hidden = false;
  const w = caixa.offsetWidth, h = caixa.offsetHeight, W = area.clientWidth, H = area.clientHeight;
  let left = x + 16, top = y + 16;
  if (left + w > W) left = x - w - 16;
  if (top + h > H) top = y - h - 16;
  caixa.style.left = `${Math.max(0, Math.min(left, W - w))}px`;
  caixa.style.top = `${Math.max(0, top)}px`;
}

function esconderDica() {
  $("mapa-dica").hidden = true;
  dicaFixa = null;
  dicaDe = null;
  destacar("destaque-hover", null);
}

function dicaNoEstado(s, comBotao) {
  const area = $("mapa-caixa").getBoundingClientRect(), b = $(`uf-${s}`).getBoundingClientRect();
  destacar("destaque-hover", s);
  preencherDica(s, comBotao);
  posicionarDica(b.left + b.width / 2 - area.left, b.top + b.height / 2 - area.top);
}

function selecionarEstado(s) {
  esconderDica();
  const sel = $("uf");
  if (sel.value !== s) { sel.value = s; sel.dispatchEvent(new Event("change")); }
  document.querySelector(".herois").scrollIntoView({ behavior: "smooth", block: "start" });
}

function ligarEventos() {
  const svg = $("mapa");
  svg.addEventListener("pointerdown", (e) => { ultimoPonteiro = e.pointerType; });
  svg.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || dicaFixa) return;
    const alvo = e.target.closest(".uf");
    if (!alvo) { esconderDica(); return; }
    const s = alvo.dataset.uf;
    if (dicaDe !== s) { destacar("destaque-hover", s); preencherDica(s, false); }
    const area = $("mapa-caixa").getBoundingClientRect();
    posicionarDica(e.clientX - area.left, e.clientY - area.top);
  });
  svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !dicaFixa) esconderDica(); });
  svg.addEventListener("click", (e) => {
    const alvo = e.target.closest(".uf");
    if (!alvo) { esconderDica(); return; }
    const s = alvo.dataset.uf;
    if (ultimoPonteiro === "mouse") { selecionarEstado(s); return; }
    // no toque, o primeiro toque mostra o resumo com um botão para abrir o estado
    dicaFixa = s;
    dicaNoEstado(s, true);
  });
  svg.addEventListener("focusin", (e) => { const alvo = e.target.closest(".uf"); if (alvo) dicaNoEstado(alvo.dataset.uf, false); });
  svg.addEventListener("focusout", () => { if (!dicaFixa) esconderDica(); });
  svg.addEventListener("keydown", (e) => {
    const s = e.target.dataset?.uf;
    if (s && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selecionarEstado(s); }
  });
  document.addEventListener("click", (e) => { if (dicaFixa && !$("mapa-caixa").contains(e.target)) esconderDica(); });
  $("mapa-brasil").addEventListener("click", () => {
    const sel = $("uf");
    sel.value = "br";
    sel.dispatchEvent(new Event("change"));
  });
}

// ---------- resumo: legenda, regiões, exterior e lista ----------
function agendarResumo() {
  if (resumoAgendado) return;
  resumoAgendado = true;
  requestAnimationFrame(() => { resumoAgendado = false; resumir(); });
}

function barraMini(partes) {
  const barra = document.createElement("div");
  barra.className = "mini-barra";
  for (const p of partes) {
    const seg = document.createElement("div");
    seg.style.flex = `0 0 ${p.pct}%`;
    seg.style.background = p.cor;
    seg.title = `${p.nome}: ${pct(p.pct)}`;
    barra.append(seg);
  }
  return barra;
}

function resumir() {
  // quantos estados cada candidatura lidera
  const lideres = new Map();
  let semVotos = 0, carregados = 0;
  for (const s of SIGLAS) {
    const d = mapaDados.get(s);
    if (d) carregados++;
    if (!temVotos(d)) { semVotos++; continue; }
    const c1 = d.cands[0], chave = slotDe.has(c1.id) ? c1.id : "outros";
    if (!lideres.has(chave)) lideres.set(chave, { nome: chave === "outros" ? "Outras candidaturas" : titulo(c1.nome), cor: chave === "outros" ? "var(--outros)" : corDe(c1.id), n: 0 });
    lideres.get(chave).n++;
  }
  const itens = [...lideres.values()].sort((a, b) => b.n - a.n);
  if (semVotos) itens.push({ nome: "Sem votos apurados", cor: "", classe: "sem-votos", n: semVotos });
  $("mapa-legenda").replaceChildren(...itens.map((it) => {
    const li = document.createElement("li");
    const cor = document.createElement("i");
    if (it.classe) cor.className = it.classe; else cor.style.background = it.cor;
    li.append(cor, Object.assign(document.createElement("span"), { textContent: it.nome }),
      Object.assign(document.createElement("b"), { textContent: `${it.n} ${it.n === 1 ? "estado" : "estados"}` }));
    return li;
  }));

  // regiões: soma dos votos dos estados de cada região
  $("mapa-regioes").replaceChildren(...Object.entries(REGIOES).map(([nome, siglas]) => {
    const votos = new Map();
    let vv = 0, st = 0, ts = 0;
    for (const s of siglas) {
      const d = mapaDados.get(s);
      if (!d) continue;
      vv += d.vv; st += d.st; ts += d.ts;
      for (const c of d.cands) {
        if (!votos.has(c.id)) votos.set(c.id, { c, votos: 0 });
        votos.get(c.id).votos += c.votos;
      }
    }
    const linha = document.createElement("div");
    linha.className = "regiao";
    const ranking = [...votos.values()].sort((a, b) => b.votos - a.votos);
    const cab = document.createElement("div");
    cab.className = "regiao-cab";
    cab.append(Object.assign(document.createElement("strong"), { textContent: nome }),
      Object.assign(document.createElement("span"), { className: "muted", textContent: ts ? `${pct((100 * st) / ts, 0)} apurado` : "" }));
    linha.append(cab);
    if (vv > 0 && ranking[0]?.votos > 0) {
      const partes = ranking.filter((r) => slotDe.has(r.c.id)).map((r) => ({ nome: titulo(r.c.nome), pct: (100 * r.votos) / vv, cor: corDe(r.c.id) }));
      const resto = 100 - partes.reduce((s, p) => s + p.pct, 0);
      if (resto > 0.05) partes.push({ nome: "Outros", pct: resto, cor: "var(--outros)" });
      linha.append(barraMini(partes), Object.assign(document.createElement("div"), {
        className: "regiao-lider", textContent: `${titulo(ranking[0].c.nome)} lidera com ${pct((100 * ranking[0].votos) / vv)}`,
      }));
    } else {
      linha.append(Object.assign(document.createElement("div"), { className: "regiao-lider muted", textContent: "Sem votos apurados ainda" }));
    }
    return linha;
  }));

  // exterior
  const zz = mapaDados.get("zz"), ext = $("mapa-exterior");
  ext.hidden = !temVotos(zz);
  if (temVotos(zz)) {
    const c1 = zz.cands[0];
    const cor = document.createElement("i");
    cor.style.background = corDe(c1.id);
    ext.replaceChildren(cor, `Exterior: ${titulo(c1.nome)} lidera com ${pct(c1.pct)} (${pct(zz.pst, 0)} apurado)`);
  }

  // lista com todos os estados (útil no celular, onde os estados pequenos são difíceis de tocar)
  $("mapa-lista").replaceChildren(...[...SIGLAS].sort((a, b) => nomeEstado(a).localeCompare(nomeEstado(b), "pt-BR")).map((s) => {
    const d = mapaDados.get(s);
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    tr.addEventListener("click", () => selecionarEstado(s));
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") selecionarEstado(s); });
    const td = (texto, classe) => Object.assign(document.createElement("td"), { textContent: texto, className: classe || "" });
    const nome = td(nomeEstado(s));
    if (temVotos(d)) {
      const [c1, c2] = d.cands;
      const lider = td("");
      const cor = document.createElement("i");
      cor.style.background = corDe(c1.id);
      lider.append(cor, titulo(c1.nome));
      tr.append(nome, lider, td(pct(c1.pct), "num"), td(c2 ? fmtPp(c1.pct - c2.pct) : "–", "num"), td(pct(d.pst, 0), "num"));
    } else {
      tr.append(nome, td(d ? "sem votos ainda" : "carregando…", "muted"), td("–", "num"), td("–", "num"), td(d ? pct(d.pst, 0) : "–", "num"));
    }
    return tr;
  }));

  const hora = mapaAtualizadoEm ? new Date(mapaAtualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  $("mapa-status").textContent = carregados < SIGLAS.length
    ? `carregando estados… ${carregados}/${SIGLAS.length}`
    : `atualiza sozinho a cada 30 s${hora ? ` · ${hora}` : ""}`;
  if (dicaDe && !$("mapa-dica").hidden) preencherDica(dicaDe, Boolean(dicaFixa));
}

// ---------- dados ----------
function guardar(s, d) {
  const atual = mapaDados.get(s);
  if (atual && d.geradoEm && d.geradoEm < atual.geradoEm) return;   // versão antiga entregue pela CDN
  mapaDados.set(s, d);
  pintar(s);
  agendarResumo();
}

async function cicloMapa() {
  clearTimeout(mapaTimer);
  if (document.hidden) { mapaTimer = setTimeout(cicloMapa, 5000); return; }   // aba escondida: não consulta
  const fila = [...SIGLAS, "zz"];
  const trabalhar = async () => {
    while (fila.length) {
      const s = fila.shift();
      try {
        const r = await fetch(urlResultado(s), { cache: "no-cache" });
        if (r.ok) guardar(s, normalizar(await r.json()));
      } catch { /* tenta de novo no próximo ciclo */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabalhar));   // no máximo 6 pedidos ao mesmo tempo
  mapaAtualizadoEm = Date.now();
  agendarResumo();
  mapaTimer = setTimeout(cicloMapa, MAPA_INTERVALO_MS);
}

function iniciarMapa() {
  montarMapa();
  ligarEventos();
  resumir();
  document.addEventListener("dados", (e) => {
    const d = e.detail;
    if (uf !== "br") guardar(uf, d);   // o estado aberto (ou o exterior) chega a cada 5 s
    for (const s of SIGLAS) pintar(s);                                // as cores podem ter sido definidas agora
    destacar("destaque-sel", uf);
    $("mapa-brasil").hidden = uf === "br";
    agendarResumo();
    if (!mapaIniciado) { mapaIniciado = true; cicloMapa(); }
  });
}

iniciarMapa();
