# Votos 2026 — resultados ao vivo

Site estático que mostra a apuração da eleição presidencial de 2026 e atualiza automaticamente a cada
**5 segundos**, usando os arquivos JSON públicos do TSE (formato 2026, "resultado unificado" EA20):

```
https://resultados.tse.jus.br/oficial/comum/config/ele-c.json                          ← configuração (EA11)
https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json    ← resultado (EA20)
```

O código da eleição e as pastas são lidos da configuração do TSE. Sem `?e=`, o site usa a eleição presidencial
mais recente que já aconteceu, então passa sozinho para o 2º turno (código `6258`) no dia dele.

## Rodar

```bash
node server.js
# abra http://localhost:8080   (ou http://localhost:8080/?uf=sp para um estado)
```

O `server.js` (sem dependências) serve os arquivos e faz proxy de `/tse/*` para o TSE, evitando bloqueio de CORS.
Também dá para abrir o `index.html` direto ou publicar em GitHub Pages; nesse caso o navegador busca o TSE diretamente.

Recursos: destaques (líder, vantagem, % apurado), barra dos votos válidos com a marca de 50%, lista de candidatos,
gráfico da evolução da apuração (Chart.js) e composição do eleitorado. Tema claro/escuro automático.

Se o arquivo não for encontrado, o site mostra os endereços que tentou. Parâmetros na URL:

- `?uf=sp` – estado (`br` = Brasil, `zz` = exterior)
- `?e=6257` – força o código da eleição (`6258` = 2º turno)
- `?arquivo=<url>` – usa diretamente a URL completa de um JSON do TSE
