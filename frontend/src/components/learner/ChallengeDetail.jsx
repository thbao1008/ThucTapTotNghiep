import ChallengeLesson from './ChallengeLesson';
import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
// src/components/learner/ChallengeDetail.jsx (mới )
import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api";
import SubmissionForm from "./SubmissionForm";
import MentorProfileModal from "../common/MentorProfileModal.jsx";
import {normalizeChallengeLevel} from '../../utils/challengeLevel.js';
import { FiClock, FiCheckCircle, FiXCircle, FiUserCheck, FiCpu } from "react-icons/fi";
import "../../styles/challenge.css";
import { normalizeAudioUrl } from "../../utils/apiHelpers.js";
import { AuthenticatedMedia } from "../../utils/authenticatedMedia.jsx";
import { retrySubmission } from "../../utils/submissionRetry.js";
import { loadLearnerSubmissions } from "../../utils/learnerFeedback.js";
import { getSubmissionAiFeedback } from "../../utils/submissionAiFeedback.js";
import { playAudioFrom, setOwnedAudioNode } from '../../utils/audioSegment.js';

export default function ChallengeDetail({ id, learnerId, onClose = () => {} }) {
  // A challenge/account change starts a new view; old requests belong to the old instance.
  return <ChallengeDetailContent key={`${id}:${learnerId}`} id={id} learnerId={learnerId} onClose={onClose} />;
}

