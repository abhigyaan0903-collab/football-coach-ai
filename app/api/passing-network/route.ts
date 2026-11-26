import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to generate a passing network." }, { status: 401 });

    const body = await req.json();
    const formation = typeof body.formation === "string" ? body.formation : "";
    const intent = typeof body.intent === "string" ? body.intent : "Build-up play";
    const players = Array.isArray(body.players) ? body.players : [];
    if (!["4-3-3", "4-4-2", "3-5-2", "4-2-3-1"].includes(formation) || players.length !== 11) {
      return NextResponse.json({ error: "Choose a supported formation before generating routes." }, { status: 400 });
    }
    if (!["Build-up play", "Quick counterattack", "Possession control", "High pressing"].includes(intent)) {
      return NextResponse.json({ error: "Choose a valid tactical objective." }, { status: 400 });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI tactics are not configured. Add GEMINI_API_KEY to Vercel." }, { status: 503 });

    const safePlayers = players.map((p: any, i: number) => ({ index: i, role: String(p?.role || "Player").slice(0, 12) }));
    const prompt = `You are a football tactics assistant. Suggest a simple, age-appropriate illustrative passing network for the given formation and tactical objective. This is a training-board concept, not match tracking or a guaranteed tactic.
Formation: ${formation}
Objective: ${intent}
Players (use only these zero-based indexes): ${JSON.stringify(safePlayers)}
Return valid JSON only: {"connections":[{"from_index":0,"to_index":1,"purpose":"short explanation"}],"coaching_note":"one concise coaching note"}.
Return 4 to 7 distinct connections. Use only valid player indexes, no self-passes, and do not repeat a connection. Keep explanations concise and realistic. Do not claim these are measured or proven passing patterns.`;

    const models = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];
    let response: Response | null = null;
    let data: any = null;
    for (const model of models) {
      try {
        response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ model, input: prompt, generation_config: { thinking_level: "low", max_output_tokens: 700 } })
        });
        data = await response.json();
        if (response.ok) break;
        const message = data.error?.message || "Tactical generation failed.";
        const transient = [429, 500, 502, 503, 504].includes(response.status) || /high demand|temporar|overload|unavailable|resource_exhausted/i.test(message);
        if (!transient || model === models[models.length - 1]) {
          return NextResponse.json({ error: transient ? "Gemini is busy. Please try again shortly." : message }, { status: transient ? 503 : 502 });
        }
      } catch {
        if (model === models[models.length - 1]) return NextResponse.json({ error: "AI tactics are temporarily unavailable." }, { status: 503 });
      }
    }
    const raw = typeof data?.output_text === "string" ? data.output_text : (data?.steps || []).filter((s: any) => s.type === "model_output").flatMap((s: any) => s.content || []).map((p: any) => p.text || "").join("");
    let parsed: any;
    try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
    catch { return NextResponse.json({ error: "The AI returned an unreadable passing network. Try again." }, { status: 502 }); }

    const connections = Array.isArray(parsed.connections) ? parsed.connections.filter((c: any) =>
      Number.isInteger(c.from_index) && Number.isInteger(c.to_index) &&
      c.from_index >= 0 && c.from_index < 11 && c.to_index >= 0 && c.to_index < 11 &&
      c.from_index !== c.to_index && typeof c.purpose === "string"
    ).slice(0, 7) : [];
    if (connections.length < 3) return NextResponse.json({ error: "The AI could not produce enough valid passing routes. Try again." }, { status: 502 });
    return NextResponse.json({ connections, coaching_note: String(parsed.coaching_note || "Use these as practice ideas and adapt them to your players.") });
  } catch (error) {
    console.error("Passing network generation failed:", error);
    return NextResponse.json({ error: "Something went wrong while generating passing routes." }, { status: 500 });
  }
}
