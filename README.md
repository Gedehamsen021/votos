# Votos 2026 — resultados ao vivo

Site estático que mostra a apuração da eleição presidencial de 2026 (1º turno, eleição TSE `6257`, cargo `1`)
e atualiza automaticamente a cada **5 segundos**, usando o JSON público do TSE:

```
https://resultados.tse.jus.br/oficial/ele2026/6257/dados-simplificados/br/br-c0001-e006257-r.json
```

## Rodar

```bash
node server.js
# abra http://localhost:8080   (ou http://localhost:8080/?uf=sp para um estado)
```

O `server.js` (sem dependências) serve os arquivos e faz proxy de `/tse/*` para o TSE, evitando bloqueio de CORS.
Também dá para abrir o `index.html` direto ou publicar em GitHub Pages; nesse caso o navegador busca o TSE diretamente.

Para outra eleição/turno, altere `ELEICAO` e `CARGO` no topo de `app.js`.
