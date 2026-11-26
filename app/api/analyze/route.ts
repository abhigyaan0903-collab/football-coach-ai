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

    const { mimeType, category, filename, storagePath, playerProfileId = null } = await req.json();

    if (!storagePath || typeof storagePath !== "string" || !storagePath.startsWith(user.id + "/")) {
      return NextResponse.json({ error: "Invalid video path." }, { status: 400 });
    }
    if (playerProfileId !== null) {
      if (typeof playerProfileId !== "string") {
        return NextResponse.json({ error: "Invalid player profile." }, { status: 400 });
      }
      const { data: profile, error: profileError } = await supabase
        .from("player_profiles")
        .select("id")
        .eq("id", playerProfileId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileError || !profile) {
        return NextResponse.json({ error: "That player profile does not belong to your account." }, { status: 403 });
      }
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
    const prompt = `You are an expert football performance analyst. Review this video as a professional, constructive coach. Skill category: ${category}.
Build a detailed coaching dossier, but assess ONLY what is visibly supported by the clip. Do not guess body mechanics hidden by the camera, invent ball speed/angles/distances, or claim measurements that were not provided.
Return valid JSON only, without Markdown fences, using this exact structure:
{
  "overall_score": integer 0-100,
  "summary": "clear 2-4 sentence executive assessment",
  "strengths": ["3-5 specific visible strengths"],
  "improvements": ["3-5 prioritised, actionable improvements"],
  "technique_breakdown": [
    {"dimension":"technical dimension","rating": integer 0-10 or null if not assessable, "evidence":"specific visible evidence or why it cannot be assessed"}
  ],
  "observations": ["4-6 concise observations in the order they occur; include timestamps only when confidently visible/derivable, otherwise do not invent them"],
  "drills": [
    {"name":"drill name","instructions":"clear step-by-step instructions","setup":"equipment and layout, with a simple alternative","sets":"sensible set count","reps":"duration or repetitions with rest","coaching_cues":["cue 1","cue 2"],"progression":"one safe way to make it more challenging later"}
  ],
  "confidence_note":"explain camera angle, clip length, visibility, sampling limits and what could not be assessed",
  "match_highlights":[
    {"timestamp":"timestamp only when confidently visible or derivable","event":"short event label","description":"what happened and why it matters","confidence":"high or medium"}
  ],
  "goalkeeper_review":null,
  "pose_frames":[
    {
      "timestamp":"approximate timestamp or frame label",
      "body_visible":true,
      "keypoints":[
        {"name":"left_shoulder","x":0-100,"y":0-100,"visibility":0-1},
        {"name":"right_shoulder","x":0-100,"y":0-100,"visibility":0-1},
        {"name":"left_elbow","x":0-100,"y":0-100,"visibility":0-1},
        {"name":"right_elbow","x":0-100,"y":0-100,"visibility":0-1},
        {"name":"left_wrist","x":0-100,"y":0-100,"visibility":0-1},
        {"name":"right_wrist","x":0-100,"y":0-100,"visibility":0-1},
        {"name":"left_hip","x":0-100,"y":0-100,"visibility":0-1},
        {"name":"right_hip","x":0-100,"y":0-100,"visibility":0-1},
        {"name":"left_knee","x":0-100,"y":0-100,"visibility":0-1},
        {"name":"right_knee","x":0-100,"y":0-100,"visibility":0-1},
        {"name":"left_ankle","x":0-100,"y":0-100,"visibility":0-1},
        {"name":"right_ankle","x":0-100,"y":0-100,"visibility":0-1}
      ]
    }
  ]
}
For technique_breakdown choose 4-6 relevant dimensions for this skill (for example balance, body positioning, approach, contact/receiving technique, follow-through, decision-making, recovery). Use null ratings when evidence is insufficient; never fill gaps with assumptions. Provide 3 practical drills matched to the observed priorities. Be constructive, precise, age-appropriate and safety-aware. For match_highlights, return up to 6 genuinely notable moments such as a shot, save, interception, key pass, defensive recovery or clear technique moment. Include timestamps only when confidently visible or derivable; never invent exact times. If the clip is a solo drill or no clear event moments exist, return an empty array. For goalkeeping clips only, populate goalkeeper_review as an object with positioning, set_position, footwork, handling, distribution, decision_making, each containing a short evidence-based observation; for other categories use null. For pose_frames, return up to 5 representative moments spread across the clip, only when the player's relevant joints are clearly visible. Coordinates are normalized to the full video frame (x=0 left to 100 right, y=0 top to 100 bottom), not to a cropped body. Include only landmarks you can actually locate; do not invent hidden or occluded joints. If no reliable landmarks can be located, return an empty array. These are approximate visual landmarks, NOT motion-capture or clinical biomechanics measurements. Scores are coaching estimates, not scientific measurements or guarantees.`;

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
            generation_config: { thinking_level: "low", max_output_tokens: 2800 }
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
      player_profile_id: playerProfileId,
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
