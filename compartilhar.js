// Compartilhar: gera um cartão PNG (1200×675, desenhado em 2x) com o resultado atual
// e ajuda a postar no X. Usa as variáveis globais de app.js (uf, ctx, slotDe, pct, fmtInt, urlFoto…).

// Cores fixas do cartão (tema escuro do site); as das candidaturas são as mesmas do site.
const CARD = {
  fundo: "#0d0d0d", tinta: "#ffffff", tinta2: "#c3c2b7", mudo: "#898781", grade: "#2c2c2a",
  outros: "#5c5b56", vivo: "#d03b3b", ok: "#0ca30c", slots: ["#3987e5", "#d95926", "#199e70", "#c98500"],
};
const FONTE = (peso, tam) => `${peso} ${tam}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const MINUSC = new Set(["da", "das", "de", "do", "dos", "e"]);
const titulo = (s) => String(s || "").toLocaleLowerCase("pt-BR").split(/\s+/).filter(Boolean)
  .map((w, i) => (i > 0 && MINUSC.has(w) ? w : w[0].toLocaleUpperCase("pt-BR") + w.slice(1))).join(" ");
const corCard = (id) => (slotDe.has(id) ? CARD.slots[slotDe.get(id)] : CARD.outros);
const escopoNome = () => NOME_UF[uf] || uf.toUpperCase();
const turnoTexto = () => { const m = /(\d)º\s*turno/i.exec(ctx.nome || ""); return m ? `${m[1]}º turno` : ""; };
const ehSegundoTurno = (c) => /2.?\s*turno/i.test(c.situacao || "");
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

let dadosAtuais = null;
let cartao = null;        // { blob, arquivo, url, nome, chave }
let textoEditado = false;
let geracao = 0;

function urlSite() {
  if (!/^https?:$/.test(location.protocol)) return "";
  const u = new URL(location.pathname.replace(/index\.html$/, ""), location.origin);
  if (uf !== "br") u.searchParams.set("uf", uf);
  return u.href;
}

// ---------- texto do post ----------
// Conta como o X: links valem 23, emojis e outros símbolos valem 2.
function pesoPost(t) {
  const semLinks = t.replace(/https?:\/\/\S+/g, "x".repeat(23));
  const partes = window.Intl?.Segmenter
    ? Array.from(new Intl.Segmenter("pt", { granularity: "grapheme" }).segment(semLinks), (s) => s.segment)
    : Array.from(semLinks);
  let n = 0;
  for (const p of partes) {
    const cp = p.codePointAt(0);
    const leve = cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037);
    n += leve ? 1 : 2;
  }
  return n;
}

function textoPost(d) {
  const nome = (c) => `${titulo(c.nome)}${c.partido ? ` (${c.partido})` : ""}`;
  const cargo = d.cargo || "Presidente";
  const turno = turnoTexto();
  const eleito = d.cands.find((c) => c.eleito);
  const segundo = d.cands.filter(ehSegundoTurno);
  const montar = (qtd, comHashtag) => {
    const l = [d.final
      ? `🗳️ Resultado final · ${cargo} 2026 · ${escopoNome()}`
      : `🗳️ Apuração ${cargo} 2026 · ${escopoNome()}${turno ? ` (${turno})` : ""}`];
    if (eleito) l.push(`✅ ${nome(eleito)} eleito com ${pct(eleito.pct)} dos votos válidos`);
    else if (segundo.length === 2) l.push(`🔁 ${nome(segundo[0])} e ${nome(segundo[1])} vão para o 2º turno`);
    l.push(`📊 ${pct(d.pst)} das seções apuradas${d.hg ? ` · ${d.hg.slice(0, 5)}` : ""}`, "");
    d.cands.slice(0, qtd).forEach((c, i) => l.push(`${i + 1}º ${nome(c)}: ${pct(c.pct)}`));
    l.push("");
    if (comHashtag) l.push("#Eleições2026");
    if (urlSite()) l.push(urlSite());
    return l.join("\n").trim();
  };
  // usa o máximo de candidatos que couber em 280
  for (const [qtd, tag] of [[3, true], [2, true], [2, false], [1, false]]) {
    const t = montar(qtd, tag);
    if (pesoPost(t) <= 280) return t;
  }
  return montar(1, false);
}

// ---------- cartão (imagem) ----------
const fotosCORS = new Map();   // sqcand -> Promise<Image|null>
function fotoCORS(sqcand) {
  if (!sqcand || fotoFalhou.has(sqcand)) return Promise.resolve(null);
  if (!fotosCORS.has(sqcand)) {
    fotosCORS.set(sqcand, new Promise((ok) => {
      const img = new Image();
      img.crossOrigin = "anonymous";   // sem isso o navegador não deixa salvar o canvas
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      setTimeout(() => ok(null), 5000);
      const real = urlFoto(sqcand);
      // "?cartao" separa do cache da foto já carregada na página sem CORS
      img.src = BASE === TSE ? `${real}?cartao` : real.replace(TSE, BASE);
    }));
  }
  return fotosCORS.get(sqcand);
}

function ret(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function caber(g, txt, max) {
  if (g.measureText(txt).width <= max) return txt;
  let s = txt;
  while (s.length > 1 && g.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}
function espacar(g, px) { if ("letterSpacing" in g) g.letterSpacing = `${px}px`; }

async function desenharCartao(d, comFotos = true) {
  const W = 1200, H = 675, ESC = 2, M = 56, D = W - M;
  const cands = d.cands.slice(0, Math.min(4, d.cands.length));
  const fotos = comFotos ? await Promise.all(cands.map((c) => fotoCORS(c.sqcand))) : cands.map(() => null);
  const comVotos = d.cands.some((c) => c.votos > 0);

  const cv = document.createElement("canvas");
  cv.width = W * ESC; cv.height = H * ESC;
  const g = cv.getContext("2d");
  g.scale(ESC, ESC);

  // fundo, com um brilho na cor de quem lidera
  g.fillStyle = CARD.fundo; g.fillRect(0, 0, W, H);
  const corLider = comVotos ? corCard(d.cands[0].id) : CARD.mudo;
  const brilho = g.createRadialGradient(W - 60, -60, 0, W - 60, -60, 780);
  brilho.addColorStop(0, rgba(corLider, 0.3)); brilho.addColorStop(1, rgba(corLider, 0));
  g.fillStyle = brilho; g.fillRect(0, 0, W, H);

  // selo + título
  g.fillStyle = d.final ? CARD.ok : CARD.vivo;
  g.beginPath(); g.arc(M + 6, 62, 6, 0, Math.PI * 2); g.fill();
  g.font = FONTE(700, 16); espacar(g, 2);
  g.fillStyle = d.final ? CARD.tinta2 : CARD.vivo;
  g.fillText(d.final ? "RESULTADO FINAL" : "AO VIVO", M + 22, 68);
  espacar(g, 0);
  g.fillStyle = CARD.tinta; g.font = FONTE(800, 46);
  g.fillText(`Eleições 2026 · ${d.cargo || "Presidente"}`, M, 122);
  g.fillStyle = CARD.tinta2; g.font = FONTE(400, 22);
  g.fillText([escopoNome(), turnoTexto(), "dados oficiais do TSE"].filter(Boolean).join(" · "), M, 158);

  // seções apuradas
  g.textAlign = "right";
  g.fillStyle = CARD.tinta; g.font = FONTE(800, 58); g.fillText(pct(d.pst), D, 112);
  g.fillStyle = CARD.tinta2; g.font = FONTE(400, 19); g.fillText("das seções apuradas", D, 140);
  g.textAlign = "left";
  ret(g, D - 300, 154, 300, 10, 5); g.fillStyle = CARD.grade; g.fill();
  if (d.pst > 0) { ret(g, D - 300, 154, Math.max(10, (300 * Math.min(d.pst, 100)) / 100), 10, 5); g.fillStyle = CARD.tinta; g.fill(); }

  // uma linha por candidato
  const topo = 200, alt = Math.min(96, 328 / cands.length), xBarra = 600, wBarra = 330;
  cands.forEach((c, i) => {
    const y0 = topo + i * alt, cy = y0 + alt / 2, cor = corCard(c.id), r = Math.min(30, alt / 2 - 9), cx = M + 3 + r;
    if (i > 0) { g.fillStyle = CARD.grade; g.fillRect(M, y0, W - 2 * M, 1); }

    // foto (ou iniciais) com anel na cor da candidatura
    g.beginPath(); g.arc(cx, cy, r + 3, 0, Math.PI * 2); g.fillStyle = cor; g.fill();
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = "#26262a"; g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    const img = fotos[i];
    if (img) {
      const lado = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - lado) / 2, sy = Math.max(0, (img.naturalHeight - lado) * 0.15);
      g.drawImage(img, sx, sy, lado, lado, cx - r, cy - r, 2 * r, 2 * r);
    } else {
      g.fillStyle = CARD.tinta2; g.font = FONTE(700, 20); g.textAlign = "center";
      g.fillText(iniciais(c.nome), cx, cy + 7);
      g.textAlign = "left";
    }
    g.restore();

    // nome, selo, partido e vice
    const xNome = cx + r + 22, maxNome = xBarra - 28 - xNome;
    const selo = c.eleito ? "ELEITO" : ehSegundoTurno(c) ? "2º TURNO" : "";
    g.font = FONTE(700, 13);
    const wSelo = selo ? g.measureText(selo).width + 16 : 0;
    g.fillStyle = CARD.tinta; g.font = FONTE(700, 27);
    const nome = caber(g, titulo(c.nome), maxNome - (selo ? wSelo + 10 : 0));
    g.fillText(nome, xNome, cy - 4);
    if (selo) {
      const xs = xNome + g.measureText(nome).width + 10;
      ret(g, xs, cy - 25, wSelo, 22, 6);
      if (c.eleito) { g.fillStyle = CARD.ok; g.fill(); } else { g.strokeStyle = CARD.tinta2; g.lineWidth = 1.5; g.stroke(); }
      g.fillStyle = CARD.tinta; g.font = FONTE(700, 13); g.fillText(selo, xs + 8, cy - 9);
    }
    g.fillStyle = CARD.tinta2; g.font = FONTE(400, 18);
    g.fillText(caber(g, [c.partido, c.viceNome && `vice ${titulo(c.viceNome)}`].filter(Boolean).join(" · "), maxNome), xNome, cy + 22);

    // barra e números
    ret(g, xBarra, cy - 7, wBarra, 14, 7); g.fillStyle = CARD.grade; g.fill();
    if (c.pct > 0) { ret(g, xBarra, cy - 7, Math.max(14, (wBarra * Math.min(c.pct, 100)) / 100), 14, 7); g.fillStyle = cor; g.fill(); }
    g.textAlign = "right";
    g.fillStyle = CARD.tinta; g.font = FONTE(800, 38); g.fillText(pct(c.pct), D, cy + 8);
    g.fillStyle = CARD.tinta2; g.font = FONTE(400, 17); g.fillText(`${fmtInt.format(c.votos)} votos`, D, cy + 32);
    g.textAlign = "left";
  });

  // barra 100% dos válidos com a marca de 50%
  const yb = 556, hb = 34, wb = W - 2 * M;
  const segs = cands.map((c) => ({ p: c.pct, cor: corCard(c.id) }));
  const outros = d.cands.slice(cands.length).reduce((s, c) => s + c.pct, 0);
  if (outros > 0.005) segs.push({ p: outros, cor: CARD.outros });
  const total = segs.reduce((s, x) => s + x.p, 0);
  g.save();
  ret(g, M, yb, wb, hb, 9); g.clip();
  g.fillStyle = total > 0 ? CARD.fundo : CARD.grade; g.fillRect(M, yb, wb, hb);
  if (total > 0) {
    const util = wb - 2 * (segs.length - 1);
    let x = M;
    for (const s of segs) {
      const w = (util * s.p) / total;
      g.fillStyle = s.cor; g.fillRect(x, yb, w, hb);
      if (w >= 74) { g.fillStyle = "#ffffff"; g.font = FONTE(700, 17); g.fillText(pct(s.p, 1), x + 12, yb + 23); }
      x += w + 2;
    }
  }
  g.restore();
  const x50 = M + wb / 2;
  g.strokeStyle = "rgba(255,255,255,.75)"; g.lineWidth = 2; g.setLineDash([6, 5]);
  g.beginPath(); g.moveTo(x50, yb - 8); g.lineTo(x50, yb + hb + 8); g.stroke(); g.setLineDash([]);
  g.fillStyle = CARD.tinta2; g.font = FONTE(600, 14); g.textAlign = "center";
  g.fillText("50% dos votos válidos", x50, yb + hb + 27);
  g.textAlign = "left";

  // rodapé
  g.fillStyle = CARD.mudo; g.font = FONTE(400, 17);
  g.fillText(`Fonte: TSE${d.hg ? ` · arquivo gerado às ${d.hg} de ${d.dg}` : ""}`, M, H - 28);
  const site = urlSite().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (site) { g.textAlign = "right"; g.fillStyle = CARD.tinta2; g.font = FONTE(600, 17); g.fillText(site, D, H - 28); g.textAlign = "left"; }

  return new Promise((ok, falha) => {
    try { cv.toBlob((b) => (b ? ok(b) : falha(new Error("imagem vazia"))), "image/png"); } catch (e) { falha(e); }
  });
}

// ---------- painel ----------
const dica = (texto, link) => {
  const p = $("dica");
  p.replaceChildren(texto);
  if (link) p.append(" ", Object.assign(document.createElement("a"), { href: link, target: "_blank", rel: "noopener", textContent: "Abrir o X" }));
};
function contar() {
  const n = pesoPost($("post-texto").value);
  $("post-conta").textContent = `${n}/280`;
  $("post-conta").classList.toggle("estourou", n > 280);
}
function habilitarAcoes(sim) { for (const b of document.querySelectorAll("#dlg-compartilhar .acoes button")) b.disabled = !sim; }

async function prepararCartao() {
  const d = dadosAtuais;
  if (!d) return;
  const chave = `${uf}|${d.idg}|${d.hg}|${d.pst}`;
  if (!textoEditado && (!cartao || cartao.chave !== chave || !$("post-texto").value)) { $("post-texto").value = textoPost(d); contar(); }
  if (cartao && cartao.chave === chave) return;
  const minha = ++geracao;
  if (!cartao) { $("cartao-status").textContent = "Gerando imagem…"; habilitarAcoes(false); }
  let blob;
  try { blob = await desenharCartao(d); } catch { blob = await desenharCartao(d, false); }
  if (minha !== geracao) return;   // chegou um resultado mais novo no meio do caminho
  const h = (d.hg || "").replace(/^(\d\d):(\d\d).*/, "$1h$2");
  const nome = `apuracao-${(d.cargo || "presidente").toLowerCase()}-2026-${uf}${h ? `-${h}` : ""}.png`;
  if (cartao) URL.revokeObjectURL(cartao.url);
  cartao = { blob, nome, chave, arquivo: new File([blob], nome, { type: "image/png" }), url: URL.createObjectURL(blob) };
  $("cartao-img").src = cartao.url;
  $("cartao-img").hidden = false;
  $("cartao-status").textContent = "";
  habilitarAcoes(true);
}

async function copiarImagem() {
  if (!cartao || !window.ClipboardItem || !navigator.clipboard?.write) return false;
  try { await navigator.clipboard.write([new ClipboardItem({ "image/png": cartao.blob })]); return true; } catch { return false; }
}

function baixarImagem() {
  if (!cartao) return;
  const a = Object.assign(document.createElement("a"), { href: cartao.url, download: cartao.nome });
  document.body.append(a); a.click(); a.remove();
  dica("Imagem salva.");
}

async function compartilharSistema(texto) {
  try { await navigator.share({ files: [cartao.arquivo], text: texto }); return true; }
  catch (e) { return e.name === "AbortError"; }   // cancelar não é erro
}

// O link de post do X só aceita texto. No celular, a folha de compartilhamento do sistema
// manda imagem + texto para o app do X; no computador, a imagem vai para a área de transferência.
async function postarNoX() {
  const texto = $("post-texto").value;
  const celular = matchMedia("(pointer: coarse)").matches;
  if (celular && cartao && navigator.canShare?.({ files: [cartao.arquivo] }) && await compartilharSistema(texto)) return;
  const copiou = await copiarImagem();
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(texto)}`;
  const janela = window.open(url, "_blank");
  if (janela) janela.opener = null;
  const sobreImagem = copiou ? "Imagem copiada: no X, cole com Ctrl+V (⌘V no Mac) para anexar." : "Baixe a imagem e anexe no post.";
  if (janela) dica(sobreImagem);
  else dica(`O navegador bloqueou a nova aba. ${sobreImagem}`, url);
}

