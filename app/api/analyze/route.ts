import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export const maxDuration = 60;
export async function POST(req: Request) {
 try {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in before analysing a video." }, { status: 401 });
  const { mimeType, category, filename, storagePath } = await req.json();
  if (!storagePath || typeof storagePath !== "string" || !storagePath.startsWith(user.id + "/")) return NextResponse.json({ error: "Invalid video path." }, { status: 400 });
  if (!["video/mp4","video/quicktime","video/webm"].includes(mimeType)) return NextResponse.json({ error: "Upload an MP4, MOV or WebM video." }, { status: 400 });
  if (!["shooting","defending","goalkeeping","passing","dribbling","first_touch","match_analysis","other"].includes(category)) return NextResponse.json({ error: "Choose a valid skill category." }, { status: 400 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI features are not configured yet. Add GEMINI_API_KEY to the Vercel project environment variables." }, { status: 503 });
  const { data: signed, error: signedError } = await supabase.storage.from("football-videos").createSignedUrl(storagePath, 60);
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: "Could not securely access your uploaded video." }, { status: 400 });
  const videoResponse = await fetch(signed.signedUrl);
  if (!videoResponse.ok) return NextResponse.json({ error: "Could not download the uploaded video for analysis." }, { status: 400 });
  const videoBytes = await videoResponse.arrayBuffer();
  if (videoBytes.byteLength > 15 * 1024 * 1024) return NextResponse.json({ error: "Choose a video under 15 MB for this first release." }, { status: 413 });
  const videoBase64 = Buffer.from(videoBytes).toString("base64");
  const prompt = `Analyse this football training video as a professional, constructive coach. Skill category: ${category}. Return valid JSON only with keys: overall_score (0-100 integer), summary (string), strengths (array of strings), improvements (array of strings), drills (array of objects with name, instructions, sets, reps), observations (array of strings), confidence_note (string). Be honest about camera angle, clip length and what cannot be assessed. Do not invent measurements or claim certainty where the footage does not support it. Give age-appropriate, safe practice guidance.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
   method:"POST", headers:{"Content-Type":"application/json"},
   body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt},{inline_data:{mime_type:mimeType,data:videoBase64}}]}],generationConfig:{temperature:0.2,responseMimeType:"application/json",maxOutputTokens:1800}})
  });
  const data = await response.json();
  if (!response.ok) return NextResponse.json({error:data.error?.message || "Video analysis failed."},{status:502});
  const raw = data.candidates?.[0]?.content?.parts?.map((p:{text?:string})=>p.text||"").join("");
  let analysis:any;
  try { analysis = JSON.parse(raw); } catch { return NextResponse.json({error:"The AI response could not be read. Try a shorter, clearer clip."},{status:502}); }
  const {data:saved,error} = await supabase.from("video_analyses").insert({user_id:user.id,storage_path:storagePath,original_filename:filename,mime_type:mimeType,file_size_bytes:videoBytes.byteLength,skill_category:category,status:"completed",score:analysis.overall_score,analysis}).select().single();
  if(error) return NextResponse.json({error:"Analysis completed but could not be saved: "+error.message,analysis},{status:500});
  return NextResponse.json({analysis,id:saved.id});
 } catch { return NextResponse.json({error:"Something went wrong while analysing the video."},{status:500}); }
}
