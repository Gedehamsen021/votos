// Contador de pessoas com o site aberto agora. Conecta no Worker da Cloudflare (pasta contador/), cujo endereço
// o workflow .github/workflows/contador.yml grava em contador.json. Sem esse arquivo, o contador fica escondido.
// Para testar outro endereço: ?contador=<url do Worker>.
(() => {
  const selo = $("online");
  let tentativas = 0;

  function mostrar(n) {
    const texto = `${fmtInt.format(n)} ${n === 1 ? "pessoa acompanhando" : "pessoas acompanhando"}`;
    selo.hidden = false;
    if ($("online-txt").textContent === texto) return;
    $("online-txt").textContent = texto;
    selo.classList.remove("pulsa");
    void selo.offsetWidth;   // reinicia a animação
    selo.classList.add("pulsa");
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
      selo.hidden = true;   // sem conexão, não mostra número velho
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
