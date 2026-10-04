// Coletor do histórico da apuração. Roda no GitHub Actions (.github/workflows/coleta.yml).
// Consulta os arquivos públicos do TSE e grava um ponto por geração nova em
// historico/<eleição>/<uf>.json, numa pasta que o workflow publica na branch "dados".
// O site lê esses arquivos para mostrar o gráfico de evolução completo a quem abre a página depois.
//
// Variáveis: SAIDA (pasta da branch dados), PUBLICAR=1 (commit + push), DURACAO_MS,
// INTERVALO_MS (padrão 20 s), TSE_BASE (para testes), ELEICAO (força o código da eleição).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TSE = process.env.TSE_BASE || "https://resultados.tse.jus.br";
const SAIDA = process.env.SAIDA || "dados";
const PUBLICAR = process.env.PUBLICAR === "1";
const FIM = Date.now() + Number(process.env.DURACAO_MS || 5.75 * 3600e3);
const INTERVALO = Number(process.env.INTERVALO_MS || 20000);
const PUBLICAR_A_CADA = Number(process.env.PUBLICAR_A_CADA_MS || 60000);
const CARGO = 1;
const UFS = ["br", "ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt",
  "pa", "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to", "zz"];

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n, l) => String(n).padStart(l, "0");
const num = (v) => { const s = String(v ?? "0"); return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s) || 0; };
const dataISO = (dt) => { const [d, m, a] = String(dt).split("/"); return `${a}-${m}-${d}`; };
const horaTSE = (dg, hg) => Date.parse(`${dataISO(dg)}T${hg}-03:00`) || 0;
const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function json(url) {
  const r = await fetch(url, { headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Mesma descoberta do site: eleição presidencial mais recente que já aconteceu (ou ELEICAO).
async function contexto() {
  const cfg = await json(`${TSE}/oficial/comum/config/ele-c.json`);
  const dir = (cfg.arq || []).find((a) => a.tp === "u")?.dir || "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>";
  const presid = [];
  for (const p of cfg.pl || []) for (const e of p.e || []) {
    if ((e.abr || []).some((a) => (a.cp || []).some((c) => String(c.cd) === String(CARGO)))) {
      presid.push({ ciclo: p.c, cd: String(e.cd), dt: dataISO(p.dt) });
    }
  }
  const e = process.env.ELEICAO
    ? presid.find((x) => x.cd === process.env.ELEICAO)
    : presid.filter((x) => x.dt <= hojeBR()).sort((a, b) => b.dt.localeCompare(a.dt))[0];
  if (!e) throw new Error("eleição presidencial não encontrada na configuração do TSE");
  const url = (uf) => `${dir.replace(/<([^>]+)>/g, (m, k) => ({ base: TSE, ambiente: "oficial", ciclo: e.ciclo, cd_eleicao: e.cd, uf })[k] ?? m)}`
    + `/${uf}-c${pad(CARGO, 4)}-e${pad(e.cd, 6)}-u.json`;
  return { ...e, url };
}

// Um ponto no mesmo formato que o site guarda: % das seções, horário de geração e % de cada candidatura.
function ponto(j) {
  const cargo = (j.carg || []).find((c) => String(c.cd) === String(CARGO));
  if (!cargo) return null;
  const v = {};
  let comVotos = false;
  for (const g of cargo.agr || []) for (const p of g.par || []) for (const c of p.cand || []) {
    v[String(c.sqcand || c.n)] = num(c.pvap);
    if (num(c.vap) > 0) comVotos = true;
  }
  return comVotos ? { p: num(j.s?.pst), t: horaTSE(j.dg, j.hg), v, final: j.tf === "s" } : null;
}

const git = (...args) => execFileSync("git", ["-C", SAIDA, ...args], { stdio: "pipe" }).toString().trim();

async function main() {
  let ctx;
  while (!ctx) {
    try { ctx = await contexto(); } catch (e) { log("configuração:", e.message); await espera(30000); }
    if (Date.now() > FIM) return;
  }
  log(`eleição ${ctx.cd} (${ctx.ciclo})`);
  const pasta = join(SAIDA, "historico", ctx.cd);
  mkdirSync(pasta, { recursive: true });
  const arquivo = (uf) => join(pasta, `${uf}.json`);

  // retoma o que já foi gravado (o workflow pode ser reiniciado) e junta os pontos de coleta/semente/,
  // gravados antes deste coletor existir
  const hist = {};
  const alterados = new Set();
  for (const uf of UFS) {
    try { hist[uf] = JSON.parse(readFileSync(arquivo(uf), "utf8")); } catch { hist[uf] = { eleicao: ctx.cd, uf, final: false, pontos: [] }; }
    let semente = [];
    try { semente = JSON.parse(readFileSync(new URL(`./semente/${ctx.cd}-${uf}.json`, import.meta.url), "utf8")).pontos || []; } catch { /* sem semente */ }
    const porP = new Map(hist[uf].pontos.map((x) => [x.p, x]));
    const novos = semente.filter((x) => !porP.has(x.p));
    if (novos.length) {
      for (const x of novos) porP.set(x.p, x);
      hist[uf].pontos = [...porP.values()].sort((x, y) => x.t - y.t);
      alterados.add(uf);
      log(`${uf}: ${novos.length} ponto(s) importado(s) de coleta/semente/`);
    }
  }

  function registrar(uf, pt) {
    if (!pt) return;
    const h = hist[uf], ult = h.pontos.at(-1);
    if (ult && pt.t <= ult.t) return;               // mesma geração, ou versão antiga entregue pela CDN
    if (ult && ult.p === pt.p) h.pontos.pop();       // um ponto por % de seções
    h.pontos.push({ p: pt.p, t: pt.t, v: pt.v });
    h.final = pt.final;
    alterados.add(uf);
  }

  async function publicar() {
    if (!alterados.size) return;
    for (const uf of alterados) {
      writeFileSync(arquivo(uf), JSON.stringify({ ...hist[uf], atualizado: new Date().toISOString() }));
    }
    const resumo = `${alterados.size} arquivo(s), Brasil em ${hist.br.pontos.at(-1)?.p ?? 0}%`;
    alterados.clear();
    if (!PUBLICAR) { log("gravado:", resumo); return; }
    try {
      git("add", "-A");
      git("commit", "-q", "-m", `Histórico da apuração: ${resumo}`);
    } catch { return; }   // nada novo para commitar
    for (let i = 0; i < 4; i++) {
      try { git("push", "-q", "origin", "HEAD:dados"); log("publicado:", resumo); return; }
      catch (e) { log("push falhou, tentando de novo:", e.message.split("\n")[0]); await espera(2000 * 2 ** i); }
    }
  }

  let rodada = 0, ultimaPublicacao = 0;
  while (Date.now() < FIM) {
    // Brasil a cada rodada; estados e exterior a cada 3 rodadas (~1 min)
    for (const uf of rodada % 3 === 0 ? UFS : ["br"]) {
      try { registrar(uf, ponto(await json(ctx.url(uf)))); } catch (e) { if (uf === "br") log(`br: ${e.message}`); }
    }
    if (Date.now() - ultimaPublicacao >= PUBLICAR_A_CADA) { await publicar(); ultimaPublicacao = Date.now(); }
    if (UFS.every((uf) => hist[uf].final || uf === "zz") && hist.br.final) { log("totalização final: encerrando"); break; }
    rodada++;
    await espera(INTERVALO);
  }
  await publicar();
}

main().catch((e) => { console.error(e); process.exit(1); });