function ChallengeDetailContent({ id, learnerId, onClose }) {
  const [challenge, setChallenge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showSubmit, setShowSubmit] = useState(false);
  const [submissions, setSubmissions] = useState([]);

  const [openMentorId, setOpenMentorId] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loadingSubmission, setLoadingSubmission] = useState(false);

  const [showHistory, setShowHistory] = useState(true);
  const [showConversation, setShowConversation] = useState(false);
  const [isSubmitButtonLocked, setSubmitButtonLocked] = useState(false);

  const pollingRef = useRef(null);
  const audioRef = useRef(null);
  const setAudioNode = useCallback(node => setOwnedAudioNode(audioRef, node), []);
  const stopPlaybackRef = useRef(() => {});
  const scrollTimerRef = useRef(null);
  const [playbackError, setPlaybackError] = useState('');
  const retryBusyRef = useRef(false);
  const retryMountedRef = useRef(false);
  const selectedIdRef = useRef(null);
  const viewRequestRef = useRef(0);
  const listRequestRef = useRef(0);
  const listAbortRef = useRef(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    retryMountedRef.current = true;
    return () => { retryMountedRef.current = false; };
  }, []);
  useEffect(() => { setRetryError(""); }, [selectedSubmission?.id]);

  async function handleRetrySubmission() {
    const submissionId = selectedSubmission?.id;
    if (!submissionId || retryBusyRef.current) return;
    const request = viewRequestRef.current;
    stopPollingSubmission();
    retryBusyRef.current = true;
    setRetrying(true);
    setRetryError("");
    try {
      const submission = await retrySubmission(api, submissionId);
      if (!isCurrentSubmission(request, submissionId)) return;
      setSelectedSubmission(submission);
      if (!["completed", "reviewed", "failed"].includes(submission.status)) startPollingSubmission(submissionId);
      await refreshSubmissions();
    } catch (error) {
      if (isCurrentSubmission(request, submissionId)) {
        setRetryError(error.response?.data?.message || "Chưa xác nhận được yêu cầu xử lý lại. Bài nộp vẫn được giữ; hãy tải lại trạng thái.");
        if (![401, 403, 404].includes(error.response?.status)) startPollingSubmission(submissionId);
      }
    } finally {
      retryBusyRef.current = false;
      if (retryMountedRef.current) setRetrying(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const chRes = await api.get(`/challenges/${id}`);
        const ch = chRes.data?.challenge ?? chRes.data ?? null;
        if (!mounted) return;
        setChallenge(ch?{...ch,level:normalizeChallengeLevel(ch.level)}:ch);
        if (learnerId) await refreshSubmissions();
      } catch (err) {
        if (mounted) setError(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [id, learnerId]);

  useEffect(() => {
    return () => {
      viewRequestRef.current++;
      selectedIdRef.current = null;
      stopPollingSubmission();
      listAbortRef.current?.abort();
      stopPlayback();
    };
  }, []);

  async function refreshSubmissions() {
    if (!learnerId) return;
    const request = ++listRequestRef.current;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const arr = await loadLearnerSubmissions(api, learnerId, { signal: controller.signal });
      const filtered = arr.filter((s) => String(s.challenge_id ?? s.challengeId) === String(id));
      if (retryMountedRef.current && request === listRequestRef.current) setSubmissions(filtered);
    } catch (_) {
      if (retryMountedRef.current && request === listRequestRef.current && !controller.signal.aborted) {
        setHistoryError("Chưa tải được đầy đủ lịch sử bài nộp. Hãy thử lại.");
      }
    } finally {
      if (retryMountedRef.current && request === listRequestRef.current) setHistoryLoading(false);
    }
  }

  function renderStatusIcon(submission) {
    if (submission.mentor_review) {
      return (
        <span className="challenge-status-pill success">
          <FiUserCheck />{" "}<UiText text={"Mentor: đã nhận xét"} />{" "}</span>
      );
    }
    switch (submission.status) {
      case "pending":
      case "pending_transcription":
      case "processing":
        return <span className="challenge-status-pill pending"><FiClock />{" "}<UiText text={"Đang phân tích…"} /></span>;
      case "completed":
        return <span className="challenge-status-pill success"><FiCheckCircle />{" "}<UiText text={"Đã đánh giá"} /></span>;
      case "failed":
        return <span className="challenge-status-pill danger"><FiXCircle />{" "}<UiText text={"Lỗi"} /></span>;
      default:
        return <span className="challenge-status-pill"><UiText>{submission.status ?? "—"}</UiText></span>;
    }
  }

  function stopPlayback() {
    stopPlaybackRef.current(); stopPlaybackRef.current = () => {};
    audioRef.current?.pause();
    clearTimeout(scrollTimerRef.current); scrollTimerRef.current = null;
  }

  function playSegment(start, end, idx) {
    stopPlayback(); setPlaybackError('');
    const player = audioRef.current;
    stopPlaybackRef.current = playAudioFrom(player, start, message => {
      if (retryMountedRef.current && audioRef.current === player) setPlaybackError(message);
    });
    
    // Scroll đến từ được click
    scrollTimerRef.current = setTimeout(() => {
      const el = document.querySelector(`[data-token-idx="${idx}"]`);
      if (el) {
        el.focus();
        // Tìm container có scroll
        let scrollContainer = el.closest('.transcript-scroll') || 
                             el.closest('.conversation') ||
                             el.closest('.challenge-submission-body') ||
                             el.closest('.section');
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

  const canShowAnalysis = !!selectedSubmission &&
    (selectedSubmission.status === "completed" ||
     !!selectedSubmission.analysis ||
     selectedSubmission.overall_score != null ||
     !!selectedSubmission.word_analysis ||
     !!selectedSubmission.segments ||
     !!selectedSubmission.transcript?.text ||
     typeof selectedSubmission.transcript === "string");

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

  function normalizeSubmission(submission) {
    const sub = { ...submission };
    if (typeof sub.transcript === "string") { try { sub.transcript = JSON.parse(sub.transcript); } catch (_) {} }
    if (typeof sub.segments === "string") { try { sub.segments = JSON.parse(sub.segments); } catch (_) {} }
    if (typeof sub.words === "string") { try { sub.words = JSON.parse(sub.words); } catch (_) {} }
    if (typeof sub.word_analysis === "string") { try { sub.word_analysis = JSON.parse(sub.word_analysis); } catch (_) {} }
    return sub;
  }

  function renderSegmentedTranscript(submission) {
    const segments = submission?.segments ?? [];
    const audioUrl = submission?.audio_url ?? null;
    if (!audioUrl || !Array.isArray(segments) || segments.length === 0) return null;

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
    const audioUrl = submission?.audio_url ?? null;
    if (!audioUrl) return <p className="text-muted"><UiText text={"Không có audio"} /></p>;

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
        <AuthenticatedMedia as="audio" ref={setAudioNode} id="player" src={normalizeAudioUrl(audioUrl)} controls className="audio-control" />
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

        <p className="help-text"><UiText text={"Nhấp vào từ để nghe lại toàn bộ đoạn chứa từ đó."} /></p>
      </div>
    );
  }

  function stopPollingSubmission() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = null;
  }

  function isCurrentSubmission(request, submissionId) {
    return retryMountedRef.current && viewRequestRef.current === request &&
      String(selectedIdRef.current) === String(submissionId);
  }

  function leaveSubmission() {
    stopPlayback(); setPlaybackError('');
    viewRequestRef.current++;
    selectedIdRef.current = null;
    stopPollingSubmission();
    setSelectedSubmission(null);
    setLoadingSubmission(false);
    setSubmissionError("");
    setRetryError("");
  }

  async function loadSubmissionDetails(submissionId, fallback = null) {
    if (!retryMountedRef.current) return;
    stopPlayback(); setPlaybackError('');
    const request = ++viewRequestRef.current;
    selectedIdRef.current = submissionId;
    stopPollingSubmission();
    setLoadingSubmission(true);
    setSubmissionError("");
    setRetryError("");
    try {
      const res = await api.get(`/learners/submissions/${submissionId}`);
      const sub = res.data?.submission ?? res.data ?? null;
      if (!isCurrentSubmission(request, submissionId)) return;
      if (String(sub?.id) !== String(submissionId)) throw new Error("Không thể xác minh bài nộp.");
      setSelectedSubmission(sub);
      setShowHistory(false);
      setShowSubmit(false);
      setShowConversation(false);
      if (!["completed", "reviewed", "failed"].includes(sub.status)) startPollingSubmission(submissionId);
    } catch (error) {
      if (!isCurrentSubmission(request, submissionId)) return;
      if (fallback) {
        setSelectedSubmission(fallback);
        setShowHistory(false);
        setShowSubmit(false);
        if (![401, 403, 404].includes(error.response?.status)) startPollingSubmission(submissionId);
      } else {
        setSelectedSubmission(null);
        setShowHistory(true);
      }
      setSubmissionError("Không tải được trạng thái bài nộp. Bài đã lưu vẫn được giữ; hãy thử mở lại từ lịch sử.");
    } finally {
      if (isCurrentSubmission(request, submissionId)) setLoadingSubmission(false);
    }
  }

  async function handleHistoryView(submissionId) {
    await loadSubmissionDetails(submissionId);
  }

  function startPollingSubmission(submissionId) {
    if (!submissionId) return;
    stopPollingSubmission();
    const request = viewRequestRef.current;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (!isCurrentSubmission(request, submissionId) || pollingRef.current !== timer) {
        clearInterval(timer);
        if (pollingRef.current === timer) pollingRef.current = null;
        return;
      }
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await api.get(`/learners/submissions/${submissionId}`);
        const sub = res.data?.submission ?? res.data ?? null;
        if (String(sub?.id) !== String(submissionId) || !isCurrentSubmission(request, submissionId) || pollingRef.current !== timer) return;

        setSelectedSubmission(sub);
        setSubmissionError("");

        // Kiểm tra xem đã có AI analysis hoặc mentor review chưa
        const done = sub.status === "completed" || sub.status === "reviewed" ||
          sub.status === "failed";
        if (done) {
          clearInterval(timer);
          if (pollingRef.current === timer) pollingRef.current = null;
          await refreshSubmissions();
        }
      } catch (error) {
        if (isCurrentSubmission(request, submissionId) && pollingRef.current === timer &&
            [401, 403, 404].includes(error.response?.status)) {
          stopPollingSubmission();
          setSubmissionError(error.response?.data?.message || "Không còn truy cập được bài nộp. Hãy tải lại lịch sử.");
        }
      } finally { inFlight = false; }
    }, 3000);
    pollingRef.current = timer;
  }

  async function handleAfterSubmit(result) {
    if (!retryMountedRef.current) return;
    let submissionId = null;
    let audio_url = null;
    const fallbackStatus = result?.processingFailed ? "failed" : "pending_transcription";

    if (!result) {
      await refreshSubmissions();
      setShowSubmit(false);
      setShowHistory(true);
      setSubmitButtonLocked(false);
      return;
    }

    if (typeof result === "object") {
      submissionId = result.submissionId ?? result.id ?? null;
      audio_url = result.audio_url ?? result.audioUrl ?? null;
    } else {
      submissionId = result;
    }

    setShowSubmit(false);
    setShowHistory(false);

    if (!submissionId) {
      await refreshSubmissions();
      setSubmitButtonLocked(false);
      return;
    }

    await loadSubmissionDetails(submissionId, { id: submissionId, audio_url, status: fallbackStatus });
    if (retryMountedRef.current) setSubmitButtonLocked(false);
  }

  if (loading) return <div><UiText text={"Đang tải..."} /></div>;
  if (error) return <div className="text-danger"><UiText text={"Lỗi:"} />{" "}<UiText>{error.message ?? "Không thể tải challenge"}</UiText></div>;
  if (!challenge) return <div><UiText text={"Không tìm thấy challenge"} /></div>;

  const aiSummary = selectedSubmission?.topic || selectedSubmission?.topic_confidence
    ? {
        topic: selectedSubmission?.topic ?? null,
        topicConfidence: selectedSubmission?.topic_confidence ?? null,
        alignment: selectedSubmission?.topic_alignment ?? null
      }
    : null;

  // src/components/learner/ChallengeDetail.jsx
// Chỉ trích đoạn phần layout cần thay

return (
  <div className="challenge-detail-page">
    <div className="challenge-header">
      <div className="header-left">
        <h2 className="challenge-title">{challenge.title ?? "Challenge"}</h2>
        <span className="badge"><UiText>{challenge.level ?? "-"}</UiText></span>
        {challenge.mentor_name && (
          <button type="button"
            className="mentor-link"
            onClick={() => { if (challenge.mentor_id) setOpenMentorId(challenge.mentor_id); }}
          >
            {challenge.mentor_name}
          </button>
        )}
      </div>
      <div className="header-right">
        {!showSubmit && !selectedSubmission && learnerId && (
          <button
            className="btn-primary"
            disabled={isSubmitButtonLocked}
            onClick={() => {
              if (isSubmitButtonLocked) return;
              setSubmitButtonLocked(true);
              setShowSubmit(true);
              setShowHistory(false);
              leaveSubmission();
            }}
            style={{ marginRight: "8px" }}
          >
            <UiText>{isSubmitButtonLocked ? "Đang xử lý..." : "Nộp bài"}</UiText>
          </button>
        )}
        <button className="btn-ghost" onClick={onClose}><UiText text={"Đóng"} /></button>
      </div>
    </div>

    {submissionError && <p role="alert"><UiText>{submissionError}</UiText></p>}
    {/* ONE layout container */}
    <div className={`challenge-detail-layout ${selectedSubmission ? "is-expanded" : ""}`}>
      {/* LEFT: Detail */}
      <div className="challenge-left-panel">
        {showSubmit ? (
          <SubmissionForm
            learnerId={learnerId}
            challengeId={id}
            onSubmitted={handleAfterSubmit}
            onCancel={() => {
              setShowSubmit(false);
              setShowHistory(true);
              setSubmitButtonLocked(false);
            }}
          />
        ) : selectedSubmission ? (
          <div className="challenge-submission-card">
            <div className="challenge-submission-header">
              <h3 className="submission-title"><UiText text={"Chi tiết nộp bài"} /></h3>
              <UiText>{renderStatusIcon(selectedSubmission)}</UiText>
              <div className="actions">
                <button
                  className="btn-ghost"
                  onClick={() => {
                    leaveSubmission();
                    setShowHistory(true);
                    setSubmitButtonLocked(false);
                    refreshSubmissions();
                  }}
                >{" "}<UiText text={"Quay lại lịch sử"} />{" "}</button>
              </div>
            </div>

            {/* body có cuộn riêng */}
            <div className="challenge-submission-body">
              {loadingSubmission ? (
                <div className="text-muted"><UiText text={"Đang tải..."} /></div>
              ) : (
                <>
                  <div className="section"><UiText>{renderConversationOnly(selectedSubmission)}</UiText></div>
                  {selectedSubmission?.status === "failed" && <div className="section">
                    <p><UiText text={"Bài nộp đã được lưu. Bạn có thể thử xử lý lại mà không nộp audio mới."} /></p>
                    <button type="button" onClick={handleRetrySubmission} disabled={retrying}>
                      <UiText>{retrying ? "Đang yêu cầu xử lý lại..." : "Thử xử lý lại"}</UiText>
                    </button>
                  </div>}
                  {retryError && <p role="alert"><UiText>{retryError}</UiText></p>}
                  {playbackError && <p role="alert"><UiText>{playbackError}</UiText></p>}

                  {canShowAnalysis && (() => {
                    const contract = selectedSubmission?.ai_assessment_contract;
                    const score = contract?.status === "completed"
                      ? contract?.metrics?.language_quality
                      : null;
                    const normalizedAiOverall = typeof score === "number" && Number.isFinite(score) &&
                      score >= 0 && score <= 100 ? score.toFixed(1) : null;
                    const aiFeedback = getSubmissionAiFeedback(selectedSubmission);
                    
                    return (
                      <div className="section">
                        <div className="section-title-inline"><FiCpu className="section-icon" /><strong><UiText text={"Đánh giá tự động"} /></strong></div>
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

                  <div className="section mentor-review">
                    <div className="section-title-inline"><FiUserCheck className="section-icon" /><strong><UiText text={"Nhận xét Mentor"} /></strong></div>
                    {selectedSubmission.mentor_review ? (
                      <div className="text-sm">
                        <div className="score-grid">
                          <div><span className="label"><UiText text={"Điểm tổng"} /></span><div className="value"><UiText>{selectedSubmission.mentor_review.assessment_contract?.status === "completed" && selectedSubmission.mentor_review.final_score != null ? `${Number(selectedSubmission.mentor_review.final_score).toFixed(1)}/100` : "Chưa xác minh"}</UiText></div></div>
                          <div><span className="label"><UiText text={"Phát âm"} /></span><div className="value"><UiText>{selectedSubmission.mentor_review.assessment_contract?.status === "completed" && selectedSubmission.mentor_review.pronunciation_score != null ? `${Number(selectedSubmission.mentor_review.pronunciation_score).toFixed(1)}/100` : "Chưa đánh giá"}</UiText></div></div>
                          <div><span className="label"><UiText text={"Trôi chảy"} /></span><div className="value"><UiText>{selectedSubmission.mentor_review.assessment_contract?.status === "completed" && selectedSubmission.mentor_review.fluency_score != null ? `${Number(selectedSubmission.mentor_review.fluency_score).toFixed(1)}/100` : "Chưa đánh giá"}</UiText></div></div>
                        </div>
                        {(() => {
                          // Normalize audio_url - có thể là relative path hoặc full URL
                          let audioUrl = selectedSubmission.mentor_review.audio_url;
                          if (audioUrl) {
                            audioUrl = normalizeAudioUrl(audioUrl);
                            return (
                              <div style={{ marginTop: 12 }}>
                                <div className="label"><UiText text={"Audio nhận xét"} /></div>
                                <AuthenticatedMedia as="audio"
                                  src={audioUrl} 
                                  controls 
                                  style={{ width: "100%" }}
                                  preload="metadata"
                                  onError={(e) => {
                                    console.error("[ChallengeDetail] Audio load error:", {
                                      src: audioUrl,
                                      error: e.target.error
                                    });
                                  }}
                                />
                              </div>
                            );
                          }
                          return null;
                        })()}
                        {(() => {
                          // Parse feedback text - có thể là JSON string hoặc plain text
                          let feedbackText = selectedSubmission.mentor_review.feedback;
                          if (typeof feedbackText === "string") {
                            try {
                              const parsed = JSON.parse(feedbackText);
                              // Nếu là object có text property, lấy text
                              if (parsed && typeof parsed === "object" && parsed.text) {
                                feedbackText = parsed.text;
                              } else if (typeof parsed === "string") {
                                feedbackText = parsed;
                              }
                            } catch (e) {
                              // Không phải JSON, giữ nguyên
                            }
                          }
                          return feedbackText ? (
                            <div className="auto-feedback" style={{ marginTop: 12 }}>
                              <div className="label"><UiText text={"Nhận xét"} /></div>
                              <div className="value"><UiText>{feedbackText}</UiText></div>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    ) : (
                      <div className="text-muted"><em><UiText text={"Chưa có nhận xét từ Mentor"} /></em></div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <ChallengeLesson key={challenge.id ?? id} challenge={{...challenge,id:challenge.id ?? id}} />
        )}
      </div>

      {/* RIGHT: History (panel có cuộn riêng) */}
      {showHistory && (
        <div className="challenge-right-panel">
          <h4 className="history-title"><UiText text={"Lịch sử nộp bài"} /></h4>
          {historyError ? (
            <div role="alert"><UiText>{historyError}</UiText> <button type="button" onClick={refreshSubmissions}><UiText text={"Tải lại lịch sử"} /></button></div>
          ) : historyLoading ? (
            <div className="text-muted"><UiText text={"Đang tải lịch sử..."} /></div>
          ) : submissions.length === 0 ? (
            <div className="empty-state"><UiText text={"Chưa có lần nộp nào."} /></div>
          ) : (
            <div className="challenge-submission-list">
              {submissions.map((s) => (
                <div key={s.id} className="challenge-submission-card">
                  <div className="challenge-submission-header">
                    <div className="meta">
                      <span className="meta-item"><strong><UiText text={"Attempt"} /></strong>{" "}<UiText text={"#"} /><UiText>{s.attempt_number ?? s.attemptNumber ?? "-"}</UiText></span>
                      <span className="meta-sep">•</span>
                      {(s.created_at || s.submitted_at) && (
                        <span className="meta-item"><strong><UiText text={"Nộp"} /></strong> <UiText>{new Date(s.created_at ?? s.submitted_at).toLocaleString('en-GB')}</UiText></span>
                      )}
                    </div>
                    <div className="actions">
                      <button className="btn-ghost" onClick={() => handleHistoryView(s.id)}><UiText text={"Xem"} /></button>
                    </div>
                  </div>

                  {s.audio_url && (
                    <div className="result-audio">
                      <AuthenticatedMedia as="audio" controls src={normalizeAudioUrl(s.audio_url)} />
                    </div>
                  )}

                  <div className="status-row">
                    <UiText>{renderStatusIcon(s)}</UiText>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>

    {openMentorId && <MentorProfileModal mentorId={openMentorId} onClose={() => setOpenMentorId(null)} />}
  </div>
);

}
