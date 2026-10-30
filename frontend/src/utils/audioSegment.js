// React clears DOM refs before passive-effect cleanup. Pause the old node at
// detach time too, including playback started through native media controls.
export function setOwnedAudioNode(ref, node) {
  if (ref.current && ref.current !== node) ref.current.pause();
  ref.current = node;
}

// Return a cancellation function so a new selection or unmount stops the old clip.
export function playAudioSegment(player, start, end, onError = () => {}) {
  if (!Number.isFinite(end)) {
    onError('Đoạn audio không hợp lệ.'); return () => {};
  }
  return playAudioRange(player, start, end, onError);
}

// Challenge review intentionally plays from a selected word to the recording's end.
export function playAudioFrom(player, start, onError = () => {}) {
  return playAudioRange(player, start, null, onError);
}

function playAudioRange(player, start, end, onError) {
  if (!player || !Number.isFinite(start) || start < 0 || (end !== null && end <= start)) {
    onError("Đoạn audio không hợp lệ.");
    return () => {};
  }
  let timer;
  let active = true;
  const cleanup = () => {
    active = false;
    clearTimeout(timer);
    player.removeEventListener("loadedmetadata", begin);
    player.removeEventListener("timeupdate", checkEnd);
    player.removeEventListener("ended", cleanup);
    player.removeEventListener("error", fail);
    player.removeEventListener("emptied", cleanup);
    player.removeEventListener("playing", scheduleStop);
    player.removeEventListener("ratechange", scheduleStop);
    player.removeEventListener("seeked", scheduleStop);
    player.removeEventListener("waiting", clearStopTimer);
    player.removeEventListener("pause", clearStopTimer);
    player.pause();
  };
  const fail = () => {
    if (!active) return;
    cleanup();
    onError("Không thể phát đoạn audio. Vui lòng thử lại sau khi audio tải xong.");
  };
  const checkEnd = () => {
    if (end !== null && player.currentTime >= end) cleanup();
  };
  function clearStopTimer() {
    clearTimeout(timer);
  }
  function scheduleStop() {
    clearStopTimer();
    if (!active || player.paused || end === null) return;
    const remaining = (end - player.currentTime) / (player.playbackRate || 1);
    timer = setTimeout(() => {
      if (!active) return;
      if (player.currentTime >= end - 0.01) cleanup();
      else scheduleStop();
    }, Math.max(5, remaining * 1000));
  }
  function begin() {
    if (!active) return;
    clearTimeout(timer);
    try {
      player.currentTime = start;
      Promise.resolve(player.play()).then(() => {
        if (active) scheduleStop();
      }).catch(fail);
    } catch {
      fail();
    }
  }
  player.pause();
  player.addEventListener("timeupdate", checkEnd);
  player.addEventListener("ended", cleanup);
  player.addEventListener("error", fail);
  player.addEventListener("emptied", cleanup);
  player.addEventListener("playing", scheduleStop);
  player.addEventListener("ratechange", scheduleStop);
  player.addEventListener("seeked", scheduleStop);
  player.addEventListener("waiting", clearStopTimer);
  player.addEventListener("pause", clearStopTimer);
  if (player.readyState >= 1) begin();
  else if (player.getAttribute("src")) {
    player.addEventListener("loadedmetadata", begin, { once: true });
    timer = setTimeout(fail, 10_000);
  } else fail();
  return cleanup;
}
