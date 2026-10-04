// Servidor local sem dependências: serve o site e faz proxy de /tse/* para resultados.tse.jus.br
// (evita bloqueio de CORS no navegador). Uso: node server.js  →  http://localhost:8080
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname.startsWith("/tse/oficial/")) {
    const alvo = "https://resultados.tse.jus.br" + url.pathname.slice(4);
    https.get(alvo, { headers: { "User-Agent": "votos-2026" } }, (up) => {
      res.writeHead(up.statusCode, {
        "Content-Type": up.headers["content-type"] || "application/json",
        "Cache-Control": "no-store",
      });
      up.pipe(res);
    }).on("error", (e) => { res.writeHead(502); res.end(e.message); });
    return;
  }

  const arquivo = path.join(__dirname, url.pathname === "/" ? "index.html" : path.normalize(url.pathname));
  if (!arquivo.startsWith(__dirname) || !TIPOS[path.extname(arquivo)]) { res.writeHead(404); return res.end(); }
  fs.readFile(arquivo, (err, dados) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(arquivo)] });
    res.end(dados);
  });
}).listen(PORT, () => console.log(`Abra http://localhost:${PORT}`));
