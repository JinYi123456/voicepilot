/**
 * mock-voice-agent-server.mjs — local stand-in for the AssemblyAI Voice Agent
 * WebSocket API, used ONLY by the automated e2e test when no API key is
 * present. Implements the protocol subset the client needs:
 *
 *   session.update → session.ready (config echo)
 *   input.audio    → input.speech.started → transcript.user.delta ×N →
 *                    transcript.user → reply.started → reply.audio ×3 →
 *                    transcript.agent → reply.done
 *   tool.call      (server → client) → tool.result (client → server)
 *                  → next reply uses the tool result
 *   session.end    → session.ended
 *
 * The scenario is fixed and deterministic:
 *   cycle 1: caller asks about prices → server emits tool.call
 *            get_business_info{topic:"prices"} → the client MUST run the
 *            browser-side logic and send tool.result back → the server then
 *            answers using the returned prices → reply.done
 *   cycle 2: caller says goodbye → tool.call save_call_summary →
 *            tool.result → farewell reply → reply.done
 *
 * This exercises the full tool loop (call → browser execution → result →
 * next reply) without a real API key.
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
  let cycle = 0; // 1 = prices enquiry, 2 = goodbye + summary, 3 = write
  let scheduled2 = false;
  let scheduled3 = false;
  const log = (m) => console.log(`[mock-server] ${m}`);
  log("client connected");

  /** One full turn: partials → final → reply audio → agent text → reply.done */
  function sendCycle({ partials, finalText, agentText, replyId, toolCall }) {
    ws.send(JSON.stringify({ type: "input.speech.started" }));
    partials.forEach((text, i) =>
      setTimeout(() => ws.send(JSON.stringify({ type: "transcript.user.delta", item_id: `u${replyId}_${i}`, text })), i * 250),
    );
    const after = partials.length * 250 + 150;
    setTimeout(() => {
      ws.send(JSON.stringify({ type: "transcript.user", item_id: `u_${replyId}`, text: finalText }));
      ws.send(JSON.stringify({ type: "reply.started", reply_id: replyId, item_id: `a_${replyId}` }));
      for (let k = 0; k < 3; k++) {
        ws.send(JSON.stringify({ type: "reply.audio", data: toneB64 }));
      }
      if (toolCall) {
        // Server asks the client to execute a tool mid-reply.
        ws.send(JSON.stringify({ type: "tool.call", call_id: `call_${replyId}`, name: toolCall.name, arguments: toolCall.arguments }));
        log(`tool.call emitted: ${toolCall.name} ${JSON.stringify(toolCall.arguments)}`);
      }
      ws.send(
        JSON.stringify({ type: "transcript.agent", reply_id: replyId, item_id: `a_${replyId}`, interrupted: false, text: agentText }),
      );
      ws.send(JSON.stringify({ type: "reply.done", reply_id: replyId, status: "completed" }));
      log(`cycle ${cycle} delivered (${toolCall ? "with tool.call" : "no tool"})`);
    }, after);
  }

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
        const tools = (msg.session?.tools ?? []).map((t) => t.name);
        log(`session tools: ${tools.join(", ")}`);
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
        // After ~0.6 s of streamed audio (~30 chunks @ 20 ms), run cycle 1:
        // a prices question that requires the get_business_info tool.
        if (audioChunks === 30 && cycle === 0) {
          cycle = 1;
          log("enough audio buffered → prices enquiry with get_business_info tool.call");
          sendCycle({
            partials: ["Hi, how much is the", "Hi, how much is the Full Detail"],
            finalText: "Hi, how much is the Full Detail?",
            agentText: "Let me check the price list for you.",
            replyId: "r1",
            toolCall: { name: "get_business_info", arguments: { topic: "prices" } },
          });
        }
        // Cycle 2 fires 12 s later (scheduled exactly ONCE): goodbye +
        // save_call_summary tool.call.
        if (!scheduled2 && audioChunks >= 30) {
          scheduled2 = true;
          setTimeout(() => {
            if (cycle !== 1 || ws.readyState !== ws.OPEN) return;
            cycle = 2;
            log("goodbye turn with save_call_summary tool.call");
            sendCycle({
              partials: ["Okay that's all,", "Okay that's all, thank you, bye"],
              finalText: "Okay that's all, thank you, bye!",
              agentText: "Thank you for calling Sunrise Car Wash. Goodbye!",
              replyId: "r2",
              toolCall: {
                name: "save_call_summary",
                arguments: {
                  intent: "asked about Full Detail price",
                  outcome: "price quoted from get_business_info, no booking made",
                  languages_used: ["English"],
                  next_step: "customer may call back to book",
                },
              },
            });
          }, 12000);
        }
        // Cycle 3 fires 24 s in (scheduled exactly ONCE): a full write —
        // confirm_booking, whose result must carry verified:true and light
        // up the Owner View + card badge.
        if (!scheduled3 && audioChunks >= 30) {
          scheduled3 = true;
          setTimeout(() => {
            if (cycle !== 2 || ws.readyState !== ws.OPEN) return;
            cycle = 3;
            const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
            const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
            log("confirm turn with confirm_booking tool.call");
            sendCycle({
              partials: ["Please book a Full Detail", "Please book a Full Detail tomorrow 3pm for Test Buyer"],
              finalText: "Please book a Full Detail tomorrow 3pm, I'm Test Buyer, 012-9990001.",
              agentText: "Let me book that for you.",
              replyId: "r3",
              toolCall: {
                name: "confirm_booking",
                arguments: {
                  customer_name: "Test Buyer",
                  phone: "012-9990001",
                  service_type: "Full Detail",
                  confirmed_time: `${iso} 15:00`,
                },
              },
            });
          }, 24000);
        }
        break;
      }

      case "tool.result": {
        log(
          `tool.result received for ${msg.call_id} (is_error=${msg.is_error}) → answering from tool data`,
        );
        let answer = "Thanks, I have the details.";
        try {
          const data = JSON.parse(msg.result);
          if (msg.call_id === "call_r1" && Array.isArray(data.prices)) {
            const detail = data.prices.find((p) => /full detail/i.test(p.service));
            answer = detail
              ? `Our Full Detail is ${data.currency === "RM (Malaysian Ringgit)" ? "120 ringgit" : String(detail.price_rm) + " ringgit"}.`
              : "Sorry, I could not find that price.";
          } else if (msg.call_id === "call_r2") {
            answer = "Thanks for calling Sunrise Car Wash. Goodbye!";
          } else if (msg.call_id === "call_r3") {
            answer =
              data.verified === true
                ? "Booked — Full Detail tomorrow at 3, and it is verified in the system."
                : "Booked, but I could not verify it in the system — sorry about that.";
          }
        } catch {
          /* keep generic answer */
        }
        // The post-result reply (uses the tool result, per docs wiring).
        ws.send(JSON.stringify({ type: "reply.started", reply_id: `${msg.call_id}_b` }));
        for (let k = 0; k < 2; k++) {
          ws.send(JSON.stringify({ type: "reply.audio", data: toneB64 }));
        }
        ws.send(JSON.stringify({ type: "transcript.agent", reply_id: `${msg.call_id}_b`, item_id: `b_${msg.call_id}`, interrupted: false, text: answer }));
        ws.send(JSON.stringify({ type: "reply.done", reply_id: `${msg.call_id}_b`, status: "completed" }));
        log(`post-tool reply: "${answer}"`);
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
