"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onTranscript: (text: string) => void;
  lastReply?: string;
  disabled?: boolean;
};

export default function VoiceCoachControls({ onTranscript, lastReply = "", disabled = false }: Props) {
  const recognition = useRef<any>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const browser = window as any;
    const SpeechRecognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const instance = new SpeechRecognition();
    instance.lang = "en-IN";
    instance.interimResults = false;
    instance.maxAlternatives = 1;
    instance.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (typeof transcript === "string" && transcript.trim()) onTranscript(transcript.trim());
    };
    instance.onerror = () => setListening(false);
    instance.onend = () => setListening(false);
    recognition.current = instance;
    setSupported(true);

    return () => {
      try { instance.stop(); } catch {}
      if (browser.speechSynthesis) browser.speechSynthesis.cancel();
    };
  }, [onTranscript]);

  function toggleListening() {
    if (!recognition.current || disabled) return;
    if (listening) {
      recognition.current.stop();
      setListening(false);
      return;
    }
    try {
      recognition.current.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  function toggleSpeech() {
    const synth = window.speechSynthesis;
    if (!synth || !lastReply.trim()) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(lastReply);
    utterance.lang = "en-IN";
    utterance.rate = 0.96;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.speak(utterance);
    setSpeaking(true);
  }

  return (
    <div className="voiceControls" aria-label="Voice coaching controls">
      {supported ? (
        <button type="button" className={listening ? "voiceButton active" : "voiceButton"} onClick={toggleListening} disabled={disabled} aria-pressed={listening}>
          <span className="voiceDot" /> {listening ? "Listening… tap to stop" : "Ask by voice"}
        </button>
      ) : (
        <span className="voiceUnavailable">Voice input is not supported in this browser.</span>
      )}
      <button type="button" className="voiceButton" onClick={toggleSpeech} disabled={!lastReply.trim()} aria-pressed={speaking}>
        {speaking ? "Stop speaking" : "Listen to coach"}
      </button>
      <span className="voicePrivacy">Microphone starts only when you tap Ask by voice.</span>
    </div>
  );
}
