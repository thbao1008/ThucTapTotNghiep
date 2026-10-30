import { UiText } from '../../i18n/UiLanguage.jsx';
import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { createMicrophoneRequest, discardRecorder, microphoneErrorMessage } from "../../utils/microphoneRequest.js";

const AudioRecorder = forwardRef(function AudioRecorder({
  onRecorded,
  isSubmitting = false,
  maxDuration = 120,
  mimeType = "audio/webm",
  accept = "audio/*",
  hideFileUpload = false,
  hideRecordButton = false
}, ref) {
  const mediaStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const mountedRef = useRef(false);
  const microphoneRef = useRef(null);
  if (!microphoneRef.current) microphoneRef.current = createMicrophoneRequest();

  const [isRecording, setIsRecording] = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const [duration, setDuration] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [recordedFile, setRecordedFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardRecorder(recorderRef.current);
      microphoneRef.current.cancel();
      clearTimer();
    };
  }, []);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopTracks() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }

  async function startRecording() {
    if (isSubmitting || microphoneRef.current.busy() || isRecording) return;
    setError(null);
    clearPreview();
    setRequestingMic(true);
    try {
      const stream = await microphoneRef.current.acquire();
      if (!stream || !mountedRef.current || !microphoneRef.current.owns(stream)) return;
      mediaStreamRef.current = stream;
      chunksRef.current = [];

      const options =
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported &&
        MediaRecorder.isTypeSupported(mimeType)
          ? { mimeType }
          : undefined;

      const mr = new MediaRecorder(stream, options);
      recorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (!mountedRef.current || !microphoneRef.current.owns(stream)) return;
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        if (!mountedRef.current || !microphoneRef.current.owns(stream)) return;
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || mimeType });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setRecordedFile(blob);
        onRecorded?.(blob);
        microphoneRef.current.cancel();
        mediaStreamRef.current = null;
      };

      mr.start();
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => {
          if (d + 1 >= maxDuration) {
            stopRecordingInternal();
            return maxDuration;
          }
          return d + 1;
        });
      }, 1000);
    } catch (err) {
      discardRecorder(recorderRef.current);
      microphoneRef.current.cancel();
      if (!mountedRef.current) return;
      console.error("startRecording error", err);
      setError(microphoneErrorMessage(err));
    } finally {
      if (mountedRef.current && !microphoneRef.current.pending()) setRequestingMic(false);
    }
  }

  function stopRecordingInternal() {
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch (e) {}
    setIsRecording(false);
    clearTimer();
    stopTracks();
  }

  function stopRecording() {
    stopRecordingInternal();
  }

  function handleFileInput(e) {
    if (isSubmitting || isRecording || requestingMic) return;
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setDuration(0);
    setRecordedFile(f);
    onRecorded?.(f);
  }

  function clearPreview() {
    if (isSubmitting || isRecording) return;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setDuration(0);
    setRecordedFile(null);
    onRecorded?.(null);
    setFileInputKey((k) => k + 1);
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording: stopRecordingInternal
  }));

  return (
    <div className="audio-recorder">
      {!hideRecordButton && (
        <div className="flex items-center gap-3">
          {!isRecording ? (
            <button
              type="button"
              className="px-3 py-1 bg-red-600 text-white rounded"
              onClick={startRecording}
              disabled={isSubmitting || requestingMic}
            >
              <UiText>{requestingMic ? "Đang chờ quyền microphone..." : "Ghi âm"}</UiText>
            </button>
          ) : (
            <button
              type="button"
              className="px-3 py-1 bg-gray-700 text-white rounded"
              onClick={stopRecording}
            >{" "}<UiText text={"Dừng"} />{" "}</button>
          )}

          <div className="text-sm text-gray-700">
            {isRecording ? (
              <span><UiText text={"Đang ghi…"} />{" "}<strong><UiText>{formatTime(duration)}</UiText></strong></span>
            ) : (
              <span><UiText text={"Thời lượng:"} />{" "}<strong><UiText>{formatTime(duration)}</UiText></strong></span>
            )}
          </div>

          {!hideFileUpload && (
            <div>
              <label className="text-sm mr-2"><UiText text={"Hoặc upload"} /></label>
              <input
                key={fileInputKey}
                type="file"
                accept={accept}
                onChange={handleFileInput}
                disabled={isSubmitting || isRecording || requestingMic}
                className="text-sm"
              />
            </div>
          )}
        </div>
      )}

      {error && <div className="mt-2 text-sm text-red-600"><UiText>{error}</UiText></div>}
      {requestingMic && <button type="button" onClick={() => { microphoneRef.current.cancel(); setRequestingMic(false); }}><UiText text={"Hủy yêu cầu microphone"} /></button>}

      {previewUrl && (
        <div className="mt-3">
          <audio controls src={previewUrl} className="w-full" />
          <div className="mt-2">
            <button type="button" className="text-sm border px-2 py-1 rounded" onClick={clearPreview} disabled={isSubmitting || isRecording || requestingMic}><UiText text={"Xóa"} /></button>
          </div>
        </div>
      )}
    </div>
  );
});

export default AudioRecorder;
