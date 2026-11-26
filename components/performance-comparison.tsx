"use client";

import { useMemo, useState } from "react";

type AnalysisItem = {
  id: string;
  original_filename: string;
  skill_category: string;
  score: number | null;
  created_at: string;
  analysis?: any;
};

export default function PerformanceComparison({ items }: { items: AnalysisItem[] }) {
  const ordered = useMemo(() => [...items].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()),[items]);
  const [firstId,setFirstId]=useState("");
  const [secondId,setSecondId]=useState("");
  const first=ordered.find(x=>x.id===(firstId||ordered[0]?.id));
  const second=ordered.find(x=>x.id===(secondId||ordered[ordered.length-1]?.id));
  if(ordered.length<2) return <section className="comparisonPanel"><div><small>PLAYER DEVELOPMENT</small><h3>Session comparison</h3><p>Save at least two video analyses to compare progress between sessions.</p></div></section>;

  const delta=typeof first?.score==="number"&&typeof second?.score==="number"?second.score-first.score:null;
  const strengths=(x:AnalysisItem)=>Array.isArray(x.analysis?.strengths)?x.analysis.strengths.slice(0,3):[];
  const focus=(x:AnalysisItem)=>Array.isArray(x.analysis?.improvements)?x.analysis.improvements.slice(0,3):[];

  return <section className="comparisonPanel">
    <div className="comparisonHead"><div><small>PLAYER DEVELOPMENT</small><h3>Compare your sessions</h3><p>Compare two saved reviews from your own training history.</p></div><span>SESSION vs SESSION</span></div>
    <div className="comparisonSelectors">
      <label>EARLIER SESSION<select value={first?.id||""} onChange={e=>setFirstId(e.target.value)}>{ordered.map(x=><option key={x.id} value={x.id}>{x.original_filename} · {new Date(x.created_at).toLocaleDateString()}</option>)}</select></label>
      <label>COMPARE WITH<select value={second?.id||""} onChange={e=>setSecondId(e.target.value)}>{ordered.map(x=><option key={x.id} value={x.id}>{x.original_filename} · {new Date(x.created_at).toLocaleDateString()}</option>)}</select></label>
    </div>
    {first&&second&&<><div className="comparisonScores"><div><small>{first.skill_category.replaceAll("_"," ")} · SESSION A</small><strong>{first.score??"—"}<i>/100</i></strong></div><div className="comparisonDelta"><small>SCORE DIFFERENCE</small><strong>{delta===null?"—":(delta>0?"+":"")+delta}</strong><span>{delta===null?"Insufficient score data":delta>0?"Higher estimate":delta<0?"Lower estimate":"Same estimate"}</span></div><div><small>{second.skill_category.replaceAll("_"," ")} · SESSION B</small><strong>{second.score??"—"}<i>/100</i></strong></div></div>
    <div className="comparisonInsights"><div><b>Strengths in session B</b>{strengths(second).length?<ul>{strengths(second).map((v:string,i:number)=><li key={i}>{v}</li>)}</ul>:<p>No strengths were recorded.</p>}</div><div><b>Focus areas in session B</b>{focus(second).length?<ul>{focus(second).map((v:string,i:number)=><li key={i}>{v}</li>)}</ul>:<p>No focus areas were recorded.</p>}</div></div>
    <p className="comparisonNote">Scores are AI coaching estimates. A difference does not prove improvement or decline by itself; compare similar drills, camera angles and conditions.</p></>}
  </section>;
}
