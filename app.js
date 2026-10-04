// Apuração ao vivo – Eleição 2026, Presidente (TSE).
// Parâmetros opcionais na URL: ?uf=sp  ?e=6257  ?ciclo=ele2026  ?arquivo=<url completa do JSON>
const qs = new URLSearchParams(location.search);
const CICLO = qs.get("ciclo") || "ele2026";
const ELEICAO = qs.get("e") || "6257";
const CARGO = 1;
const INTERVALO_MS = 5000;
const TSE = "https://resultados.tse.jus.br";

const UFS = ["br", "ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt",
  "pa", "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to", "zz"];
const NOME_UF = { br: "Brasil", zz: "Exterior" };

// Rodando pelo server.js (localhost) usa o proxy /tse; em hospedagem estática busca o TSE direto.
const BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "/tse" : TSE;

const pad = (n, len) => String(n).padStart(len, "0");
const montarUrl = (codigo, uf) =>
  `${BASE}/oficial/${CICLO}/${codigo}/dados-simplificados/${uf}/${uf}-c${pad(CARGO, 4)}-e${pad(codigo, 6)}-r.json`;
const urlFoto = (codigo, uf, sqcand) => `${TSE}/oficial/${CICLO}/${codigo}/fotos/${uf}/${sqcand}.jpeg`;

