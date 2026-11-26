"use client";

import { useMemo, useState } from "react";

type Keypoint = { name: string; x: number; y: number; visibility?: number };
type PoseFrame = { timestamp?: string; body_visible?: boolean; keypoints?: Keypoint[] };

const EDGES: [string, string][] = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
  ["left_ankle", "left_heel"], ["right_ankle", "right_heel"],
];

const LABELS: Record<string, string> = {
  nose: "Nose", left_shoulder: "L shoulder", right_shoulder: "R shoulder",
  left_elbow: "L elbow", right_elbow: "R elbow", left_wrist: "L wrist",
  right_wrist: "R wrist", left_hip: "L hip", right_hip: "R hip",
  left_knee: "L knee", right_knee: "R knee", left_ankle: "L ankle",
  right_ankle: "R ankle",
};

export default function PoseAnalysis({ frames }: { frames?: PoseFrame[] }) {
  const validFrames = useMemo(
    () => (Array.isArray(frames) ? frames.filter((f) => f?.body_visible && Array.isArray(f.keypoints) && f.keypoints.length >= 6) : []),
    [frames]
  );
  const [active, setActive] = useState(0);

  if (!validFrames.length) {
    return (
      <section className="posePanel">
        <div className="poseHeading">
          <div><small>JOINT POSITION ANALYSIS</small><h3>Body keypoints unavailable</h3></div>
          <span className="poseStatus muted">NOT ESTIMATED</span>
        </div>
        <p className="poseEmpty">The video did not provide enough clear body visibility for a reliable joint-position estimate. Try a short clip with the player's full body visible and the camera held steady.</p>
      </section>
    );
  }

  const frame = validFrames[Math.min(active, validFrames.length - 1)];
  const points = new Map(frame.keypoints!.map((p) => [p.name, p]));
  const visible = (name: string) => {
    const p = points.get(name);
    return p && (p.visibility === undefined || p.visibility >= 0.45) ? p : undefined;
  };
  const clamp = (n: number) => Math.max(2, Math.min(98, n));
  const edges = EDGES.filter(([a, b]) => visible(a) && visible(b));

  return (
    <section className="posePanel">
      <div className="poseHeading">
        <div><small>JOINT POSITION ANALYSIS</small><h3>Estimated body keypoints</h3></div>
        <span className="poseStatus">AI ESTIMATE</span>
      </div>
      <div className="poseContent">
        <div className="poseFigureWrap">
          <svg viewBox="0 0 100 100" role="img" aria-label="Estimated player body joint positions">
            <defs><pattern id="poseGrid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="#293b30" strokeWidth=".35"/></pattern></defs>
            <rect width="100" height="100" fill="url(#poseGrid)"/>
            {edges.map(([a,b]) => {
              const p1 = visible(a)!; const p2 = visible(b)!;
              return <line key={a+"-"+b} x1={clamp(p1.x)} y1={clamp(p1.y)} x2={clamp(p2.x)} y2={clamp(p2.y)} className="poseBone"/>;
            })}
            {frame.keypoints!.filter(p => p.visibility === undefined || p.visibility >= .45).map(p => (
              <g key={p.name}>
                <circle cx={clamp(p.x)} cy={clamp(p.y)} r="2.1" className="poseJoint"/>
                <circle cx={clamp(p.x)} cy={clamp(p.y)} r=".8" fill="#f8fff4"/>
              </g>
            ))}
          </svg>
          <span className="poseTimestamp">{frame.timestamp || "Representative frame"}</span>
        </div>
        <div className="poseKeypoints">
          <b>Detected joints</b>
          {frame.keypoints!.filter(p => p.visibility === undefined || p.visibility >= .45).map(p => (
            <div key={p.name}><span>{LABELS[p.name] || p.name.replaceAll("_", " ")}</span><strong>{Math.round(p.x)}, {Math.round(p.y)}</strong></div>
          ))}
        </div>
      </div>
      {validFrames.length > 1 && <div className="poseFramePicker">{validFrames.map((f,i)=><button key={i} className={active===i?"selected":""} onClick={()=>setActive(i)}>{f.timestamp || "Frame "+(i+1)}</button>)}</div>}
      <p className="poseDisclaimer">Joint coordinates are approximate AI estimates from visible footage, not motion-capture measurements or medical assessments. Occluded joints are omitted rather than guessed.</p>
    </section>
  );
}
