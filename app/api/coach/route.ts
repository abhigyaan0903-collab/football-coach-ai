import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in to use your AI coach." }, { status: 401 });
    }

    const { message, history = [] } = await req.json();
    if (typeof message !== "string" || !message.trim() || message.length > 4000) {
      return NextResponse.json({ error: "Enter a message under 4,000 characters." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI coach is not configured. Add GEMINI_API_KEY to the Vercel project environment variables." }, { status: 503 });
    }

    const recentHistory = Array.isArray(history)
      ? history.slice(-8).map((m: { role?: string; content?: string }) =>
          `${m.role === "assistant" ? "Coach" : "Player"}: ${String(m.content || "").slice(0, 4000)}`
        ).join("\n")
      : "";

    const input = `You are Football Coach AI, a knowledgeable, supportive football coach. Give practical, age-appropriate advice on technique, tactics, decision-making, fitness fundamentals, and safe training. Ask clarifying questions when needed. Never claim to have watched footage unless it was supplied. Structure longer answers with clear steps.

${recentHistory ? "Recent conversation:\n" + recentHistory + "\n\n" : ""}Player: ${message.trim()}
Coach:`;

    let response: Response | null = null;
    let data: any = null;
    const models = ["gemini-3.8-flash", "gemini-3.6-flash"];

    for (const model of models) {
      try {
        response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            model,
            input,
            generation_config: { thinking_level: "low", max_output_tokens: 900 }
          })
        });

        data = await response.json();
        if (response.ok) break;

        const errorMessage = data.error?.message || data.message || "The AI service could not complete this request.";
        const transient = [429, 500, 502, 503, 504].includes(response.status)
          || /high demand|temporar|overload|unavailable|resource_exhausted/i.test(errorMessage);

        if (!transient || model === models[models.length - 1]) {
          return NextResponse.json({
            error: transient
              ? "The AI coach is busy right now. Please wait a minute and try again."
              : errorMessage
          }, { status: transient ? 503 : 502 });
        }
      } catch (error) {
        console.error(`Gemini request failed for ${model}:`, error);
        if (model === models[models.length - 1]) {
          return NextResponse.json({ error: "The AI coach is temporarily unavailable. Please try again shortly." }, { status: 503 });
        }
      }
    }

    if (!response?.ok || !data) {
      return NextResponse.json({ error: "The AI coach is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }

    const reply = (typeof data.output_text === "string"
      ? data.output_text
      : (data.steps || [])
          .filter((step: any) => step.type === "model_output")
          .flatMap((step: any) => step.content || [])
          .map((part: any) => part.text || "")
          .join("")).trim();

    if (!reply) {
      return NextResponse.json({ error: "The AI coach returned an empty response. Try again." }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Football AI coach failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
