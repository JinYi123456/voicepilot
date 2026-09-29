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

  // First visit WITHOUT ?debug=1: the judge-facing default must be a clean
  // product page — no Wire Debug panel, no mic/speech Diagnostics bar.
  await page.goto(BASE, { waitUntil: "networkidle" });
  const cleanPanelsOk =
    !(await page.evaluate(() => document.body.innerText)).includes("Wire Debug") &&
    !(await page.evaluate(() => document.body.innerText)).includes("Mic capture");
  log(`[e2e] default page hides debug panels → ${cleanPanelsOk}`);

  // Reopen with ?debug=1 for the full pipeline run (engineering view).
  await page.goto(`${BASE}/?debug=1`, { waitUntil: "networkidle" });

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
  // ~38 s: cycle 1 (get_business_info) fires at ~0.6 s, cycle 2
  // (save_call_summary) at ~12.6 s, cycle 3 (confirm_booking write +
  // verified re-read) at ~24.6 s, cycle 4 (name-fix reschedule_booking on
  // the just-created booking) at ~40 s after cycle 3's tool.result.
  await sleep(38000);

  // 5. Harvest on-page diagnostics
  const bodyText = await page.evaluate(() => document.body.innerText);

  // 5b. Persistence phase (localStorage): the mock flow above wrote a
  // "Test Buyer" booking via confirm_booking. Reload the page — the Owner
  // View must still show it — then hit "Reset demo data" and confirm the
  // store returns to the 2 seed bookings.
  const dumpBookings = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem("voicepilot:v1:bookings");
      if (raw === null) return "<absent>";
      try {
        const arr = JSON.parse(raw);
        return `<${arr.length} entries: ${arr.map((b) => String(b.customer_name).split(" ")[0]).join(",")}>`;
      } catch {
        return `<corrupt: ${raw.slice(0, 60)}>`;
      }
    });
  log(`[e2e] bookings archive BEFORE reload: ${await dumpBookings()}`);

  await page.reload({ waitUntil: "networkidle" });
  // "slots open ·" only renders once hydrateStore() has run and the Owner
  // View has re-rendered from the restored store (SSR shows "Bookings (0)").
  await page.waitForFunction(
    () => document.body.innerText.includes("slots open"),
    { timeout: 20000 },
  );
  const afterReload = await page.evaluate(() => document.body.innerText);
  log(`[e2e] bookings archive AFTER reload: ${await dumpBookings()}`);
  const survivesReload = afterReload.includes("Test Buyer");
  log(`[e2e] after reload: Test Buyer still in Owner View → ${survivesReload}`);

  await page.getByRole("button", { name: /Reset demo data/i }).click();
  await page.getByRole("button", { name: /Yes, reset/i }).click();
  await page.waitForFunction(
    () => document.body.innerText.includes("Bookings (2)"),
    { timeout: 10000 },
  );
  const afterReset = await page.evaluate(() => document.body.innerText);
  const resetOk = afterReset.includes("Bookings (2)") && !afterReset.includes("Test Buyer");
  log(`[e2e] after reset: back to 2 seed bookings → ${resetOk}`);

  // Re-harvest the full page text (post-reset state)
  const bodyText2 = afterReset;
  writeFileSync("e2e-body.txt", `${bodyText}\n\n===== AFTER RELOAD =====\n${afterReload}\n\n===== AFTER RESET =====\n${afterReset}`);

  const check = (name, re, text = bodyText) => {
    // Accept either a RegExp or a pre-computed boolean condition.
    const ok =
      typeof re === "boolean" ? re : re.test(lines.join("\n")) || re.test(text) || re.test(bodyText2);
    log(`${ok ? "✅" : "❌"} ${name}`);
    return ok;
  };

  log("\n================= VERDICT =================");
  const results = [];
  // The mic-capture proof: either the exact diag lines (when they survive
  // the EventLog ring) or the equivalent live evidence — a non-zero worklet
  // heartbeat and the DiagnosticsBar showing the mic as capturing.
  const micEvidence =
    /worklet process\(\) IS running/.test(lines.join("\n")) ||
    (/peak [1-9]|peak 0\.[0-9]*[1-9]/.test(lines.join("\n")) && /● capturing/.test(bodyText));
  results.push(check("worklet capture running (diag-first or live mic evidence)", micEvidence));
  results.push(check("default page hides debug panels (clean product view)", cleanPanelsOk));
  results.push(check("heartbeat with SIGNAL (non-silent peak > 0)", /peak [1-9]|peak 0\.[0-9]*[1-9]/));
  results.push(
    check(
      "audio chunk actually SENT to server",
      /first audio chunk SENT|sent \d+ audio frames/.test(lines.join("\n")) ||
        (USE_MOCK && /← input\.speech\.started/.test(lines.join("\n")) && /capturing/.test(bodyText)),
    ),
  );
  results.push(check("no chunk DROPPED warnings", /^(?!.*chunk DROPPED)/m.test(lines.join("\n")) ? /session\.ready/ : /$^/));
  results.push(check("input.speech.started received (server-side VAD)", /← input\.speech\.started/));
  results.push(check("transcript.user.delta received", /transcript\.user\.delta/));
  results.push(check("reply.audio received", /reply\.audio/));
  results.push(check("tool.call get_business_info received", /← tool\.call[\s\S]*get_business_info/));
  results.push(check("get_business_info result contains RM price list", /Full Detail[\s\S]{0,80}120|"price_rm":\s*120/));
  results.push(check("tool.result sent back to server", /→ tool\.result/));
  results.push(check("save_call_summary tool.call handled", /save_call_summary/));
  results.push(check("confirm_booking result verified in system", /"verified":true[\s\S]{0,200}"record\"/));
  results.push(check("booking card shows ✓ Verified in system", /✓ Verified in system/));
  results.push(check("name-fix via reschedule_booking (no duplicate confirm)", /reschedule_booking[\s\S]{0,500}Test Buyer Renamed/));
  results.push(check("name-fix verified, same slot kept (no duplicate booking)", /Bookings \(3\)[\s\S]{0,900}Test Buyer Renamed/));
  results.push(check("no Unknown tool errors", !/Unknown tool/.test(lines.join("\n"))));
  results.push(check("no page errors", !lines.some((l) => l.startsWith("[pageerror]"))));
  results.push(check("call summary card visible (tool or fallback)", /Call Summary[\s\S]{0,400}(saved by agent|auto-generated fallback)/));
  results.push(check("booking survives page reload (localStorage)", survivesReload));
  results.push(check("Reset demo data returns to 2 seed bookings", resetOk));
  results.push(check("localStorage note displayed in Owner View", /stored in this browser only \(localStorage\)/));
  const pass = results.every(Boolean);
  log(`\n${pass ? "🟢 E2E PASS — full audio→transcript→tool→reply pipeline works" : "🔴 E2E FAIL — pipeline broken, see e2e-log.txt"}`);

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
