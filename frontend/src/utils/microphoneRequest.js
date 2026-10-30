const stopStream = stream => stream?.getTracks().forEach(track => track.stop());

// getUserMedia cannot be aborted: cancel our request and close any late stream.
export function createMicrophoneRequest({
  getUserMedia = () => navigator.mediaDevices.getUserMedia({ audio: true }),
  timeoutMs = 15000,
  schedule = setTimeout,
  unschedule = clearTimeout
} = {}) {
  let pending = null;
  let ownedStream = null;
  return {
    busy: () => pending !== null || ownedStream !== null,
    pending: () => pending !== null,
    owns: stream => ownedStream === stream,
    acquire() {
      if (pending || ownedStream) return Promise.resolve(null);
      const request = {};
      pending = request;
      return new Promise((resolve, reject) => {
        const settle = (stream, error) => {
          if (pending !== request) { stopStream(stream); return; }
          pending = null;
          unschedule(request.timer);
          if (stream) ownedStream = stream;
          if (error) reject(error); else resolve(stream);
        };
        request.cancel = () => settle(null);
        request.timer = schedule(() => settle(null, Object.assign(new Error("Microphone permission timed out"), { name: "MicrophoneTimeoutError" })), timeoutMs);
        Promise.resolve().then(() => pending === request ? getUserMedia() : null).then(
          stream => settle(stream), error => settle(null, error)
        );
      });
    },
    cancel() {
      pending?.cancel();
      stopStream(ownedStream);
      ownedStream = null;
    }
  };
}

export function discardRecorder(recorder) {
  if (!recorder) return;
  recorder.ondataavailable = null;
  recorder.onstop = null;
  recorder.onerror = null;
  if (recorder.state !== "inactive") {
    try { recorder.stop(); } catch { /* Already stopped or unavailable. */ }
  }
}

export function microphoneErrorMessage(error) {
  if (error?.name === "MicrophoneTimeoutError") return "Chưa nhận được quyền microphone. Hãy kiểm tra quyền rồi thử lại.";
  if (["NotAllowedError", "SecurityError"].includes(error?.name)) return "Quyền microphone bị từ chối. Hãy cấp quyền cho trang rồi thử lại.";
  if (error?.name === "NotFoundError") return "Không tìm thấy microphone. Hãy kết nối thiết bị rồi thử lại.";
  return "Không thể mở microphone. Hãy kiểm tra thiết bị và quyền truy cập.";
}
