import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
// src/components/mentor/AssessmentModal.jsx
import React, { useCallback, useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import api from "../../api";
import { getAuth } from "../../utils/auth";
import { FiCpu } from "react-icons/fi";
import "../../styles/challenge.css";
import { normalizeAudioUrl } from "../../utils/apiHelpers.js";
import { AuthenticatedMedia } from "../../utils/authenticatedMedia.jsx";
import { getSubmissionAiFeedback } from "../../utils/submissionAiFeedback.js";
import { playAudioFrom, setOwnedAudioNode } from "../../utils/audioSegment.js";
import { loadMentorSubmission, resolveMentorId } from "../../utils/mentorSubmission.js";

export default function AssessmentModal({ submissionId, onClose }) {
  const auth = getAuth();
  const userId = auth?.user?._id || auth?.user?.id || auth?.user?.user_id;
  const [mentorId, setMentorId] = useState(null);
  const [resolvingMentor, setResolvingMentor] = useState(true);
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const aiFeedback = getSubmissionAiFeedback(submission);

  const [finalScore, setFinalScore] = useState(null);

  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [showConversation, setShowConversation] = useState(true);

  const audioRef = useRef(null);
  const supportAudioRef = useRef(null);
  const setAudioNode = useCallback(node => setOwnedAudioNode(audioRef, node), []);
  const setSupportAudioNode = useCallback(node => setOwnedAudioNode(supportAudioRef, node), []);
  const cardRef = useRef(null);
  const stopPlaybackRef = useRef(() => {});
  const scrollTimerRef = useRef(null);
  const mentorRequestRef = useRef(null);
  const submissionRequestRef = useRef(null);
  const [audioError, setAudioError] = useState("");

  function stopPlayback() {
    stopPlaybackRef.current();
    stopPlaybackRef.current = () => {};
    clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = null;
    audioRef.current?.pause();
    supportAudioRef.current?.pause();
  }

  function closeModal() {
    mentorRequestRef.current?.abort();
    submissionRequestRef.current?.abort();
    stopPlayback();
    onClose?.();
  }

  function normalizeSubmission(submission) {
    const sub = { ...submission };
    if (typeof sub.transcript === "string") { try { sub.transcript = JSON.parse(sub.transcript); } catch (_) {} }
    if (typeof sub.segments === "string") { try { sub.segments = JSON.parse(sub.segments); } catch (_) {} }
    if (typeof sub.words === "string") { try { sub.words = JSON.parse(sub.words); } catch (_) {} }
    if (typeof sub.word_analysis === "string") { try { sub.word_analysis = JSON.parse(sub.word_analysis); } catch (_) {} }
    return sub;
  }

  function playSegment(start, end, idx) {
    const player = audioRef.current;
    stopPlayback();
    setAudioError("");
    // Mentor review keeps its existing play-to-end behavior. The shared helper
    // bounds media readiness and owns all listeners/timers until cancellation.
    stopPlaybackRef.current = playAudioFrom(player, start, setAudioError);
    
    // Tìm và scroll đến từ được click
    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;
      const el = cardRef.current?.querySelector(`[data-token-idx="${idx}"]`);
      if (el) {
        el.focus();
        // Tìm container có scroll (transcript-scroll hoặc conversation)
        let scrollContainer = el.closest('.transcript-scroll') || 
                             el.closest('.conversation') ||
                             el.closest('.submission-body') ||
                             el.closest('.section') ||
                             el.closest('[style*="overflow"]');
        
        if (scrollContainer) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = el.getBoundingClientRect();
          const scrollTop = scrollContainer.scrollTop;
          const scrollLeft = scrollContainer.scrollLeft;
          
          // Tính toán vị trí scroll để element ở giữa container
          const scrollY = scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2) + (elementRect.height / 2);
          const scrollX = scrollLeft + (elementRect.left - containerRect.left) - (containerRect.width / 2) + (elementRect.width / 2);
          
          scrollContainer.scrollTo({
            top: Math.max(0, scrollY),
            left: Math.max(0, scrollX),
            behavior: 'smooth'
          });
        } else {
          // Fallback: scroll element vào view
          el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        }
      }
    }, 50);
  }

  function isBadToken(w) {
    const lowScore = typeof w?.score === "number" && w.score < 0.6;
    return Boolean(
      w?.flags?.mismatch ||
      (Array.isArray(w?.flags?.grammar) && w.flags.grammar.length > 0) ||
      (Array.isArray(w?.flags?.word_choice) && w.flags.word_choice.length > 0) ||
      w?.correct === false ||
      lowScore
    );
  }

  function tokenClass(w) {
    const bad = isBadToken(w);
    const isNonEnglish = w?.lang && w.lang !== "en";
    return `token ${bad ? "token-bad" : "token-ok"} ${isNonEnglish ? "token-nonenglish" : ""}`;
  }

  function buildTooltipForToken(t) {
    const msgs = [];
    if (t.expected && (t.flags?.mismatch || t.correct === false)) msgs.push(`Mẫu: ${t.expected}`);
    if (Array.isArray(t.flags?.word_choice) && t.flags.word_choice.length) msgs.push(`Gợi ý: ${t.flags.word_choice.join(", ")}`);
    if (Array.isArray(t.flags?.grammar) && t.flags.grammar.length) msgs.push(`Ngữ pháp: ${t.flags.grammar.join(" | ")}`);
    if (t.lang && t.lang !== "en" && t.lang !== "nonlatin") msgs.push(`Ngôn ngữ: ${t.lang}`);
    if (t.lang === "nonlatin") msgs.push(`Ngôn ngữ: non-latin`);
    if (typeof t.score === "number") msgs.push(`Score: ${t.score.toFixed(2)}`);
    return msgs.join("\n");
  }

  function renderSegmentedTranscript(submission) {
    const segments = submission?.segments ?? [];
    let audioUrl = submission?.audio_url ?? submission?.audioUrl ?? null;
    if (!audioUrl || !Array.isArray(segments) || segments.length === 0) return null;
    
    // Normalize audio URL to ensure it goes through Vite proxy
    audioUrl = normalizeAudioUrl(audioUrl);

    return (
      <div className="transcript-scroll">
        {segments.map((seg, i) => {
          const start = typeof seg.start === "number" ? seg.start : 0;
          const end = typeof seg.end === "number" ? seg.end : start;
          const segWords = Array.isArray(seg.segment_words) && seg.segment_words.length ? seg.segment_words : [];
          const fallbackWords = !segWords.length && typeof seg.text === "string"
            ? seg.text.split(/\s+/).map((w) => ({ word: w, start, end }))
            : [];
          const wordsToRender = segWords.length ? segWords : fallbackWords;
          const nonEnglishCount = wordsToRender.filter(w => w.lang && w.lang !== "en").length;
          const segmentClass = nonEnglishCount > 0 ? "segment-block segment-nonenglish" : "segment-block";

          return (
            <div key={i} className={segmentClass}>
              <div className="segment-text">
                {wordsToRender.map((w, j) => {
                  const title = buildTooltipForToken(w);
                  const cls = tokenClass(w);
                  
                  // Ưu tiên dùng start/end của từ, nếu không có thì dùng của segment
                  // Nếu từ không có start/end riêng, phát cả segment chứa từ đó
                  const playStart = typeof w.start === "number" ? w.start : start;
                  const playEnd = typeof w.end === "number" ? w.end : end;
                  
                  return (
                    <button
                      key={`${i}-${j}`}
                      type="button"
                      className={cls}
                      data-token-idx={`${i}-${j}`}
                      title={title}
                      onClick={() => playSegment(playStart, playEnd, `${i}-${j}`)}
                      style={{ textTransform: "lowercase" }}
                    >
                      {String(w.word ?? "").toLowerCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderConversationOnly(rawSubmission) {
    const submission = normalizeSubmission(rawSubmission);
    let audioUrl = submission?.audio_url ?? submission?.audioUrl ?? null;
    if (!audioUrl) return <p className="text-muted"><UiText text={"Không có audio"} /></p>;
    
    // Normalize audio URL to ensure it goes through Vite proxy
    audioUrl = normalizeAudioUrl(audioUrl);

    const segments =
      Array.isArray(submission?.segments) && submission.segments.length
        ? submission.segments
        : Array.isArray(submission?.transcript?.segments) && submission.transcript.segments.length
          ? submission.transcript.segments
          : [];

    const wordsSource =
      Array.isArray(submission?.word_analysis) && submission.word_analysis.length
        ? submission.word_analysis
        : Array.isArray(submission?.words) && submission.words.length
          ? submission.words
          : Array.isArray(submission?.transcript?.words) && submission.transcript.words.length
            ? submission.transcript.words
            : [];

    return (
      <div className="conversation">
        <AuthenticatedMedia as="audio"
          ref={setAudioNode}
          src={audioUrl} 
          controls 
          className="audio-control"
          preload="auto"
          onLoadedData={() => {
            // Đảm bảo audio đã sẵn sàng để phát
            if (audioRef.current) {
              audioRef.current.volume = 1.0;
            }
          }}
        />
        <div className="conversation-toggle">
          <button
            className="btn-secondary"
            onClick={() => setShowConversation(prev => !prev)}
            title={englishText("Ẩn/Hiện hội thoại")}
          >
            <UiText>{showConversation ? "Ẩn hội thoại" : "Hiện hội thoại"}</UiText>
          </button>
        </div>

        {!showConversation && (
          <div className="text-muted hint">{" "}<UiText text={"Nhấn \"Hiện hội thoại\" để xem từng đoạn; bấm vào từ để phát đoạn tương ứng."} />{" "}</div>
        )}

        {showConversation && (
          <>
            {segments.length > 0 && renderSegmentedTranscript({ ...submission, segments })}

            {segments.length === 0 && wordsSource.length > 0 && (
              <div className="transcript-scroll">
                <div className="transcript-words">
                  {wordsSource.map((w, i) => {
                    const segStart = typeof w.start === "number" ? w.start : 0;
                    const segEnd = typeof w.end === "number" ? w.end : (typeof submission.duration === "number" ? submission.duration : null);
                    const playStart = segStart;
                    const playEnd = segEnd !== null ? segEnd : (typeof submission.duration === "number" ? submission.duration : (segStart + 2));
                    const title = buildTooltipForToken(w);
                    const cls = tokenClass(w);
                    return (
                      <button
                        key={i}
                        type="button"
                        className={cls}
                        data-token-idx={i}
                        title={title}
                        onClick={() => playSegment(playStart, playEnd, i)}
                        style={{ textTransform: "lowercase" }}
                      >
                        {String(w.word ?? "").toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {segments.length === 0 && wordsSource.length === 0 && (
              <div className="text-muted"><UiText text={"Chưa có dữ liệu hội thoại để hiển thị."} /></div>
            )}
          </>
        )}

        <p className="help-text"><UiText text={"Nhấp vào từ để nghe từ vị trí đó đến hết bản ghi."} /></p>
        {audioError && <p role="alert"><UiText>{audioError}</UiText></p>}
      </div>
    );
  }

  // Resolve mentorId
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    mentorRequestRef.current = controller;
    setMentorId(null);
    setErr("");
    setResolvingMentor(true);
    async function resolveMentor() {
      try {
        const id = await resolveMentorId(api, userId, { signal });
        if (!signal.aborted) setMentorId(id);
      } catch (error) {
        if (!signal.aborted) setErr(error?.response?.data?.message || "Không thể xác định mentor đăng nhập.");
      } finally {
        if (!signal.aborted) setResolvingMentor(false);
      }
    }
    resolveMentor();
    return () => {
      controller.abort();
      if (mentorRequestRef.current === controller) mentorRequestRef.current = null;
    };
  }, [userId]);

  // Fetch submission detail
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    submissionRequestRef.current = controller;
    stopPlayback();
    setSubmission(null);
    setFinalScore(null);
    setUploadedUrl(null);
    setAudioError("");
    setShowConversation(true);
    setLoading(Boolean(mentorId && submissionId));
    const cleanup = () => {
      controller.abort();
      stopPlayback();
      if (submissionRequestRef.current === controller) submissionRequestRef.current = null;
    };
    if (!mentorId || !submissionId) return cleanup;
    setErr("");
    loadMentorSubmission(api, mentorId, submissionId, { signal })
      .then(s => {
        if (signal.aborted) return;
        // Normalize submission data (parse JSON strings if needed)
        const normalized = normalizeSubmission(s);
        setSubmission(normalized);
        
        // Only display AI scores when an explicit assessment contract confirms them.
        const mr = normalized.mentor_review;
        const contract = normalized.ai_assessment_contract;
        const languageScore = contract?.status === "completed"
          ? contract?.metrics?.language_quality
          : null;
        setFinalScore(typeof languageScore === "number" &&
          Number.isFinite(languageScore) && languageScore >= 0 && languageScore <= 100
          ? languageScore.toFixed(1)
          : null);
        
        // Load audio URL từ mentor_review (ưu tiên nhất)
        const audioUrl = mr?.audio_url || normalized.feedback?.audio_url || normalized.mentor_audio_play_url;
        if (audioUrl) {
          // Always normalize audio URL to ensure it goes through Vite proxy
          const normalizedAudioUrl = normalizeAudioUrl(audioUrl);
          setUploadedUrl(normalizedAudioUrl);
        } else {
          setUploadedUrl(null);
        }
        
      })
      .catch(error => {
        if (!signal.aborted) setErr(error?.code === "SUBMISSION_DETAIL_MISMATCH"
          ? "Dữ liệu bài nộp không khớp. Vui lòng đóng và mở lại chi tiết."
          : "Không thể tải bài nộp. Vui lòng thử lại.");
      })
      .finally(() => { if (!signal.aborted) setLoading(false); });
    return cleanup;
  }, [mentorId, submissionId]);

  if (loading || resolvingMentor) return <div className="panel"><UiText text={"Đang tải chi tiết..."} />{" "}<button className="btn-ghost" onClick={closeModal}><UiText text={"Đóng"} /></button></div>;
  if (err) return (
    <div className="panel">
      <div className="error"><UiText>{err}</UiText></div>
      <button className="btn-ghost" onClick={closeModal}><UiText text={"Đóng"} /></button>
    </div>
  );
  if (!submission) return null;
  if (Number(submission.id) !== Number(submissionId)) return <div className="panel"><UiText text={"Đang tải chi tiết..."} /></div>;

  return (
    <div ref={cardRef} className="submission-card" aria-live="polite" style={{ maxHeight: "90vh", overflowY: "auto" }}>
      <div className="submission-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 className="submission-title">{submission.title || "Submission"}</h3>
          <div className="meta">
            <span><UiText>{submission.learner?.name ?? "Learner"}</UiText></span>
            <span className="meta-sep">•</span>
            <span><UiText>{new Date(submission.created_at).toLocaleString()}</UiText></span>
          </div>
        </div>
        <button className="btn-ghost" onClick={closeModal}><UiText text={"Đóng"} /></button>
      </div>

      <div className="submission-body" style={{ display: "grid", gap: 12 }}>
        {/* Transcript với khả năng click để phát audio */}
        <div className="section">
          <UiText>{renderConversationOnly(submission)}</UiText>
        </div>

        {/* Đánh giá AI */}
        {(() => {
          // Kiểm tra giống như ChallengeDetail
          const canShowAnalysis = !!submission &&
            (submission.status === "completed" ||
             !!submission.analysis ||
             submission.overall_score != null ||
             !!submission.word_analysis ||
             !!submission.segments ||
             !!submission.transcript?.text ||
             typeof submission.transcript === "string" ||
             submission.score != null);

          if (!canShowAnalysis) return null;

          // Lấy AI summary giống ChallengeDetail
          const aiSummary = submission?.topic || submission?.topic_confidence
            ? {
                topic: submission?.topic ?? null,
                topicConfidence: submission?.topic_confidence ?? null,
                alignment: submission?.topic_alignment ?? null
              }
            : null;
          
          const contract = submission?.ai_assessment_contract;
          const languageScore = contract?.status === "completed"
            ? contract?.metrics?.language_quality
            : null;
          const normalizedAiOverall = typeof languageScore === "number" &&
            Number.isFinite(languageScore) && languageScore >= 0 && languageScore <= 100
            ? languageScore.toFixed(1)
            : null;

          return (
            <div className="section">
              <div className="section-title-inline">
                <FiCpu className="section-icon" />
                <strong><UiText text={"Đánh giá tự động"} /></strong>
              </div>
              <div className="score-grid">
                <div>
                  <span className="label"><UiText text={"Chất lượng ngôn ngữ (phân tích transcript)"} /></span>
                  <div className="value"><UiText>{normalizedAiOverall == null ? "Chưa có kết quả đã xác minh" : `${normalizedAiOverall}/100`}</UiText></div>
                </div>
              </div>

              {aiSummary && (
                <div className="ai-topic-box">
                  <div className="label"><UiText text={"Chủ đề"} /></div>
                  <div className="value">
                    <UiText>{aiSummary.topic ?? "—"}</UiText>
                    {typeof aiSummary.topicConfidence === "number" && (
                      <span className="sub-note">{" "}<UiText text={"(tự tin:"} />{" "}<UiText>{aiSummary.topicConfidence.toFixed(2)}</UiText>)</span>
                    )}
                  </div>

                  {aiSummary.alignment && (
                    <div className="alignment-block">
                      <div className="label"><UiText text={"Phù hợp challenge"} /></div>
                      <div className="value">{" "}<UiText text={"Phù hợp:"} />{" "}<UiText>{typeof aiSummary.alignment.alignment_score === "number" &&
                          Number.isFinite(aiSummary.alignment.alignment_score) &&
                          aiSummary.alignment.alignment_score >= 0 &&
                          aiSummary.alignment.alignment_score <= 1
                          ? `${(aiSummary.alignment.alignment_score * 100).toFixed(1)}%`
                          : "Chưa có metric hợp lệ"}</UiText>
                        {Array.isArray(aiSummary.alignment.notes) && aiSummary.alignment.notes.length > 0 && (
                          <ul className="notes">
                            {aiSummary.alignment.notes.map((n, idx) => <li key={idx}><UiText>{n}</UiText></li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="auto-feedback">
                <div className="label"><UiText text={"Nhận xét tự động"} /></div>
                <div className="value">{aiFeedback.feedback || "—"}</div>
                {aiFeedback.suggestions.length > 0 && <>
                  <div className="label"><UiText text={"Gợi ý cải thiện"} /></div>
                  <ul>{aiFeedback.suggestions.map((text, index) => <li key={index}>{text}</li>)}</ul>
                </>}
              </div>
            </div>
          );
        })()}

        {/* Historical Mentor audio is retained as support context, not an assessment control. */}
        {uploadedUrl && (
          <div style={{ marginBottom: 16, padding: 12, background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb" }}>
            <div className="label" style={{ marginBottom: 8, color: "#059669", fontWeight: 600 }}>{" "}<UiText text={"Audio hỗ trợ trước đây"} />{" "}</div>
            <AuthenticatedMedia as="audio" ref={setSupportAudioNode} src={uploadedUrl} controls style={{ width: "100%" }} />
          </div>
        )}

        <div className="ai-scores">
          <div className="label"><UiText text={"Đánh giá AI dựa trên transcript"} /></div>
          <div className="help-text"><UiText text={"Chất lượng ngôn ngữ:"} />{" "}<strong><UiText>{finalScore == null ? "Chưa có kết quả đã xác minh" : `${finalScore}/100`}</UiText></strong></div>
          <div className="help-text"><UiText text={"Phát âm và độ trôi chảy: chưa được đánh giá bằng phân tích transcript."} /></div>
        </div>

        {submission.mentor_review?.feedback && (
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="label"><UiText text={"Ghi chú hỗ trợ trước đây của Mentor"} /></div>
            <div>{submission.mentor_review.feedback}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="help-text"><UiText text={"AI phản hồi vẫn hoạt động độc lập; Mentor chỉ hỗ trợ khi cần."} /></span>
            <Link to="/mentor/communicate" className="btn-submit" onClick={closeModal}>{" "}<UiText text={"Hỗ trợ qua cộng đồng"} />{" "}</Link>
          </div>
          <button className="btn-ghost" onClick={closeModal}><UiText text={"Đóng"} /></button>
        </div>
      </div>
    </div>
  );
}
