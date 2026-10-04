// Apuração ao vivo – Eleições 2026, Presidente (TSE).
// Formato 2026: arquivo "unificado" (EA20) em <base>/oficial/<ciclo>/<eleição>/dados/<uf>/<uf>-c0001-e<eleição>-u.json,
// descoberto pelo arquivo de configuração público /oficial/comum/config/ele-c.json (EA11).
// Parâmetros opcionais na URL: ?uf=sp  ?e=6258 (força uma eleição, ex. 2º turno)  ?arquivo=<url completa do JSON>
const qs = new URLSearchParams(location.search);
const CARGO = 1;
const INTERVALO_MS = 5000;
const TSE = "https://resultados.tse.jus.br";

const UFS = ["br", "ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt",
  "pa", "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to", "zz"];
const NOME_UF = { br: "Brasil", zz: "Exterior" };

// Rodando pelo server.js (localhost) usa o proxy /tse; em hospedagem estática busca o TSE direto (o TSE libera CORS).
const BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "/tse" : TSE;

// Contexto da eleição. Os valores padrão valem para o 1º turno de 2026 e são confirmados/atualizados pela configuração do TSE.
const ctx = {
  ciclo: "ele2026",
  eleicao: qs.get("e") || "6257",
  dirDados: "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>",
  dirFotos: "<base>/<ambiente>/<ciclo>/<cd_eleicao>/fotos/<uf>",
  nome: "",
  configurado: false,
};

const pad = (n, len) => String(n).padStart(len, "0");
const preencher = (dir, base, u) => dir.replace(/<([^>]+)>/g, (m, nome) =>
  ({ base, ambiente: "oficial", ciclo: ctx.ciclo, cd_eleicao: ctx.eleicao, uf: u })[nome] ?? m);
const urlResultado = (u) => `${preencher(ctx.dirDados, BASE, u)}/${u}-c${pad(CARGO, 4)}-e${pad(ctx.eleicao, 6)}-u.json`;
// Candidatura a presidente é nacional, então a foto fica sempre na pasta "br".
const urlFoto = (sqcand) => `${preencher(ctx.dirFotos, TSE, "br")}/${sqcand}.jpeg`;
const urlApp = () => `${TSE}/oficial/app/index.html#/eleicao/${ctx.eleicao}/uf/${uf}/cargo/${CARGO}/vis/nominal/resultados`;