const $ = (id) => document.getElementById(id);
const fmtInt = new Intl.NumberFormat("pt-BR");
const num = (v) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "0");
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s) || 0;
};
const pct = (v, casas = 2) => `${num(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const cssVar = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

let uf = (qs.get("uf") || "br").toLowerCase();
if (!UFS.includes(uf)) uf = "br";
let codigoOk = null;          // código de eleição cujo arquivo respondeu
let timer = null;
let grafico = null;
const ultimoVoto = new Map();
const SLOTS = ["--s1", "--s2", "--s3", "--s4"];
const slotDe = new Map();     // sqcand -> índice da cor (a cor segue o candidato, não a posição)

// ---------- histórico (fica só neste navegador) ----------
const chaveHist = () => `hist-${CICLO}-${ELEICAO}-${uf}`;
function lerHist() {
  try { return JSON.parse(localStorage.getItem(chaveHist())) || []; } catch { return []; }
}
function salvarHist(h) {
  try { localStorage.setItem(chaveHist(), JSON.stringify(h.slice(-500))); } catch { /* sem storage */ }
}

// ---------- busca dos dados, com descoberta automática do arquivo ----------
async function tentar(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return { url, status: r.status, json: r.ok ? await r.json() : null };
  } catch (e) {
    return { url, status: `falha de rede/CORS (${e.message})`, json: null };
  }
}

// Procura códigos de eleição nos arquivos de configuração públicos do TSE.
async function codigosDaConfig(log) {
  const achados = [];
  for (const cfg of [`${BASE}/oficial/${CICLO}/comum/config/ele-c.json`, `${BASE}/oficial/comum/config/ele-c.json`]) {
    const r = await tentar(cfg);
    log.push(r);
    if (!r.json) continue;
    (function varrer(o) {
      if (Array.isArray(o)) return o.forEach(varrer);
      if (o && typeof o === "object") {
        if (o.cd && /^\d+$/.test(String(o.cd)) && (o.nm || o.tp || o.t)) {
          const nome = `${o.nm || ""} ${o.tp || ""}`;
          achados.push({ cd: String(Number(o.cd)), peso: /federal|presid|geral/i.test(nome) ? 0 : 1 });
        }
        Object.values(o).forEach(varrer);
      }
    })(r.json);
  }
  achados.sort((a, b) => a.peso - b.peso);
  return [...new Set(achados.map((a) => a.cd))];
}

async function buscar() {
  if (qs.get("arquivo")) {
    const r = await tentar(qs.get("arquivo"));
    return r.json ? r.json : Promise.reject([r]);
  }
  const log = [];
  if (codigoOk) {
    const r = await tentar(montarUrl(codigoOk, uf));
    if (r.json) return r.json;
    log.push(r);
  }
  const r = await tentar(montarUrl(ELEICAO, uf));
  log.push(r);
  if (r.json) { codigoOk = ELEICAO; return r.json; }
  for (const cd of (await codigosDaConfig(log)).filter((c) => c !== ELEICAO).slice(0, 8)) {
    const t = await tentar(montarUrl(cd, uf));
    log.push(t);
    if (t.json?.cand) { codigoOk = cd; return t.json; }
  }
  throw log;
}

// ---------- renderização ----------
function corDe(sq) { return slotDe.has(sq) ? `var(${SLOTS[slotDe.get(sq)]})` : "var(--outros)"; }

function atribuirCores(ordenados) {
  for (const c of ordenados.slice(0, 4)) {
    if (slotDe.has(c.sqcand)) continue;
    const usados = new Set(slotDe.values());
    const livre = SLOTS.findIndex((_, i) => !usados.has(i));
    if (livre >= 0) slotDe.set(c.sqcand, livre);
  }
}

function render(d) {
  const cands = [...(d.cand || [])].sort((a, b) => num(b.vap) - num(a.vap));
  atribuirCores(cands);
  const [c1, c2] = cands;

  // destaques
  $("lider-nome").textContent = c1 ? c1.nm : "–";
  $("lider-pct").textContent = c1 ? pct(c1.pvap) : "–";
  document.documentElement.style.setProperty("--cor-lider", c1 ? corDe(c1.sqcand) : "var(--s1)");
  $("vantagem").textContent = c1 && c2 ? `${(num(c1.pvap) - num(c2.pvap)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.` : "–";
  $("vantagem-votos").textContent = c1 && c2 ? `${fmtInt.format(num(c1.vap) - num(c2.vap))} votos à frente de ${c2.nm}` : "";
  $("pct-secoes").textContent = pct(d.pst);
  $("trilho-fill").style.width = `${Math.min(num(d.pst), 100)}%`;
  $("secoes").textContent = `${fmtInt.format(num(d.st))} de ${fmtInt.format(num(d.s))} seções`;
  $("hora-tse").textContent = d.dg && d.hg ? `TSE: ${d.dg} ${d.hg}` : "";

  // barra 100% dos válidos: até 4 candidatos com cor + "Outros"
  const destaque = cands.filter((c) => slotDe.has(c.sqcand));
  const outros = cands.filter((c) => !slotDe.has(c.sqcand)).reduce((s, c) => s + num(c.pvap), 0);
  const segs = [...destaque.map((c) => ({ nome: c.nm, p: num(c.pvap), cor: corDe(c.sqcand) }))];
  if (outros > 0) segs.push({ nome: "Outros", p: outros, cor: "var(--outros)" });
  const corrida = $("corrida");
  corrida.querySelectorAll(".seg").forEach((s) => s.remove());
  for (const s of segs) {
    const el = document.createElement("div");
    el.className = "seg";
    el.style.flex = `0 0 ${s.p}%`;
    el.style.background = s.cor;
    el.title = `${s.nome}: ${pct(s.p)}`;
    el.textContent = s.p >= 7 ? pct(s.p, 1) : "";
    corrida.insertBefore(el, corrida.querySelector(".meta50"));
  }
  $("legenda-corrida").replaceChildren(...segs.map((s) => {
    const sp = document.createElement("span");
    sp.innerHTML = `<i style="background:${s.cor}"></i>`;
    sp.append(`${s.nome} · ${pct(s.p)}`);
    return sp;
  }));

  // lista de candidatos
  $("candidatos").replaceChildren(...cands.map((c, i) => {
    const votos = num(c.vap);
    const mudou = ultimoVoto.has(c.sqcand) && ultimoVoto.get(c.sqcand) !== votos;
    ultimoVoto.set(c.sqcand, votos);
    const el = document.createElement("article");
    el.className = `cand${mudou ? " flash" : ""}`;
    el.style.setProperty("--cor", corDe(c.sqcand));
    el.innerHTML = `
      <span class="pos">${i + 1}º</span>
      <img alt="" loading="lazy">
      <div><div class="nome"></div><div class="meta"></div>
        <div class="barra"><div style="width:${Math.min(num(c.pvap), 100)}%"></div></div></div>
      <div class="num"><div class="pct">${pct(c.pvap)}</div><div class="votos">${fmtInt.format(votos)}</div></div>`;
    const img = el.querySelector("img");
    img.src = urlFoto(codigoOk || ELEICAO, uf, c.sqcand);
    img.onerror = () => img.replaceWith(Object.assign(document.createElement("div"), { className: "avatar" }));
    const nome = el.querySelector(".nome");
    nome.textContent = `${c.nm} · ${c.n}`;
    if (String(c.e).toLowerCase() === "s") nome.insertAdjacentHTML("beforeend", '<span class="tag">ELEITO</span>');
    else if (/2.?\s*turno/i.test(c.st || "")) nome.insertAdjacentHTML("beforeend", '<span class="tag t2">2º TURNO</span>');
    el.querySelector(".meta").textContent = c.cc || "";
    return el;
  }));

  // eleitorado
  const vv = num(d.vv), vb = num(d.vb), vn = num(d.tvn ?? d.vn), a = num(d.a), c = num(d.c);
  const eleitorado = num(d.e) || c + a;
  $("eleitorado").textContent = eleitorado ? `${fmtInt.format(eleitorado)} eleitores aptos` : "";
  const partes = [["Válidos", vv, "var(--s1)"], ["Brancos", vb, "var(--n1)"], ["Nulos", vn, "var(--n2)"], ["Abstenção", a, "var(--n3)"]];
  const totalPilha = partes.reduce((s, p) => s + p[1], 0) || 1;
  $("pilha").replaceChildren(...partes.map(([n, v, cor]) => Object.assign(document.createElement("div"), {
    title: `${n}: ${fmtInt.format(v)}`, style: `flex:0 0 ${(v / totalPilha) * 100}%;background:${cor}`,
  })));
  const tiles = [["vv", vv, d.pvv, "var(--s1)"], ["vb", vb, d.pvb, "var(--n1)"], ["vn", vn, d.ptvn ?? d.pvn, "var(--n2)"],
    ["comp", c, d.pc, "transparent"], ["abs", a, d.pa, "var(--n3)"]];
  for (const [id, v, p, cor] of tiles) {
    $(id).textContent = fmtInt.format(v);
    $(`p${id}`).textContent = `${pct(p)} do ${id === "vv" || id === "vb" || id === "vn" ? "total de votos" : "eleitorado"}`;
    $(id).previousElementSibling.style.setProperty("--c", cor);
  }

  // histórico + gráfico
  const hist = lerHist();
  const ponto = { p: num(d.pst), v: Object.fromEntries(cands.map((c) => [c.sqcand, num(c.pvap)])) };
  const ult = hist[hist.length - 1];
  if (!ult || ult.p !== ponto.p || JSON.stringify(ult.v) !== JSON.stringify(ponto.v)) {
    if (ult && ult.p === ponto.p) hist.pop();
    hist.push(ponto);
    salvarHist(hist);
  }
  desenharGrafico(hist, destaque);
}

function desenharGrafico(hist, destaque) {
  if (!window.Chart) return;
  const tinta2 = cssVar("--tinta2"), grade = cssVar("--grade"), mudo = cssVar("--mudo");
  const datasets = destaque.map((c) => {
    const cor = cssVar(SLOTS[slotDe.get(c.sqcand)]);
    return {
      label: c.nm, borderColor: cor, backgroundColor: cor, borderWidth: 2, tension: .25,
      pointRadius: hist.length < 2 ? 4 : 0, pointHoverRadius: 5,
      data: hist.filter((h) => c.sqcand in h.v).map((h) => ({ x: h.p, y: h.v[c.sqcand] })),
    };
  });
  datasets.push({ label: "50%", data: [{ x: 0, y: 50 }, { x: 100, y: 50 }], borderColor: mudo, borderDash: [6, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0 });

  const xs = hist.map((h) => h.p);
  const xmin = Math.max(0, Math.floor((Math.min(...xs) - 1) / 5) * 5);
  if (grafico) {
    grafico.data.datasets = datasets;
    grafico.options.scales.x.min = xmin;
    grafico.update("none");
    return;
  }
  grafico = new Chart($("evolucao"), {
    type: "line",
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "nearest", axis: "x", intersect: false },
      plugins: {
        legend: { labels: { color: tinta2, usePointStyle: true, pointStyle: "rectRounded", filter: (i) => i.text !== "50%" } },
        tooltip: {
          filter: (i) => i.dataset.label !== "50%",
          callbacks: {
            title: (it) => `${pct(it[0].parsed.x)} das seções`,
            label: (it) => ` ${it.dataset.label}: ${pct(it.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { type: "linear", min: xmin, max: 100, grid: { color: grade }, ticks: { color: mudo, callback: (v) => `${v}%` }, title: { display: true, text: "seções apuradas", color: mudo } },
        y: { suggestedMin: 0, suggestedMax: 60, grid: { color: grade }, ticks: { color: mudo, callback: (v) => `${v}%` } },
      },
    },
  });
}

