"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Player = {
  id: string;
  nickname: string | null;
  position: string | null;
  dominant_foot: string | null;
  experience_level: string;
  created_at: string;
};
type Analysis = { id: string; player_profile_id?: string | null; score: number | null; skill_category: string };

export default function AcademyIntelligence({
  analyses,
  activePlayerId,
  onSelect,
  onProfilesChange,
}: {
  analyses: Analysis[];
  activePlayerId: string;
  onSelect: (id: string) => void;
  onProfilesChange: (players: Player[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("not_set");
  const [foot, setFoot] = useState("not_set");
  const [level, setLevel] = useState("beginner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("player_profiles")
      .select("id,nickname,position,dominant_foot,experience_level,created_at")
      .order("created_at", { ascending: true });
    if (error) {
      setError("Could not load academy profiles. Check your connection and account permissions.");
      return;
    }
    const rows = (data || []) as Player[];
    setPlayers(rows);
    onProfilesChange(rows);
    if (!activePlayerId && rows[0]) onSelect(rows[0].id);
  }

  useEffect(() => { loadPlayers(); }, [supabase]);

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in to manage your academy profiles.");
      const { data, error } = await supabase.from("player_profiles").insert({
        user_id: user.id,
        nickname: name.trim().slice(0, 60),
        position,
        dominant_foot: foot,
        experience_level: level,
      }).select("id,nickname,position,dominant_foot,experience_level,created_at").single();
      if (error) throw error;
      const next = [...players, data as Player];
      setPlayers(next); onProfilesChange(next); onSelect(data.id);
      setName(""); setNotice("Player profile added. New analyses can now be assigned to this profile.");
    } catch (e: any) {
      setError(e.message || "Could not create this player profile.");
    } finally { setBusy(false); }
  }

  const totalReviews = analyses.filter(a => a.player_profile_id).length;
  const unassigned = analyses.filter(a => !a.player_profile_id).length;

  return (
    <div className="academyWorkspace">
      <div className="academyHero">
        <div><small>ACADEMY INTELLIGENCE</small><h2>Player roster & development</h2><p>Manage player profiles under your account and review their linked training analyses.</p></div>
        <span>{players.length} PLAYER{players.length===1?"":"S"}</span>
      </div>
      <div className="academyStats">
        <div><small>ROSTER</small><b>{players.length}</b></div>
        <div><small>ASSIGNED REVIEWS</small><b>{totalReviews}</b></div>
        <div><small>UNASSIGNED REVIEWS</small><b>{unassigned}</b></div>
      </div>
      <div className="academyGrid">
        <form className="academyAdd" onSubmit={addPlayer}>
          <h3>Add player profile</h3>
          <label>PLAYER NAME<input value={name} onChange={e=>setName(e.target.value)} placeholder="Enter player name" maxLength={60}/></label>
          <div className="academyFormGrid">
            <label>POSITION<select value={position} onChange={e=>setPosition(e.target.value)}><option value="not_set">Not set</option><option value="goalkeeper">Goalkeeper</option><option value="defender">Defender</option><option value="midfielder">Midfielder</option><option value="forward">Forward</option></select></label>
            <label>DOMINANT FOOT<select value={foot} onChange={e=>setFoot(e.target.value)}><option value="not_set">Not set</option><option value="left">Left</option><option value="right">Right</option><option value="both">Both</option></select></label>
          </div>
          <label>EXPERIENCE LEVEL<select value={level} onChange={e=>setLevel(e.target.value)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
          <button className="primary full" disabled={busy||!name.trim()}>{busy?"Adding player…":"Add to roster"}</button>
        </form>
        <div className="academyRoster">
          <h3>Roster overview</h3>
          {!players.length&&<p className="academyEmpty">No player profiles yet. Add your first player to start organising analyses.</p>}
          {players.map(player=>{
            const reviews=analyses.filter(a=>a.player_profile_id===player.id);
            const scores=reviews.filter(a=>typeof a.score==="number").map(a=>a.score as number);
            const average=scores.length?Math.round(scores.reduce((sum,n)=>sum+n,0)/scores.length):null;
            return <button type="button" key={player.id} className={activePlayerId===player.id?"academyPlayer selected":"academyPlayer"} onClick={()=>onSelect(player.id)}>
              <span className="academyAvatar">{(player.nickname||"P").slice(0,1).toUpperCase()}</span>
              <span className="academyPlayerInfo"><b>{player.nickname||"Unnamed player"}</b><small>{player.position?.replace("_"," ")||"Position not set"} · {player.experience_level}</small><small>{reviews.length} linked reviews</small></span>
              <strong>{average===null?"—":average}<i>{average===null?"":" /100"}</i></strong>
            </button>;
          })}
          {players.length>0&&<p className="academyHint">Select a player to assign the next video analysis to that profile.</p>}
        </div>
      </div>
      {error&&<p className="error">{error}</p>}
      {notice&&<p className="academyNotice">{notice}</p>}
      <p className="academyPrivacy">Profiles and linked reports remain private to the signed-in account under the existing Supabase row-level security policies. This is a single-account roster workspace, not shared multi-coach academy access.</p>
    </div>
  );
}
