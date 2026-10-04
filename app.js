// Eleição 2026 – 1º turno, Presidente (código TSE 6257, cargo 1).
const ANO = 2026;
const ELEICAO = 6257;
const CARGO = 1;
const INTERVALO_MS = 5000;

const UFS = ["br", "ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt",
  "pa", "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to", "zz"];

// Quando servido pelo server.js local, usa o proxy /tse para evitar bloqueio de CORS.
const BASE = location.protocol.startsWith("http") && window.USE_PROXY !== false && location.port
  ? "/tse"
  : "https://resultados.tse.jus.br";

const pad = (n, len) => String(n).padStart(len, "0");
const urlResultados = (uf) =>
  `${BASE}/oficial/ele${ANO}/${ELEICAO}/dados-simplificados/${uf}/${uf}-c${pad(CARGO, 4)}-e${pad(ELEICAO, 6)}-r.json`;
const urlFoto = (uf, sqcand) =>
  `https://resultados.tse.jus.br/oficial/ele${ANO}/${ELEICAO}/fotos/${uf}/${sqcand}.jpeg`;

const $ = (id) => document.getElementById(id);
const fmtInt = new Intl.NumberFormat("pt-BR");
const num = (v) => Number(String(v ?? "0").replace(/\./g, "").replace(",", ".")) || 0;
const pct = (v) => `${(num(v)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

let ufAtual = (new URLSearchParams(location.search).get("uf") || "br").toLowerCase();
if (!UFS.includes(ufAtual)) ufAtual = "br";
const ultimoVoto = new Map();
let timer = null;

function montarSeletor() {
  const sel = $("uf");
  for (const uf of UFS) {
    const opt = document.createElement("option");
    opt.value = uf;
    opt.textContent = uf === "br" ? "Brasil" : uf === "zz" ? "Exterior" : uf.toUpperCase();
    sel.appendChild(opt);
  }
  sel.value = ufAtual;
  sel.addEventListener("change", () => {
    ufAtual = sel.value;
    ultimoVoto.clear();
    const qs = new URLSearchParams(location.search);
    qs.set("uf", ufAtual);
    history.replaceState(null, "", `?${qs}`);
    $("fonte").href = `https://resultados.tse.jus.br/oficial/app/index.html#/eleicao/${ELEICAO}/uf/${ufAtual}/cargo/${CARGO}/vis/nominal/resultados`;
    atualizar();
  });
}

function setStatus(texto, ok) {
  const s = $("status");
  s.textContent = texto;
  s.className = `status ${ok ? "ok" : "err"}`;
}

function render(d) {
  const pst = num(d.pst);
  $("pct-secoes").textContent = pct(d.pst);
  $("secoes").textContent = `(${fmtInt.format(num(d.st))} de ${fmtInt.format(num(d.s))})`;
  $("bar-fill").style.width = `${Math.min(pst, 100)}%`;
  $("hora-tse").textContent = d.dg && d.hg ? `${d.dg} às ${d.hg}` : "–";

  $("vv").textContent = `${fmtInt.format(num(d.vv))} (${pct(d.pvv)})`;
  $("vb").textContent = `${fmtInt.format(num(d.vb))} (${pct(d.pvb)})`;
  $("vn").textContent = `${fmtInt.format(num(d.tvn ?? d.vn))} (${pct(d.ptvn ?? d.pvn)})`;
  $("comp").textContent = `${fmtInt.format(num(d.c))} (${pct(d.pc)})`;
  $("abs").textContent = `${fmtInt.format(num(d.a))} (${pct(d.pa)})`;

  const cands = [...(d.cand || [])].sort((a, b) => num(b.vap) - num(a.vap));
  const lista = $("candidatos");
  lista.replaceChildren(...cands.map((c) => {
    const votos = num(c.vap);
    const mudou = ultimoVoto.has(c.sqcand) && ultimoVoto.get(c.sqcand) !== votos;
    ultimoVoto.set(c.sqcand, votos);
    const eleito = String(c.e).toLowerCase() === "s";
    const el = document.createElement("article");
    el.className = `cand${eleito ? " eleito" : ""}${mudou ? " flash" : ""}`;
    el.innerHTML = `
      <img alt="" loading="lazy">
      <div class="info">
        <div class="nome"></div>
        <div class="meta"></div>
        <div class="vbar"><div style="width:${Math.min(num(c.pvap), 100)}%"></div></div>
      </div>
      <div class="num">
        <div class="pct">${pct(c.pvap)}</div>
        <div class="votos">${fmtInt.format(votos)} votos</div>
      </div>`;
    const img = el.querySelector("img");
    img.src = urlFoto(ufAtual === "br" ? "br" : ufAtual, c.sqcand);
    img.onerror = () => img.replaceWith(Object.assign(document.createElement("div"), { className: "avatar" }));
    el.querySelector(".nome").textContent = `${c.nm} (${c.n})`;
    if (eleito) el.querySelector(".nome").insertAdjacentHTML("beforeend", '<span class="tag">ELEITO</span>');
    else if (String(c.st || "").toLowerCase().includes("2º turno")) el.querySelector(".nome").insertAdjacentHTML("beforeend", '<span class="tag">2º TURNO</span>');
    el.querySelector(".meta").textContent = c.cc || "";
    return el;
  }));
}

async function atualizar() {
  clearTimeout(timer);
  try {
    const resp = await fetch(`${urlResultados(ufAtual)}?t=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    render(await resp.json());
    setStatus(`atualizado ${new Date().toLocaleTimeString("pt-BR")}`, true);
  } catch (e) {
    setStatus(`erro: ${e.message} — tentando de novo`, false);
    if (!$("candidatos").children.length) {
      $("candidatos").innerHTML = `<div class="erro">Não foi possível carregar os dados do TSE (${e.message}).
        Se o navegador bloquear por CORS, rode <code>node server.js</code> e abra <code>http://localhost:8080</code>.</div>`;
    }
  } finally {
    timer = setTimeout(atualizar, INTERVALO_MS);
  }
}

montarSeletor();
atualizar();