function iniciarCompartilhar() {
  const dlg = $("dlg-compartilhar");
  const podeCopiar = Boolean(window.ClipboardItem && navigator.clipboard?.write);
  let podeArquivos = false;
  try { podeArquivos = Boolean(navigator.canShare?.({ files: [new File([""], "x.png", { type: "image/png" })] })); } catch { /* sem suporte */ }
  $("btn-copiar").hidden = !podeCopiar;
  $("btn-mais").hidden = !podeArquivos;

  $("btn-compartilhar").addEventListener("click", () => {
    textoEditado = false;
    $("post-texto").value = "";
    dica("");
    dlg.showModal();
    prepararCartao();
  });
  $("dlg-fechar").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });   // clique fora fecha
  $("post-texto").addEventListener("input", () => { textoEditado = true; contar(); });
  $("btn-x").addEventListener("click", postarNoX);
  $("btn-baixar").addEventListener("click", baixarImagem);
  $("btn-copiar").addEventListener("click", async () =>
    dica(await copiarImagem() ? "Imagem copiada. Cole com Ctrl+V (⌘V no Mac) onde quiser." : "Não deu para copiar aqui; use “Baixar imagem”."));
  $("btn-mais").addEventListener("click", async () => {
    if (!await compartilharSistema($("post-texto").value)) dica("Não foi possível abrir o compartilhamento do sistema.");
  });

  document.addEventListener("dados", (e) => {
    const mudouEscopo = dadosAtuais && cartao && !cartao.chave.startsWith(`${uf}|`);
    dadosAtuais = e.detail;
    $("btn-compartilhar").disabled = false;
    if (mudouEscopo) textoEditado = false;
    if (dlg.open) prepararCartao();
  });
}

iniciarCompartilhar();
