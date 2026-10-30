import { UiText } from '../../i18n/UiLanguage.jsx';
// src/components/learner/SubmissionForm.jsx
import React, { useState, useEffect, useRef } from "react";
import AudioRecorder from "../common/AudioRecorder";
import api from "../../api";
import { createSubmissionUpload } from "../../utils/submissionUpload.js";
import "../../styles/challenge.css"; 

export default function SubmissionForm({ learnerId, challengeId, onSubmitted = () => {}, onCancel = () => {} }) {
  const [audioBlob, setAudioBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [preparing, setPreparing] = useState(true);
  const [ready, setReady] = useState(false);
  const uploadRef = useRef(null);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    let active = true;
    const uploader = createSubmissionUpload(api, { learnerId, challengeId });
    uploadRef.current = uploader;
    submitInFlightRef.current = false;
    setSubmitting(false);
    setSubmitError("");
    setSubmitSuccess("");
    setAudioBlob(null);
    setPreparing(true);
    setReady(false);
    uploader.prepare().then(() => {
      if (active) setReady(true);
    }).catch(() => {
      if (active) setSubmitError("Không tải được lượt nộp. Hãy đóng và mở lại biểu mẫu.");
    }).finally(() => { if (active) setPreparing(false); });
    return () => { active = false; if (uploadRef.current === uploader) uploadRef.current = null; };
  }, [learnerId, challengeId]);

  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setPreviewUrl(null);
      };
    } else {
      setPreviewUrl(null);
    }
  }, [audioBlob]);

  async function handleSubmit() {
    if (!ready || submitInFlightRef.current || !uploadRef.current) return;
    const uploader = uploadRef.current;
    setSubmitError("");
    setSubmitSuccess("");

    if (!learnerId || !challengeId || !audioBlob) {
      setSubmitError("Thiếu thông tin hoặc chưa ghi âm.");
      return;
    }

    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      const result = await uploader.submit(audioBlob);
      if (!result || uploadRef.current !== uploader) return;
      setReady(false);
      setSubmitSuccess(result.processingFailed ? "Bài đã được lưu nhưng chưa đưa vào xử lý. Hãy kiểm tra lịch sử; không cần nộp lại." : "✅ Nộp bài thành công! Đang chuyển về trang chi tiết...");
      try { await onSubmitted(result); } catch (error) { console.error("Submission display refresh failed", error); }
    } catch (err) {
      console.error("❌ Submit error", err);
      if (uploadRef.current === uploader) {
        if (err.code === "SUBMISSION_ATTEMPT_CHANGED") setReady(false);
        setSubmitError(err.message || "Có lỗi khi nộp bài. Hãy kiểm tra lịch sử trước khi thử lại.");
      }
    } finally {
      if (uploadRef.current === uploader) { submitInFlightRef.current = false; setSubmitting(false); }
    }
  }

  return (
    <div className="challenge-submission-card">
      <div className="challenge-submission-header">
        <h3 className="submission-title"><UiText text={"Nộp bài nói"} /></h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={`btn-submit ${submitting || !ready || !audioBlob ? "is-disabled" : ""}`}
            onClick={handleSubmit}
            disabled={submitting || !ready || !audioBlob}
          >
            {submitting ? <span className="spinner" /> : <span className="icon-send">➤</span>}{" "}<UiText text={"Nộp bài"} />{" "}</button>
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={submitting}><UiText text={"Hủy"} /></button>
        </div>
      </div>

      <div className="challenge-submission-body">
        {preparing && <p role="status"><UiText text={"Đang tải lượt nộp bài..."} /></p>}
        <AudioRecorder onRecorded={setAudioBlob} isSubmitting={submitting || preparing} />

        {previewUrl && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}><UiText text={"Xem trước bản ghi"} /></div>
            <audio controls src={previewUrl} style={{ width: "100%", borderRadius: 8 }} />
          </div>
        )}

        {(submitError || submitSuccess) && (
          <div className={`status-row ${submitError ? "error" : "success"}`} style={{ marginTop: 12 }}>
            <UiText>{submitError || submitSuccess}</UiText>
          </div>
        )}
      </div>
    </div>
  );
}
