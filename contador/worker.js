// Contador de pessoas com o site aberto agora.
// Cada aba aberta mantém um WebSocket com este Worker. Um único Durable Object ("sala") guarda as conexões,
// conta quantas estão abertas e avisa todo mundo quando o número muda (no máximo a cada 1,5 s).
// Usa a hibernação de WebSockets: com ninguém entrando ou saindo, o objeto dorme e não gasta nada.
import { DurableObject } from "cloudflare:workers";

const CORS = { "access-control-allow-origin": "*", "cache-control": "no-store" };

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    const sala = env.SALA.get(env.SALA.idFromName("principal"));
    if (pathname === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("Use WebSocket.", { status: 426, headers: CORS });
      return sala.fetch(req);
    }
    if (pathname === "/") return Response.json({ online: await sala.contar() }, { headers: CORS });
    return new Response("Não encontrado.", { status: 404, headers: CORS });
  },
};

export class Sala extends DurableObject {
  async fetch() {
    const [cliente, servidor] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(servidor);
    servidor.send(JSON.stringify({ online: this.ctx.getWebSockets().length }));   // número na hora, para quem chegou
    await this.avisarEmBreve();
    return new Response(null, { status: 101, webSocket: cliente });
  }

  async contar() {
    return this.ctx.getWebSockets().length;
  }

  async webSocketMessage() { /* os clientes não precisam mandar nada */ }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, "tchau"); } catch { /* já fechado */ }
    await this.avisarEmBreve();
  }

  async webSocketError() {
    await this.avisarEmBreve();
  }

  // Junta várias entradas e saídas num aviso só.
  async avisarEmBreve() {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + 1500);
  }

  async alarm() {
    const conexoes = this.ctx.getWebSockets();
    const msg = JSON.stringify({ online: conexoes.length });
    for (const ws of conexoes) {
      try { ws.send(msg); } catch { /* conexão caindo */ }
    }
  }
}
