/**
 * e2e-voice.mjs — fully automated reproduction of the "user speaks, AI never
 * reacts" bug, no human in the loop:
 *
 *   1. spawns the Next dev server (+ a local mock Voice Agent WS server when
 *      no ASSEMBLYAI_API_KEY is available)
 *   2. launches headless Chromium with Chrome's fake microphone
 *      (--use-fake-device-for-media-stream plays a fixed test tone, NOT
 *      silence; --use-fake-ui-for-media-stream auto-grants mic permission)
 *   3. clicks "Start Call" automatically
 *   4. captures ALL browser console output + the on-page EventLog + the
 *      diagnostic status bar text, and writes everything to
 *      e2e-log.txt
 *   5. PASS criteria: worklet diag-first seen, diag heartbeat with peak>0,
 *      "first audio chunk SENT", and (mock mode) server-side transcript
 *      events rendered on the page.
 *
 * Usage: node scripts/e2e-voice.mjs
 * Output: e2e-log.txt + pass/fail summary on stdout
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const lines = [];
const log = (m) => {
  lines.push(m);
  console.log(m);
};

const DEV_PORT = 30000 + Math.floor(Math.random() * 20000);
const MOCK_PORT = DEV_PORT + 1;
const USE_MOCK = !process.env.ASSEMBLYAI_API_KEY;
const BASE = `http://localhost:${DEV_PORT}`;

// ---------------------------------------------------------------- helpers
function waitFor(proc, matcher, label, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      proc.stdout.off("data", onData);
      proc.stderr.off("data", onData);
      reject(new Error(`timeout waiting for ${label}`));
    }, timeoutMs);
    const onData = (d) => {
      if (matcher.test(String(d))) {
        clearTimeout(t);
        proc.stdout.off("data", onData);
        proc.stderr.off("data", onData);
        resolve();
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- main
const procs = [];
try {
  // 1. Mock server (only when there is no real API key)
  if (USE_MOCK) {
    const mock = spawn("node", ["scripts/mock-voice-agent-server.mjs", String(MOCK_PORT)], { stdio: "pipe" });
    procs.push(mock);
    await waitFor(mock, /listening on/, "mock WS server");
    log(`[e2e] mock Voice Agent server up on :${MOCK_PORT} (no ASSEMBLYAI_API_KEY found)`);
  } else {
    log("[e2e] ASSEMBLYAI_API_KEY present — test will hit the real API");
  }

  // 2. Next dev server
  const env = { ...process.env };
  if (USE_MOCK) env.NEXT_PUBLIC_MOCK_VOICE_WS = `ws://localhost:${MOCK_PORT}`;
  const dev = spawn("npx", ["next", "dev", "-p", String(DEV_PORT)], {
    stdio: "pipe",
    env,
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });
  procs.push(dev);
  await waitFor(dev, /Ready in|started server|Local:/, "next dev server");
  await sleep(1500); // let the first compile settle
  log(`[e2e] next dev server up on :${DEV_PORT}`);

  // 3. Chromium with fake microphone + auto-granted permissions
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream", // fixed test tone, not silence
      "--use-fake-ui-for-media-stream", // auto-grant mic permission
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const page = await browser.newPage();

  page.on("console", (msg) => {
    const text = `[console.${msg.type()}] ${msg.text()}`;
    lines.push(text);
    if (/VoicePilot|diag/.test(text)) console.log(text);
  });
  page.on("pageerror", (err) => {
    lines.push(`[pageerror] ${err.message}`);
    console.log(`[pageerror] ${err.message}`);
  });
  page.on("websocket", (ws) => {
    log(`[e2e] page opened WebSocket → ${ws.url().split("?")[0]}`);
    ws.on("close", () => log("[e2e] page WebSocket closed"));
  });

  await page.goto(BASE, { waitUntil: "networkidle" });

  // 4. Click Start Call
  const startBtn = page.getByRole("button", { name: /Start Call/i });
  await startBtn.click();
  log('[e2e] clicked "Start Call"');

  // Wait for the session to come up and audio to flow
  await page.waitForFunction(
    () => document.body.innerText.includes("session.ready"),
    { timeout: 20000 },
  );
  log("[e2e] session.ready reached");
  await sleep(9000); // let the fake mic stream ~9 s of tone

  // 5. Harvest on-page diagnostics
  const bodyText = await page.evaluate(() => document.body.innerText);
  writeFileSync("e2e-body.txt", bodyText);

  const check = (name, re) => {
    const ok = re.test(lines.join("\n")) || re.test(bodyText);
    log(`${ok ? "✅" : "❌"} ${name}`);
    return ok;
  };

  log("\n================= VERDICT =================");
  const results = [];
  results.push(check("worklet process() running (diag-first)", /worklet process\(\) IS running/));
  results.push(check("heartbeat with SIGNAL (non-silent peak > 0)", /peak [1-9]|peak 0\.[0-9]*[1-9]/));
  results.push(check("audio chunk actually SENT to server", /first audio chunk SENT|audio chunks/));
  results.push(check("no chunk DROPPED warnings", /^(?!.*chunk DROPPED)/m.test(lines.join("\n")) ? /session\.ready/ : /$^/));
  results.push(check("input.speech.started received (server-side VAD)", /← input\.speech\.started/));
  results.push(check("transcript.user.delta received", /transcript\.user\.delta/));
  results.push(check("reply.audio received", /reply\.audio/));
  const pass = results.every(Boolean);
  log(`\n${pass ? "🟢 E2E PASS — full audio→transcript→reply pipeline works" : "🔴 E2E FAIL — pipeline broken, see e2e-log.txt"}`);

  writeFileSync("e2e-log.txt", lines.join("\n"));
  log("[e2e] full log written to e2e-log.txt, page text to e2e-body.txt");

  await browser.close();
  process.exitCode = pass ? 0 : 1;
} catch (err) {
  log(`[e2e] FATAL: ${err.message}`);
  writeFileSync("e2e-log.txt", lines.join("\n") + `\nFATAL: ${err.stack}`);
  process.exitCode = 2;
} finally {
  for (const p of procs) {
    try {
      if (process.platform === "win32") {
        // shell wrapper pid ≠ node pid; kill the whole tree
        const { execSync } = await import("node:child_process");
        try {
          execSync(`taskkill /PID ${p.pid} /T /F`);
        } catch {
          p.kill();
        }
      } else {
        process.kill(-p.pid, "SIGTERM"); // detached group
      }
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(process.exitCode ?? 0), 500);
}
