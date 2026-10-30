import { UiText } from '../../i18n/UiLanguage.jsx';
// src/components/common/AudioPlayer.jsx
import React, { useState, useRef, useEffect } from "react";
import { FiPlay, FiPause } from "react-icons/fi";
import { normalizeAudioUrl } from "../../utils/apiHelpers";
import { useAuthenticatedMedia } from "../../utils/authenticatedMedia";
import "../../styles/audio-player.css";

export default function AudioPlayer({ src, duration = null }) {
  // Normalize audio URL to ensure it works with proxy
  const normalizedSrc = src ? normalizeAudioUrl(src) : null;
  const { mediaUrl: authenticatedSrc, revoke, reload, shouldAutoplay } = useAuthenticatedMedia(normalizedSrc);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const audioRef = useRef(null);
  const [waveformData, setWaveformData] = useState([]);

  useEffect(() => {
    let cleanup;
    if (audioRef.current && authenticatedSrc) {
      const audio = audioRef.current;
      const onLoadedMetadata = () => {
        setAudioDuration(audio.duration || duration || 0);
      };
      const onTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
      };
      const onEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        revoke();
      };
      const onError = () => {
        setIsPlaying(false);
        revoke();
      };
      audio.addEventListener("loadedmetadata", onLoadedMetadata);
      audio.addEventListener("timeupdate", onTimeUpdate);
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onError);
      audio.src = authenticatedSrc;
      if (shouldAutoplay) {
        audio.play()
          .then(() => setIsPlaying(true))
          .catch(error => {
            console.error("Unable to start authorized audio playback:", error.message);
            setIsPlaying(false);
            revoke();
          });
      }
      cleanup = () => {
        audio.removeEventListener("loadedmetadata", onLoadedMetadata);
        audio.removeEventListener("timeupdate", onTimeUpdate);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
      };
    }

    // Generate random waveform data if not provided
    if (waveformData.length === 0) {
      const bars = Array.from({ length: 50 }, () => Math.random() * 60 + 20);
      setWaveformData(bars);
    }
    return cleanup;
  }, [authenticatedSrc, duration, revoke, shouldAutoplay]);

  function togglePlay() {
    if (audioRef.current) {
      if (!authenticatedSrc && normalizedSrc) {
        reload({ autoplay: true });
        return;
      }
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  return (
    <div className="audio-player-custom">
      <audio ref={audioRef} src={authenticatedSrc || undefined} style={{ display: "none" }} />
      <button className="audio-play-btn" onClick={togglePlay}>
        {isPlaying ? <FiPause size={16} /> : <FiPlay size={16} />}
      </button>
      <div className="audio-separator"></div>
      <div className="audio-waveform-container">
        <div className="audio-waveform-bars">
          {waveformData.map((height, i) => (
            <div
              key={i}
              className={`waveform-bar-item ${isPlaying ? "playing" : ""}`}
              style={{
                height: `${height}%`,
                animationDelay: `${i * 0.05}s`
              }}
            />
          ))}
        </div>
      </div>
      <div className="audio-duration-text">
        <UiText>{formatTime(audioDuration || currentTime)}</UiText>
      </div>
    </div>
  );
}
