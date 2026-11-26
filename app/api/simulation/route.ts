import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to use the training simulator." }, { status: 401 });

    const body = await req.json();
    const focus = typeof body.focus === "string" ? body.focus : "Attacking";
    const level = typeof body.level === "string" ? body.level : "Beginner";
    if (!["Attacking", "Defending", "Midfield", "Goalkeeping"].includes(focus) || !["Beginner", "Intermediate", "Advanced"].includes(level)) {
      return NextResponse.json({ error: "Choose a valid scenario focus and level." }, { status: 400 });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI simulator is not configured. Add GEMINI_API_KEY to Vercel." }, { status: 503 });

    const prompt = `Create one realistic, age-appropriate football decision-making training scenario.
Focus: ${focus}
Experience level: ${level}
Return valid JSON only with this shape:
{"title":"short title","situation":"2-3 sentence game situation with the player's role and teammates/opponents","question":"one clear decision question","options":["option A","option B","option C","option D"],"correct_index":0,"explanation":"explain why the best option fits the situation and why the others are less suitable","principle":"one short coaching principle"}.
Exactly 4 distinct options. correct_index must be 0, 1, 2, or 3. Make the scenario about reading space, support, timing, positioning or safe goalkeeper decision-making. Avoid dangerous physical challenges, reckless tackles or training through pain. Do not present one answer as universally correct outside this scenario.`;

    const models = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];
    let response: Response | null = null;
    let data: any = null;
    for (const model of models) {
      try {
        response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ model, input: prompt, generation_config: { thinking_level: "low", max_output_tokens: 650 } })
        });
        data = await response.json();
        if (response.ok) break;
        const message = data.error?.message || "Simulator generation failed.";
        const transient = [429, 500, 502, 503, 504].includes(response.status) || /high demand|temporar|overload|unavailable|resource_exhausted/i.test(message);
        if (!transient || model === models[models.length - 1]) {
          return NextResponse.json({ error: transient ? "Gemini is busy. Please try again shortly." : message }, { status: transient ? 503 : 502 });
        }
      } catch {
        if (model === models[models.length - 1]) return NextResponse.json({ error: "Simulator is temporarily unavailable." }, { status: 503 });
      }
    }
    const raw = typeof data?.output_text === "string" ? data.output_text : (data?.steps || []).filter((s: any) => s.type === "model_output").flatMap((s: any) => s.content || []).map((p: any) => p.text || "").join("");
    let parsed: any;
    try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
    catch { return NextResponse.json({ error: "The AI returned an unreadable scenario. Try again." }, { status: 502 }); }

    if (typeof parsed.title !== "string" || typeof parsed.situation !== "string" || typeof parsed.question !== "string" ||
      !Array.isArray(parsed.options) || parsed.options.length !== 4 ||
      !Number.isInteger(parsed.correct_index) || parsed.correct_index < 0 || parsed.correct_index > 3 ||
      typeof parsed.explanation !== "string" || typeof parsed.principle !== "string") {
      return NextResponse.json({ error: "The AI returned an incomplete scenario. Please generate another." }, { status: 502 });
    }
    return NextResponse.json({ scenario: parsed });
  } catch (error) {
    console.error("Training simulator failed:", error);
    return NextResponse.json({ error: "Something went wrong while creating the scenario." }, { status: 500 });
  }
}