const $ = (id) => document.getElementById(id);
const fmtInt = new Intl.NumberFormat("pt-BR");
const num = (v) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "0");
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s) || 0;
};
const pct = (v, casas = 2) => `${num(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const cssVar = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
const dataBR = (dt) => { const [d, m, a] = String(dt).split("/"); return `${a}-${m}-${d}`; };
// Horário em que o TSE gerou o arquivo (dg/hg, horário de Brasília), em milissegundos; 0 se ausente.
const horaTSE = (dg, hg) => Date.parse(`${dataBR(dg)}T${hg}-03:00`) || 0;
const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD

let uf = (qs.get("uf") || "br").toLowerCase();
if (!UFS.includes(uf)) uf = "br";
let timer = null;
let grafico = null;
let ultimaGeracao = 0;        // horário (TSE) do arquivo mais novo já mostrado
const ultimoVoto = new Map();
const SLOTS = ["--s1", "--s2", "--s3", "--s4"];
const slotDe = new Map();     // id do candidato -> índice da cor (a cor segue o candidato, não a posição)
const fotoFalhou = new Set(); // não pede de novo uma foto que já deu erro

// ---------- histórico (fica só neste navegador) ----------
const chaveHist = () => `hist-${ctx.ciclo}-${ctx.eleicao}-${uf}`;
// Um ponto por % de seções apuradas (o registro mais novo vence), em ordem crescente.
// Isso também conserta históricos gravados antes com pontos repetidos.
function lerHist() {
  let h = [];
  try { h = JSON.parse(localStorage.getItem(chaveHist())) || []; } catch { /* sem storage */ }
  const porP = new Map();
  for (const x of h) if (x && typeof x.p === "number" && x.v) porP.set(x.p, x);
  return [...porP.values()].sort((a, b) => a.p - b.p);
}
function salvarHist(h) {
  try { localStorage.setItem(chaveHist(), JSON.stringify(h.slice(-500))); } catch { /* sem storage */ }
}

// ---------- busca dos dados ----------
async function tentar(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return { url, status: r.status, json: r.ok ? await r.json() : null };
  } catch (e) {
    return { url, status: `falha de rede/CORS (${e.message})`, json: null };
  }
}

// Lê a configuração do TSE: ciclo, pastas dos arquivos e, sem ?e=, a eleição presidencial mais recente
// que já aconteceu (assim o site passa sozinho para o 2º turno no dia dele).
async function configurar(log) {
  const r = await tentar(`${BASE}/oficial/comum/config/ele-c.json`);
  log.push(r);
  if (!r.json) return;
  const cfg = r.json;
  const dir = (tp) => (cfg.arq || []).find((a) => a.tp === tp)?.dir;
  if (dir("u")) ctx.dirDados = dir("u");
  if (dir("ft")) ctx.dirFotos = dir("ft");
  const presid = [];
  for (const p of cfg.pl || []) for (const e of p.e || []) {
    const temPresidente = (e.abr || []).some((a) => (a.cp || []).some((c) => String(c.cd) === String(CARGO)));
    if (temPresidente) presid.push({ ciclo: p.c, cd: String(e.cd), dt: dataBR(p.dt), nome: e.nm });
  }
  let escolhida = presid.find((x) => x.cd === ctx.eleicao);
  if (!qs.get("e")) {
    const ate = presid.filter((x) => x.dt <= hojeBR()).sort((a, b) => b.dt.localeCompare(a.dt));
    if (ate[0] && (!escolhida || ate[0].dt > escolhida.dt)) escolhida = ate[0];
  }
  if (escolhida) Object.assign(ctx, { ciclo: escolhida.ciclo || ctx.ciclo, eleicao: escolhida.cd, nome: escolhida.nome });
  ctx.configurado = true;
}

async function buscar() {
  if (qs.get("arquivo")) {
    const r = await tentar(qs.get("arquivo"));
    if (r.json) return r.json;
    throw [r];
  }
  const log = [];
  if (!ctx.configurado) await configurar(log);
  const r = await tentar(urlResultado(uf));
  log.push(r);
  if (r.json) return r.json;
  throw log;
}

// Converte o JSON do TSE para um formato único. Aceita o arquivo unificado de 2026 e o antigo "dados-simplificados".
function normalizar(j) {
  const base = { dg: j.dg, hg: j.hg, idg: j.idg, geradoEm: horaTSE(j.dg, j.hg), final: j.tf === "s", liberado: j.dv !== "n" };
  if (Array.isArray(j.carg)) {
    const cargo = j.carg.find((c) => String(c.cd) === String(CARGO)) || j.carg[0] || {};
    const cands = [];
    for (const g of cargo.agr || []) for (const p of g.par || []) for (const c of p.cand || []) {
      const vice = (c.vs || [])[0];
      cands.push({
        id: String(c.sqcand || c.n), sqcand: c.sqcand, n: c.n, nome: c.nmu || c.nm, seq: num(c.seq),
        partido: p.sg || "", coligacao: g.tp === "c" ? g.nm : "",
        vice: vice ? `${vice.nmu || vice.nm}${vice.sgp ? ` (${vice.sgp})` : ""}` : "",
        votos: num(c.vap), pct: c.pvap != null ? num(c.pvap) : null, eleito: c.e === "s", situacao: c.st || "",
      });
    }
    const s = j.s || {}, e = j.e || {}, v = j.v || {};
    return finalizar({
      ...base, cargo: cargo.nmn, cands,
      pst: num(s.pst), st: num(s.st), ts: num(s.ts),
      eleitorado: num(e.te), comp: num(e.c), pcomp: num(e.pc), abst: num(e.a), pabst: num(e.pa),
      tv: num(v.tv), vv: num(v.vv), pvv: num(v.pvv), vb: num(v.vb), pvb: num(v.pvb), vn: num(v.tvn), pvn: num(v.ptvn),
    });
  }
  // formato antigo (até 2024)
  return finalizar({
    ...base, cands: (j.cand || []).map((c) => ({
      id: String(c.sqcand || c.n), sqcand: c.sqcand, n: c.n, nome: c.nm, seq: num(c.seq), partido: "", coligacao: c.cc || "",
      vice: "", votos: num(c.vap), pct: num(c.pvap), eleito: String(c.e).toLowerCase() === "s", situacao: c.st || "",
    })),
    pst: num(j.pst), st: num(j.st), ts: num(j.s), eleitorado: num(j.e) || num(j.c) + num(j.a),
    comp: num(j.c), pcomp: num(j.pc), abst: num(j.a), pabst: num(j.pa),
    tv: num(j.tv), vv: num(j.vv), pvv: num(j.pvv), vb: num(j.vb), pvb: num(j.pvb), vn: num(j.tvn ?? j.vn), pvn: num(j.ptvn ?? j.pvn),
  });
}
function finalizar(d) {
  for (const c of d.cands) if (c.pct == null) c.pct = d.vv ? (100 * c.votos) / d.vv : 0;
  d.cands.sort((a, b) => b.votos - a.votos || a.seq - b.seq || num(a.n) - num(b.n));
  return d;
}

// ---------- renderização ----------
const corDe = (id) => (slotDe.has(id) ? `var(${SLOTS[slotDe.get(id)]})` : "var(--outros)");
const iniciais = (nome) => String(nome).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("");
const fmtPp = (v) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`;