function mostrarDiagnostico(log) {
  const box = $("diagnostico");
  if (!log) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<h2>Não encontrei o arquivo de resultados</h2>
    <p class="muted">O site tentou estes endereços (tenta de novo a cada 5 s). Abra o link do TSE no navegador para conferir;
    se souber o endereço certo do JSON, use <code>?arquivo=&lt;url&gt;</code> no fim do endereço deste site.</p><ul></ul>`;
  const ul = box.querySelector("ul");
  for (const r of log) {
    const li = document.createElement("li");
    const a = Object.assign(document.createElement("a"), { href: r.url.replace(/^\/tse/, TSE), target: "_blank", rel: "noopener" });
    a.append(Object.assign(document.createElement("code"), { textContent: r.url.replace(/^\/tse/, TSE) }));
    li.append(a, ` → ${r.status}`);
    ul.append(li);
  }
}

function setStatus(texto, ok) {
  const s = $("status");
  s.className = `status ${ok ? "ok pulsa" : "err"}`;
  $("status-txt").textContent = texto;
  setTimeout(() => s.classList.remove("pulsa"), 1000);
}

async function atualizar() {
  clearTimeout(timer);
  try {
    render(await buscar());
    mostrarDiagnostico(null);
    setStatus(`atualizado às ${new Date().toLocaleTimeString("pt-BR")}`, true);
  } catch (log) {
    if (Array.isArray(log)) mostrarDiagnostico(log);
    else console.error(log);
    setStatus(Array.isArray(log) ? `sem dados (${log[0]?.status})` : "erro ao processar dados", false);
  } finally {
    timer = setTimeout(atualizar, INTERVALO_MS);
  }
}

function iniciar() {
  const sel = $("uf");
  for (const u of UFS) sel.append(new Option(NOME_UF[u] || u.toUpperCase(), u));
  sel.value = uf;
  const ajustarFonte = () => {
    $("fonte").href = `${TSE}/oficial/app/index.html#/eleicao/${codigoOk || ELEICAO}/uf/${uf}/cargo/${CARGO}/vis/nominal/resultados`;
  };
  ajustarFonte();
  sel.addEventListener("change", () => {
    uf = sel.value;
    ultimoVoto.clear();
    if (grafico) { grafico.destroy(); grafico = null; }
    qs.set("uf", uf);
    history.replaceState(null, "", `?${qs}`);
    ajustarFonte();
    atualizar();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (grafico) { grafico.destroy(); grafico = null; } });
  $("candidatos").innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div>';
  atualizar();
}

iniciar();
