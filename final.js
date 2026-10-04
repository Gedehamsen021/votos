// Resultado final: quando a apuração chega a 100% das seções (ou o TSE fecha a totalização), o topo da página
// vira um painel de resultado com o vencedor, gráfico de rosca dos votos válidos, minimapa por estado e os
// números finais. O resto do site continua logo abaixo. Prévia a qualquer momento: ?final=1
// Usa as variáveis globais de app.js, compartilhar.js e mapa.js (slotDe, corDe, titulo, MAPA_BR, SIGLAS…).
(() => {
  const forcar = qs.get("final") === "1";
  const SVG = "http://www.w3.org/2000/svg";
  let minimapaPronto = false, roscaDesenhada = false;

  const ehSegundoTurnoFinal = (c) => /2.?\s*turno/i.test(c.situacao || "");

  // Quem venceu ou quem vai ao 2º turno: pelo que o TSE informa; se ainda não informou, pela regra dos 50%.
  function desfecho(d) {
    const comVotos = d.cands.filter((c) => c.votos > 0);
    const eleito = comVotos.find((c) => c.eleito);
    const segundo = comVotos.filter(ehSegundoTurnoFinal);
    if (eleito) return { tipo: "eleito", cands: [eleito] };
    if (segundo.length === 2) return { tipo: "2turno", cands: segundo };
    if (!comVotos.length) return { tipo: "nada", cands: [] };
    if (comVotos[0].pct > 50) return { tipo: "eleito", cands: [comVotos[0]], previsto: !d.final };
    return { tipo: "2turno", cands: comVotos.slice(0, 2), previsto: !d.final };
  }

  function foto(c, tamanho) {
    const caixa = document.createElement("div");
    caixa.className = "final-foto";
    caixa.style.setProperty("--cor", corDe(c.id));
    caixa.style.setProperty("--tam", `${tamanho}px`);
    caixa.append(Object.assign(document.createElement("span"), { textContent: iniciais(c.nome) }));
    if (c.sqcand && !fotoFalhou.has(c.sqcand)) {
      const img = new Image();
      img.alt = "";
      img.onerror = () => { fotoFalhou.add(c.sqcand); img.remove(); };
      img.src = urlFoto(c.sqcand);
      caixa.append(img);
    }
    return caixa;
  }

  // ---------- rosca dos votos válidos ----------
  function desenharRosca(d) {
    const svg = $("rosca");
    const destaque = d.cands.filter((c) => slotDe.has(c.id) && c.votos > 0);
    const segs = destaque.map((c) => ({ nome: titulo(c.nome), p: c.pct, cor: corDe(c.id) }));
    const outros = d.cands.filter((c) => !slotDe.has(c.id)).reduce((s, c) => s + c.pct, 0);
    if (outros > 0.05) segs.push({ nome: "Outros", p: outros, cor: "var(--outros)" });
    const total = segs.reduce((s, x) => s + x.p, 0) || 1;
    const R = 80, C = 2 * Math.PI * R, folga = 1.5;
    svg.replaceChildren();
    const fundo = document.createElementNS(SVG, "circle");
    Object.entries({ cx: 100, cy: 100, r: R, class: "rosca-fundo" }).forEach(([k, v]) => fundo.setAttribute(k, v));
    svg.append(fundo);
    let acumulado = 0;
    const arcos = [];
    for (const s of segs) {
      const comp = (C * s.p) / total;
      const arco = document.createElementNS(SVG, "circle");
      Object.entries({ cx: 100, cy: 100, r: R, class: "rosca-arco", transform: "rotate(-90 100 100)" }).forEach(([k, v]) => arco.setAttribute(k, v));
      arco.style.stroke = s.cor;
      arco.style.strokeDashoffset = `${-acumulado}`;
      arco.style.strokeDasharray = roscaDesenhada ? `${Math.max(0, comp - folga)} ${C}` : `0 ${C}`;
      const t = document.createElementNS(SVG, "title");
      t.textContent = `${s.nome}: ${pct(s.p)}`;
      arco.append(t);
      svg.append(arco);
      arcos.push([arco, `${Math.max(0, comp - folga)} ${C}`]);
      acumulado += comp;
    }
    // marca dos 50% (embaixo, metade da volta)
    const marca = document.createElementNS(SVG, "line");
    Object.entries({ x1: 100, y1: 100 + R - 20, x2: 100, y2: 100 + R + 20, class: "rosca-50" }).forEach(([k, v]) => marca.setAttribute(k, v));
    svg.append(marca);
    if (!roscaDesenhada) {   // primeira vez: a rosca "enche" com animação
      requestAnimationFrame(() => requestAnimationFrame(() => arcos.forEach(([a, v]) => { a.style.strokeDasharray = v; })));
      roscaDesenhada = true;
    }
    const lider = destaque[0];
    $("rosca-pct").textContent = lider ? pct(lider.pct) : "–";
    $("rosca-nome").textContent = lider ? titulo(lider.nome) : "";
  }

  // ---------- minimapa: mesmas cores do mapa grande ----------
  function montarMinimapa() {
    const svg = $("minimapa");
    svg.setAttribute("viewBox", MAPA_BR.viewBox);
    svg.innerHTML = `<defs><pattern id="hachura-mini" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect class="hachura-fundo" width="6" height="6"/><line class="hachura-linha" x1="0" y1="0" x2="0" y2="6"/></pattern></defs>`;
    for (const s of SIGLAS) {
      const p = document.createElementNS(SVG, "path");
      p.setAttribute("d", MAPA_BR.estados[s].d);
      p.dataset.uf = s;
      const t = document.createElementNS(SVG, "title");
      p.append(t);
      svg.append(p);
    }
    svg.addEventListener("click", (e) => {
      const s = e.target.closest("path")?.dataset.uf;
      if (s) selecionarEstado(s);
    });
    minimapaPronto = true;
  }

  function pintarMinimapa() {
    for (const p of $("minimapa").querySelectorAll("path")) {
      const grande = $(`uf-${p.dataset.uf}`);
      p.setAttribute("class", `${grande?.getAttribute("class") || "uf sem-votos"} mini`);
      p.querySelector("title").textContent = grande?.getAttribute("aria-label") || nomeEstado(p.dataset.uf);
    }
    $("minimapa-legenda").replaceChildren(...[...$("mapa-legenda").children].map((li) => li.cloneNode(true)));
  }

  // ---------- painel ----------
  function preencher(d) {
    const fim = desfecho(d);
    const vencedor = fim.cands[0];
    $("final").style.setProperty("--cor-vencedor", vencedor ? corDe(vencedor.id) : "var(--s1)");
    $("final-selo").textContent = d.final ? "RESULTADO FINAL"
      : d.pst >= 100 ? "100% DAS SEÇÕES APURADAS" : "PRÉVIA · APURAÇÃO EM ANDAMENTO";
    const onde = NOME_UF[uf] || (typeof nomeEstado === "function" ? nomeEstado(uf) : uf.toUpperCase());
    const nome = (c) => `${titulo(c.nome)}${c.partido ? ` (${c.partido})` : ""}`;
    $("final-titulo").textContent = fim.tipo === "eleito"
      ? `Vitória de ${nome(vencedor)} no 1º turno`
      : fim.tipo === "2turno" ? `${titulo(fim.cands[0].nome)} e ${titulo(fim.cands[1].nome)} vão para o 2º turno`
        : "Aguardando os votos";
    $("final-sub").textContent = [
      `${pct(d.pst)} das seções apuradas`, onde,
      d.hg ? `totalizado às ${d.hg.slice(0, 5)} de ${d.dg}` : "",
      fim.previsto ? "aguardando a confirmação oficial do TSE" : "",
    ].filter(Boolean).join(" · ");

    // destaque do(s) vencedor(es)
    $("final-vencedores").replaceChildren(...fim.cands.map((c) => {
      const el = document.createElement("div");
      el.className = "final-vencedor";
      const info = document.createElement("div");
      info.append(
        Object.assign(document.createElement("strong"), { textContent: titulo(c.nome) }),
        Object.assign(document.createElement("span"), { className: "muted", textContent: [c.partido, c.viceNome && `vice ${titulo(c.viceNome)}`].filter(Boolean).join(" · ") }),
        Object.assign(document.createElement("b"), { className: "final-pct", textContent: pct(c.pct) }),
        Object.assign(document.createElement("span"), { className: "muted", textContent: `${fmtInt.format(c.votos)} votos` }),
      );
      el.append(foto(c, fim.cands.length === 1 ? 112 : 88), info);
      return el;
    }));

    desenharRosca(d);

    // lista: os 4 primeiros com barra, o resto somado
    const top = d.cands.slice(0, 4);
    const resto = d.cands.slice(4);
    $("final-lista").replaceChildren(...top.map((c) => {
      const li = document.createElement("li");
      li.style.setProperty("--cor", corDe(c.id));
      li.innerHTML = `<i></i><span class="n"></span><b></b><div class="barra"><div style="width:${Math.min(c.pct, 100)}%"></div></div>`;
      li.querySelector(".n").textContent = titulo(c.nome);
      li.querySelector("b").textContent = pct(c.pct);
      return li;
    }));
    $("final-outros").textContent = resto.length
      ? `Outras ${resto.length} candidaturas: ${pct(resto.reduce((s, c) => s + c.pct, 0))} somadas` : "";

    // números finais
    const tiles = [
      ["Eleitorado", fmtInt.format(d.eleitorado), ""],
      ["Comparecimento", fmtInt.format(d.comp), pct(d.pcomp)],
      ["Abstenção", fmtInt.format(d.abst), pct(d.pabst)],
      ["Votos válidos", fmtInt.format(d.vv), pct(d.pvv)],
      ["Brancos", fmtInt.format(d.vb), pct(d.pvb)],
      ["Nulos", fmtInt.format(d.vn), pct(d.pvn)],
    ];
    $("final-numeros").replaceChildren(...tiles.map(([rot, v, p]) => {
      const t = document.createElement("div");
      t.append(Object.assign(document.createElement("span"), { textContent: rot }),
        Object.assign(document.createElement("strong"), { textContent: v }),
        Object.assign(document.createElement("em"), { textContent: p }));
      return t;
    }));

    if (!minimapaPronto) montarMinimapa();
    pintarMinimapa();
  }

  document.addEventListener("dados", (e) => {
    const d = e.detail;
    const ativo = forcar || d.final || d.pst >= 100;
    document.body.classList.toggle("modo-final", ativo);
    $("final").hidden = !ativo;
    if (ativo) preencher(d);
  });

  $("final-detalhes").addEventListener("click", () => $("card-mapa").scrollIntoView({ behavior: "smooth", block: "start" }));
  $("final-compartilhar").addEventListener("click", () => $("btn-compartilhar").click());
})();
