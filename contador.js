// Contador de pessoas com o site aberto agora. Conecta no Worker da Cloudflare (wrangler.toml + contador/), cujo
// endereço fica em contador.json. Sem esse arquivo, o contador fica escondido.
// Para testar outro endereço: ?contador=<url do Worker>.
(() => {
  const selo = $("online");
  let tentativas = 0, atual = null, animacao = 0, sumir = 0;

  // anima o número do valor anterior até o novo
  function mostrar(n) {
    clearTimeout(sumir);
    selo.hidden = false;
    selo.classList.remove("velho");
    $("online-rot").textContent = n === 1 ? "pessoa acompanhando agora" : "pessoas acompanhando agora";
    if (atual === n) return;
    const de = atual ?? n, inicio = performance.now(), duracao = 700;
    atual = n;
    cancelAnimationFrame(animacao);
    const passo = (t) => {
      const k = Math.min(1, (t - inicio) / duracao), suave = 1 - (1 - k) ** 3;
      $("online-num").textContent = fmtInt.format(Math.round(de + (n - de) * suave));
      if (k < 1) animacao = requestAnimationFrame(passo);
    };
    $("online-num").textContent = fmtInt.format(de);
    animacao = requestAnimationFrame(passo);
    selo.classList.remove("mudou");
    void selo.offsetWidth;   // reinicia a animação
    selo.classList.add("mudou");
  }

  function conectar(base) {
    const ws = new WebSocket(`${base.replace(/^http/, "ws").replace(/\/+$/, "")}/ws`);
    ws.onmessage = (e) => {
      try {
        const n = JSON.parse(e.data).online;
        if (Number.isFinite(n)) { tentativas = 0; mostrar(n); }
      } catch { /* mensagem inesperada */ }
    };
    ws.onclose = () => {
      // numa queda rápida, o número fica apagado; se não voltar em 20 s, some
      selo.classList.add("velho");
      clearTimeout(sumir);
      sumir = setTimeout(() => { selo.hidden = true; }, 20000);
      setTimeout(() => conectar(base), Math.min(60000, 2000 * 2 ** Math.min(tentativas++, 5)));
    };
  }

  async function iniciar() {
    let base = qs.get("contador") || "";
    if (!base) {
      try {
        const r = await fetch(`https://raw.githubusercontent.com/${REPO}/HEAD/contador.json`, { cache: "no-cache" });
        if (r.ok) base = (await r.json()).url || "";
      } catch { /* contador não configurado */ }
    }
    if (/^https?:\/\//.test(base) && "WebSocket" in window) conectar(base);
  }

  iniciar();
})();
