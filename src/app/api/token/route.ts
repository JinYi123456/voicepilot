import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints a single-use, short-lived Voice Agent session token.
 * The ASSEMBLYAI_API_KEY never leaves the server.
 *
 * GET https://agents.assemblyai.com/v1/token
 *   ?expires_in_seconds=300            (redemption window, 1–600)
 *   &max_session_duration_seconds=1800 (session cap once connected)
 */
export async function GET() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY is not set. Put it in .env.local and restart the dev server." },
      { status: 500 },
    );
  }

  const url = new URL("https://agents.assemblyai.com/v1/token");
  url.searchParams.set("expires_in_seconds", "300");
  url.searchParams.set("max_session_duration_seconds", "1800");

  try {
    const upstream = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        { error: `Token endpoint returned ${upstream.status}`, detail: text },
        { status: upstream.status },
      );
    }
    const { token } = (await upstream.json()) as { token: string };
    return NextResponse.json({ token });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Failed to reach AssemblyAI token endpoint", detail: message }, { status: 502 });
  }
}