function atribuirCores(ordenados) {
  for (const c of ordenados.slice(0, 4)) {
    if (slotDe.has(c.id)) continue;
    const usados = new Set(slotDe.values());
    const livre = SLOTS.findIndex((_, i) => !usados.has(i));
    if (livre >= 0) slotDe.set(c.id, livre);
  }
}

function render(d) {
  const cands = d.cands;
  const comVotos = cands.some((c) => c.votos > 0);
  if (comVotos) atribuirCores(cands);
  const [c1, c2] = cands;

  // cabeçalho
  $("cargo").textContent = d.cargo || "Presidente";
  $("selo").classList.toggle("final", d.final);
  $("selo-txt").textContent = d.final ? "APURAÇÃO ENCERRADA" : "AO VIVO";
  $("eleicao-nome").textContent = ctx.nome || "";
  $("aviso").hidden = d.liberado && comVotos;
  $("aviso").textContent = !d.liberado ? "O TSE ainda não liberou a divulgação deste resultado."
    : "Aguardando os primeiros votos apurados. A apuração começa às 17h (horário de Brasília).";

  // destaques
  $("lider-nome").textContent = comVotos && c1 ? c1.nome : "Aguardando apuração";
  $("lider-pct").textContent = comVotos && c1 ? pct(c1.pct) : "–";
  $("lider-extra").textContent = comVotos && c1 ? `${fmtInt.format(c1.votos)} votos · ${c1.partido || c1.coligacao}` : "";
  document.documentElement.style.setProperty("--cor-lider", comVotos && c1 ? corDe(c1.id) : "var(--grade)");
  $("vantagem").textContent = comVotos && c1 && c2 ? fmtPp(c1.pct - c2.pct) : "–";
  $("vantagem-votos").textContent = comVotos && c1 && c2 ? `${fmtInt.format(c1.votos - c2.votos)} votos à frente de ${c2.nome}` : "";
  $("pct-secoes").textContent = pct(d.pst);
  $("trilho-fill").style.width = `${Math.min(d.pst, 100)}%`;
  $("secoes").textContent = `${fmtInt.format(d.st)} de ${fmtInt.format(d.ts)} seções`;
  $("hora-tse").textContent = d.dg && d.hg ? `TSE: ${d.dg} ${d.hg}` : "";

  // barra 100% dos válidos: até 4 candidatos com cor + "Outros"
  const destaque = cands.filter((c) => slotDe.has(c.id));
  const outros = cands.filter((c) => !slotDe.has(c.id)).reduce((s, c) => s + c.pct, 0);
  const segs = destaque.map((c) => ({ nome: c.nome, p: c.pct, cor: corDe(c.id) }));
  if (outros > 0.005) segs.push({ nome: "Outros", p: outros, cor: "var(--outros)" });
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
    const mudou = ultimoVoto.has(c.id) && ultimoVoto.get(c.id) !== c.votos;
    ultimoVoto.set(c.id, c.votos);
    const el = document.createElement("article");
    el.className = `cand${mudou ? " flash" : ""}`;
    el.style.setProperty("--cor", corDe(c.id));
    el.innerHTML = `
      <span class="pos">${comVotos ? `${i + 1}º` : ""}</span>
      <div class="foto"><span></span><img alt="" loading="lazy"></div>
      <div><div class="nome"></div><div class="meta"></div>
        <div class="barra"><div style="width:${Math.min(c.pct, 100)}%"></div></div></div>
      <div class="num"><div class="pct">${pct(c.pct)}</div><div class="votos">${fmtInt.format(c.votos)}</div></div>`;
    el.querySelector(".foto span").textContent = iniciais(c.nome);
    const img = el.querySelector("img");
    if (c.sqcand && !fotoFalhou.has(c.sqcand)) {
      img.onerror = () => { fotoFalhou.add(c.sqcand); img.remove(); };
      img.src = urlFoto(c.sqcand);
    } else img.remove();
    const nome = el.querySelector(".nome");
    nome.textContent = `${c.nome} · ${c.n}`;
    if (c.eleito) nome.insertAdjacentHTML("beforeend", '<span class="tag">ELEITO</span>');
    else if (/2.?\s*turno/i.test(c.situacao)) nome.insertAdjacentHTML("beforeend", '<span class="tag t2">2º TURNO</span>');
    el.querySelector(".meta").textContent = [c.partido, c.vice && `vice: ${c.vice}`].filter(Boolean).join(" · ") || c.coligacao;
    el.title = c.coligacao ? `${c.coligacao}` : "";
    return el;
  }));

  // eleitorado
  $("eleitorado").textContent = d.eleitorado ? `${fmtInt.format(d.eleitorado)} eleitores aptos` : "";
  const partes = [["Válidos", d.vv, "var(--s1)"], ["Brancos", d.vb, "var(--n1)"], ["Nulos", d.vn, "var(--n2)"], ["Abstenção", d.abst, "var(--n3)"]];
  const totalPilha = partes.reduce((s, p) => s + p[1], 0) || 1;
  $("pilha").replaceChildren(...partes.map(([n, v, cor]) => Object.assign(document.createElement("div"), {
    title: `${n}: ${fmtInt.format(v)}`, style: `flex:0 0 ${(v / totalPilha) * 100}%;background:${cor}`,
  })));
  const tiles = [["vv", d.vv, d.pvv, "var(--s1)", "dos votos"], ["vb", d.vb, d.pvb, "var(--n1)", "dos votos"], ["vn", d.vn, d.pvn, "var(--n2)", "dos votos"],
    ["comp", d.comp, d.pcomp, "transparent", "do eleitorado"], ["abs", d.abst, d.pabst, "var(--n3)", "do eleitorado"]];
  for (const [id, v, p, cor, de] of tiles) {
    $(id).textContent = fmtInt.format(v);
    $(`p${id}`).textContent = `${pct(p)} ${de}`;
    $(id).previousElementSibling.style.setProperty("--c", cor);
  }

  // histórico + gráfico
  const hist = lerHist();
  const ponto = { p: d.pst, t: d.geradoEm, v: Object.fromEntries(cands.map((c) => [c.id, c.pct])) };
  const maisNovo = Math.max(0, ...hist.map((h) => h.t || 0));
  const i = hist.findIndex((h) => h.p === ponto.p);
  const igual = i >= 0 && JSON.stringify(hist[i].v) === JSON.stringify(ponto.v);
  if (comVotos && !igual && ponto.t >= maisNovo) {
    if (i >= 0) hist.splice(i, 1);
    hist.push(ponto);
    hist.sort((a, b) => a.p - b.p);
    salvarHist(hist);
  }
  desenharGrafico(hist, destaque);
}

