"use client";

import { useState } from "react";

type Scenario = {
  title: string;
  situation: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  principle: string;
};

export default function SmartTrainingSimulator() {
  const [focus, setFocus] = useState("Attacking");
  const [level, setLevel] = useState("Beginner");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [answer, setAnswer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    setScenario(null);
    setAnswer(null);
    try {
      const response = await fetch("/api/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus, level }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create a scenario.");
      setScenario(data.scenario);
    } catch (e: any) {
      setError(e.message || "The simulator is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="simulatorPanel">
      <div className="simulatorHead">
        <div><small>GEMINI DECISION LAB</small><h2>Smart Training Simulator</h2><p>Practice reading the game through interactive situations.</p></div>
        <span>AI SCENARIO</span>
      </div>
      <div className="simulatorControls">
        <label>FOCUS<select value={focus} onChange={e=>setFocus(e.target.value)}><option>Attacking</option><option>Defending</option><option>Midfield</option><option>Goalkeeping</option></select></label>
        <label>LEVEL<select value={level} onChange={e=>setLevel(e.target.value)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
        <button className="primary" onClick={generate} disabled={busy}>{busy?"Building scenario…":"Generate scenario"}</button>
      </div>
      {error&&<p className="error">{error}</p>}
      {scenario&&<div className="scenarioCard">
        <small>GAME SITUATION</small><h3>{scenario.title}</h3><p>{scenario.situation}</p>
        <b>{scenario.question}</b>
        <div className="scenarioOptions">{scenario.options.map((option,index)=>{
          const correct=answer!==null&&index===scenario.correct_index;
          const chosen=answer===index;
          return <button key={index} className={answer===null?"":correct?"correct":chosen?"incorrect":""} disabled={answer!==null} onClick={()=>setAnswer(index)}><span>{String.fromCharCode(65+index)}</span>{option}</button>;
        })}</div>
        {answer!==null&&<div className="scenarioFeedback"><b>{answer===scenario.correct_index?"Good decision.":"Review the situation."}</b><p>{scenario.explanation}</p><small>COACHING PRINCIPLE · {scenario.principle}</small></div>}
      </div>}
      {!scenario&&!busy&&!error&&<div className="simulatorEmpty">Generate a scenario to practise your football decision-making.</div>}
      <p className="simulatorFoot">Training exercise only. Real match decisions depend on teammates, opponents, space and coaching instructions.</p>
    </section>
  );
}
