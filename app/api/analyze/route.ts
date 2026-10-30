import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in before analysing a video." }, { status: 401 });
    }

    const { mimeType, category, filename, storagePath } = await req.json();

    if (!storagePath || typeof storagePath !== "string" || !storagePath.startsWith(user.id + "/")) {
      return NextResponse.json({ error: "Invalid video path." }, { status: 400 });
    }
    if (!["video/mp4", "video/quicktime", "video/webm"].includes(mimeType)) {
      return NextResponse.json({ error: "Upload an MP4, MOV or WebM video." }, { status: 400 });
    }
    if (!["shooting", "defending", "goalkeeping", "passing", "dribbling", "first_touch", "match_analysis", "other"].includes(category)) {
      return NextResponse.json({ error: "Choose a valid skill category." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI features are not configured. Add GEMINI_API_KEY to the Vercel project environment variables." }, { status: 503 });
    }

    const { data: signed, error: signedError } = await supabase.storage.from("football-videos").createSignedUrl(storagePath, 60);
    if (signedError || !signed?.signedUrl) {
      return NextResponse.json({ error: "Could not securely access your uploaded video." }, { status: 400 });
    }

    const videoResponse = await fetch(signed.signedUrl);
    if (!videoResponse.ok) {
      return NextResponse.json({ error: "Could not download the uploaded video for analysis." }, { status: 400 });
    }

    const videoBytes = await videoResponse.arrayBuffer();
    // Base64 encoding increases size by about one third; keep the full request under the inline-input limit.
    if (videoBytes.byteLength > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "Choose a video under 12 MB so it fits the instant analysis request." }, { status: 413 });
    }

    const videoBase64 = Buffer.from(videoBytes).toString("base64");
    const prompt = `Analyse this football training video as a professional, constructive coach. Skill category: ${category}.
Return valid JSON only, without Markdown fences, with these keys:
overall_score (integer from 0 to 100), summary (string), strengths (array of strings), improvements (array of strings), drills (array of objects with name, instructions, sets, reps), observations (array of strings), confidence_note (string).
Assess only what is visibly supported by the footage. Be honest about camera angle, clip length, frame sampling and anything that cannot be assessed. Do not invent measurements or claim certainty where the footage does not support it. Give safe, age-appropriate practice guidance. Scores are coaching estimates, not objective scientific measurements.`;

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
            input: [
              { type: "text", text: prompt },
              {
                type: "video",
                data: videoBase64,
                mime_type: mimeType === "video/quicktime" ? "video/mov" : mimeType
              }
            ],
            generation_config: { thinking_level: "low", max_output_tokens: 1800 }
          })
        });

        data = await response.json();
        if (response.ok) break;

        const errorMessage = data.error?.message || data.message || "Video analysis failed.";
        const transient = [429, 500, 502, 503, 504].includes(response.status)
          || /high demand|temporar|overload|unavailable|resource_exhausted/i.test(errorMessage);

        if (!transient || model === models[models.length - 1]) {
          return NextResponse.json({
            error: transient
              ? "The video AI is busy right now. Please wait a minute and try again."
              : errorMessage
          }, { status: transient ? 503 : 502 });
        }
      } catch (error) {
        console.error(`Gemini video request failed for ${model}:`, error);
        if (model === models[models.length - 1]) {
          return NextResponse.json({ error: "Video analysis is temporarily unavailable. Please try again shortly." }, { status: 503 });
        }
      }
    }

    if (!response?.ok || !data) {
      return NextResponse.json({ error: "Video analysis is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }

    const raw = typeof data.output_text === "string"
      ? data.output_text
      : (data.steps || [])
          .filter((step: any) => step.type === "model_output")
          .flatMap((step: any) => step.content || [])
          .map((part: any) => part.text || "")
          .join("");

    let analysis: any;
    try {
      const cleaned = raw.trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/i, "");
      analysis = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "The AI response could not be read. Try a shorter, clearer clip." }, { status: 502 });
    }

    if (typeof analysis.overall_score !== "number" || !analysis.summary || !Array.isArray(analysis.strengths) || !Array.isArray(analysis.improvements) || !Array.isArray(analysis.drills)) {
      return NextResponse.json({ error: "The AI returned an incomplete report. Please try again with a clearer clip." }, { status: 502 });
    }

    const { data: saved, error } = await supabase.from("video_analyses").insert({
      user_id: user.id,
      storage_path: storagePath,
      original_filename: filename,
      mime_type: mimeType,
      file_size_bytes: videoBytes.byteLength,
      skill_category: category,
      status: "completed",
      score: Math.max(0, Math.min(100, Math.round(analysis.overall_score))),
      analysis
    }).select().single();

    if (error) {
      return NextResponse.json({ error: "Analysis completed but could not be saved: " + error.message, analysis }, { status: 500 });
    }

    return NextResponse.json({ analysis, id: saved.id });
  } catch (error) {
    console.error("Football video analysis failed:", error);
    return NextResponse.json({ error: "Something went wrong while analysing the video. Please try again." }, { status: 500 });
  }
}