function desenharGrafico(hist, destaque) {
  if (!window.Chart) return;
  $("evolucao-vazio").hidden = hist.length > 0;
  const tinta2 = cssVar("--tinta2"), grade = cssVar("--grade"), mudo = cssVar("--mudo");
  const datasets = destaque.map((c) => {
    const cor = cssVar(SLOTS[slotDe.get(c.id)]);
    return {
      label: c.nome, borderColor: cor, backgroundColor: cor, borderWidth: 2, tension: .25,
      pointRadius: hist.length < 2 ? 4 : 0, pointHoverRadius: 5,
      data: hist.filter((h) => c.id in h.v).map((h) => ({ x: h.p, y: h.v[c.id] })),
    };
  });
  datasets.push({ label: "50%", data: [{ x: 0, y: 50 }, { x: 100, y: 50 }], borderColor: mudo, borderDash: [6, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0 });

  const xs = hist.map((h) => h.p);
  const xmin = xs.length ? Math.max(0, Math.floor((Math.min(...xs) - 1) / 5) * 5) : 0;
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
          itemSort: (a, b) => b.parsed.y - a.parsed.y,
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
    <p class="muted">O site tentou estes endereços e tenta de novo a cada 5 s. Abra os links para conferir;
    se souber o endereço certo do JSON, use <code>?arquivo=&lt;url&gt;</code> no fim do endereço deste site.</p><ul></ul>`;
  const ul = box.querySelector("ul");
  for (const r of log) {
    const real = r.url.replace(/^\/tse/, TSE);
    const li = document.createElement("li");
    const a = Object.assign(document.createElement("a"), { href: real, target: "_blank", rel: "noopener" });
    a.append(Object.assign(document.createElement("code"), { textContent: real }));
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
    const d = normalizar(await buscar());
    // A rede de distribuição do TSE às vezes entrega uma versão anterior do arquivo.
    // Ela é ignorada para os números não "voltarem" na tela nem bagunçarem o gráfico.
    if (!(d.geradoEm && d.geradoEm < ultimaGeracao)) {
      ultimaGeracao = Math.max(ultimaGeracao, d.geradoEm);
      render(d);
    }
    mostrarDiagnostico(null);
    $("fonte").href = urlApp();
    setStatus(`atualizado às ${new Date().toLocaleTimeString("pt-BR")}`, true);
  } catch (log) {
    if (Array.isArray(log)) mostrarDiagnostico(log);
    else console.error(log);
    setStatus(Array.isArray(log) ? `sem dados (${log[log.length - 1]?.status})` : "erro ao processar dados", false);
  } finally {
    timer = setTimeout(atualizar, INTERVALO_MS);
  }
}

function iniciar() {
  const sel = $("uf");
  for (const u of UFS) sel.append(new Option(NOME_UF[u] || u.toUpperCase(), u));
  sel.value = uf;
  $("fonte").href = urlApp();
  sel.addEventListener("change", () => {
    uf = sel.value;
    ultimoVoto.clear();
    ultimaGeracao = 0;
    if (grafico) { grafico.destroy(); grafico = null; }
    qs.set("uf", uf);
    history.replaceState(null, "", `?${qs}`);
    $("fonte").href = urlApp();
    atualizar();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (grafico) { grafico.destroy(); grafico = null; } });
  $("candidatos").innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div>';
  atualizar();
}

iniciar();
