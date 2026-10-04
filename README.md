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

**Mapa por estado:** cada estado aparece com a cor de quem lidera ali (mais forte = vantagem maior), atualizado
sozinho a cada 30 s. Passando o mouse (ou tocando) aparece o resumo do estado; clicando, o site inteiro passa a
mostrar aquele estado. Ao lado ficam quantos estados cada candidatura lidera, o resultado por região e o do exterior.
Contornos dos estados: [MapSVG](https://mapsvg.com/maps/brazil), via [svg-maps](https://github.com/VictorCazanave/svg-maps)
de Victor Cazanave, licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (`mapa-brasil.js`).

**Compartilhar:** o botão no topo gera uma imagem 1200×675 (formato do X) com o resultado do momento, um texto
pronto para o post (contando os 280 caracteres) e botões para postar no X, copiar ou baixar a imagem. Como o link
de post do X só aceita texto, no celular o botão usa o compartilhamento do sistema (imagem + texto juntos) e no
computador a imagem é copiada para você colar no post com Ctrl+V.

## Contador de pessoas acompanhando (opcional)

O selo "N pessoas acompanhando" no topo conta quem está com o site aberto agora. Ele usa um Cloudflare Worker
(pasta `contador/`) que recebe uma conexão leve de cada aba aberta; o plano grátis da Cloudflare aguenta milhares de
pessoas ao mesmo tempo (limite de 100 mil conexões por dia). Enquanto não for configurado, o selo fica escondido.

Para ligar (uma vez só, ~10 minutos):

1. Crie uma conta grátis em <https://dash.cloudflare.com/sign-up>.
2. No painel da Cloudflare, abra **Workers e Pages** uma vez: isso cria o endereço `*.workers.dev` da sua conta.
3. Copie o **Account ID** (fica na página inicial da conta, no menu de três pontinhos → *Copy account ID*).
4. Crie uma chave: ícone do perfil → **My Profile** → **API Tokens** → **Create Token** → modelo
   **Edit Cloudflare Workers** → *Continue to summary* → *Create Token*, e copie a chave.
5. No GitHub: repositório → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
   Crie `CLOUDFLARE_API_TOKEN` (a chave do passo 4) e `CLOUDFLARE_ACCOUNT_ID` (o código do passo 3).
6. Em **Actions** → **Publicar contador de pessoas online** → **Run workflow**. O workflow publica o Worker e grava o
   endereço dele em `contador.json`; em alguns minutos o contador aparece no site.

## Histórico do gráfico (coletor)

O gráfico de evolução não depende de a página estar aberta: o workflow `.github/workflows/coleta.yml` roda
`coleta/coletar.mjs` no GitHub Actions, que consulta o TSE a cada 20 s (estados e exterior a cada ~1 min) e grava
um ponto por atualização em `historico/<eleição>/<uf>.json` na branch `dados`. O site carrega esse histórico
(via raw.githubusercontent.com) e junta com o que o próprio navegador grava.

O coletor começa sozinho quando ele ou o workflow mudam, nos domingos de outubro entre 17h e 1h (horário de
Brasília) ou manualmente em *Actions → Coletar histórico da apuração → Run workflow*. Ele para na totalização final
ou depois de ~5h45.

O começo do histórico do 1º turno (de 1,23% a 31,9% das seções, antes de o coletor existir) foi importado de
`coleta/semente/6257-br.json`, convertido do arquivo público do projeto
[driano1221/apuracao-presidencial-2026](https://github.com/driano1221/apuracao-presidencial-2026), que também lê os
arquivos do TSE.

Se o arquivo não for encontrado, o site mostra os endereços que tentou. Parâmetros na URL:

- `?uf=sp` – estado (`br` = Brasil, `zz` = exterior)
- `?e=6257` – força o código da eleição (`6258` = 2º turno)
- `?arquivo=<url>` – usa diretamente a URL completa de um JSON do TSE
