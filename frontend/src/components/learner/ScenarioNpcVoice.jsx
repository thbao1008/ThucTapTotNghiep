import { UiText } from '../../i18n/UiLanguage.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { createScenarioNpcSpeech } from '../../utils/scenarioNpcVoice.js';

// text must be the current NPC's English line, never the learner's reply or
// Vietnamese translation. Playback only starts from the button's user click.
export default function ScenarioNpcVoice({ text, speakerId, disabled = false, onPlaybackEvent }) {
  const player = useRef(null);
  const observer = useRef(onPlaybackEvent);observer.current=onPlaybackEvent;
  const [state,setState] = useState({status:'idle',message:''});
  const [supported,setSupported] = useState(false);
  useEffect(() => {
    let mounted = true;
    const controller = createScenarioNpcSpeech({
      synthesis: window.speechSynthesis,
      Utterance: window.SpeechSynthesisUtterance,
      onEvent: value => observer.current?.(value),
      onState: value => { if (mounted) setState(value); }
    });
    player.current = controller; setSupported(controller.supported);
    return () => { mounted = false; controller.dispose(); if (player.current === controller) player.current = null; };
  }, []);
  useEffect(() => { player.current?.stop(); }, [text,speakerId,disabled]);
  const playing = ['loading','starting','playing'].includes(state.status);
  const valid = typeof text === 'string' && text.trim().length > 0 && Boolean(speakerId);
  return <div className="world-npc-voice">
    <button type="button" disabled={disabled || !supported || !valid} aria-pressed={playing}
      onClick={() => playing ? player.current?.stop() : player.current?.play(text,speakerId)}>
      <UiText>{playing ? 'Dừng giọng đọc' : 'Nghe lời thoại'}</UiText>
    </button>
    <small role="status" style={{display:'block',marginTop:4,lineHeight:1.4}}>
      <UiText>{!supported ? 'Trình duyệt này chưa hỗ trợ đọc lời thoại.' : state.message || (playing ? 'Đang đọc lời thoại tiếng Anh.' : 'Giọng tiếng Anh cài trên máy · bấm để nghe.')}</UiText>
    </small>
  </div>;
}
