/**
 * mock-voice-agent-server.mjs — local stand-in for the AssemblyAI Voice Agent
 * WebSocket API, used ONLY by the automated e2e test when no API key is
 * present. Implements the protocol subset the client needs:
 *
 *   session.update → session.ready (config echo)
 *   input.audio    → input.speech.started → transcript.user.delta ×5 →
 *                    transcript.user → reply.started → reply.audio ×3 →
 *                    transcript.agent → reply.done
 *   session.end    → session.ended
 *
 * Also logs the amount of audio received, so the test can assert that the
 * browser actually streamed PCM through the whole pipeline.
 *
 * Usage: node scripts/mock-voice-agent-server.mjs <port>
 */
import { WebSocketServer } from "ws";

const port = Number(process.argv[2] || 8877);
const wss = new WebSocketServer({ port });

// 20 ms of 24 kHz PCM16 = 480 samples = 960 bytes = 1280 base64 chars
const tone = new Int16Array(480);
for (let i = 0; i < tone.length; i++) {
  tone[i] = Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / 24000));
}
const toneB64 = Buffer.from(tone.buffer).toString("base64");

wss.on("connection", (ws) => {
  let audioChunks = 0;
  const log = (m) => console.log(`[mock-server] ${m}`);
  log("client connected");

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "session.update": {
        log("session.update received → session.ready");
        ws.send(
          JSON.stringify({
            type: "session.ready",
            session_id: "sess_mock_0001",
            expires_at: Math.floor(Date.now() / 1000) + 1800,
            resume_token: "mock-resume",
            config: { ...(msg.session ?? {}), __mock: true },
          }),
        );
        break;
      }

      case "input.audio": {
        audioChunks++;
        if (audioChunks === 1) log("first input.audio chunk received");
        // After ~0.6 s of streamed audio (~30 chunks @ 20 ms), emit a full
        // conversation cycle as if the caller had spoken.
        if (audioChunks === 30) {
          log("enough audio buffered → emitting speech/transcript/reply cycle");
          ws.send(JSON.stringify({ type: "input.speech.started" }));
          const partials = ["Hi, I'd like to", "Hi, I'd like to book", "Hi, I'd like to book tomorrow"];
          partials.forEach((text, i) =>
            setTimeout(() => ws.send(JSON.stringify({ type: "transcript.user.delta", item_id: `u${i}`, text })), i * 250),
          );
          setTimeout(() => {
            ws.send(JSON.stringify({ type: "transcript.user", item_id: "u_final", text: "Hi, I'd like to book tomorrow afternoon" }));
            ws.send(JSON.stringify({ type: "reply.started", reply_id: "r1", item_id: "a1" }));
            for (let k = 0; k < 3; k++) {
              ws.send(JSON.stringify({ type: "reply.audio", data: toneB64 }));
            }
            ws.send(
              JSON.stringify({ type: "transcript.agent", reply_id: "r1", item_id: "a1", interrupted: false, text: "Sure, tomorrow afternoon works. What time?" }),
            );
            ws.send(JSON.stringify({ type: "reply.done", reply_id: "r1", status: "completed" }));
            log("conversation cycle delivered");
          }, partials.length * 250 + 150);
        }
        break;
      }

      case "session.end": {
        log("session.end received → session.ended");
        ws.send(
          JSON.stringify({ type: "session.ended", session_duration_seconds: 1.0, audio_duration_seconds: (audioChunks * 20) / 1000, timestamp: Date.now() / 1000 }),
        );
        ws.close();
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => log(`client left (audio chunks received: ${audioChunks})`));
});

wss.on("listening", () => console.log(`[mock-server] listening on ws://localhost:${port}`));
