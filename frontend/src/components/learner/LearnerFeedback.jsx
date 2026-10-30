import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
// src/components/learner/LearnerFeedback.jsx
import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import api from "../../api";
import { getAuth } from "../../utils/auth";
import { FiUserCheck, FiStar, FiAlertTriangle, FiCpu } from "react-icons/fi";
import "../../styles/feedback.css";
import { normalizeAudioUrl } from "../../utils/apiHelpers.js";
import { AuthenticatedMedia } from "../../utils/authenticatedMedia.jsx";
import { loadLearnerSubmissions, loadMentorFeedback, getVerifiedAiFeedback } from "../../utils/learnerFeedback.js";
import { buildRecurringAiFeedback } from "../../utils/recurringAiFeedback.js";
import { playAudioSegment } from "../../utils/audioSegment.js";

export default function LearnerFeedback() {
  const [learnerId, setLearnerId] = useState(null);
  const [mentorFeedbacks, setMentorFeedbacks] = useState([]); // Mentor feedback cho learner
  const [learnerFeedbacks, setLearnerFeedbacks] = useState([]); // Learner feedback cho mentor
  const [mentorInfo, setMentorInfo] = useState(null);
  const [feedbackStatus, setFeedbackStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedbackWarning, setFeedbackWarning] = useState("");
  
  // Form state cho learner feedback mentor
  const [rating, setRating] = useState(5);
  const [feedbackContent, setFeedbackContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  
  // Report state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportContent, setReportContent] = useState("");
  const [reportImage, setReportImage] = useState(null);
  const [reportVideo, setReportVideo] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [reportStatus, setReportStatus] = useState({ canReport: true, hoursRemaining: 0 });
  const [checkingReport, setCheckingReport] = useState(false);

  // Submission detail state
  const [submissionDetails, setSubmissionDetails] = useState({}); // { submissionId: submissionData }
  const audioRefs = useRef({}); // { submissionId: audioElement }
  const stopSegmentRef = useRef(() => {});
  const [segmentError, setSegmentError] = useState("");
  useEffect(() => () => stopSegmentRef.current(), []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function loadData() {
      try {
        const auth = getAuth();
        if (!auth || !auth.user) {
          setError("Không tìm thấy thông tin đăng nhập");
          setLoading(false);
          return;
        }

        const userId = auth.user._id || auth.user.id || auth.user.user_id;
        if (!userId) {
          setError("Không xác định được người dùng");
          setLoading(false);
          return;
        }

        // Lấy learner_id từ user_id
        const learnerRes = await api.get(`/learners/by-user/${userId}`, { signal });
        const lid = learnerRes.data?.learner?.id || learnerRes.data?.learner_id || learnerRes.data?.id;
        if (!lid) {
          setError("Không tìm thấy learner. Vui lòng đảm bảo bạn đã đăng ký làm learner.");
          setLoading(false);
          return;
        }

        setLearnerId(lid);

        // Load mentor feedbacks cho learner (từ submissions)
        const submissions = await loadLearnerSubmissions(api, lid, { signal });

        const result = await loadMentorFeedback(api, submissions, { signal });
        if (signal.aborted) return;
        setMentorFeedbacks(result.feedbacks);
        setSubmissionDetails(Object.fromEntries(
          Object.entries(result.details).map(([id, sub]) => [id, normalizeSubmission(sub)])
        ));
        if (result.failedCount) {
          setFeedbackWarning(`Có ${result.failedCount} bài chưa tải được phản hồi. Vui lòng tải lại trang để thử lại.`);
        }

        // Load learner feedback status và mentor info
        try {
          const statusRes = await api.get(`/learners/${lid}/mentor/feedback-status`, { signal });
          if (signal.aborted) return;
          setMentorInfo(statusRes.data.mentor);
          setFeedbackStatus(statusRes.data);
        } catch (err) {
          if (signal.aborted) return;
          if ([401, 403].includes(err?.response?.status)) throw err;
          setFeedbackWarning(previous => [previous, "Chưa tải được thông tin mentor. Vui lòng tải lại trang."].filter(Boolean).join(" "));
        }

        // Load learner feedbacks cho mentor
        try {
          const learnerFbRes = await api.get(`/learners/${lid}/mentor/feedbacks`, { signal });
          if (signal.aborted) return;
          setLearnerFeedbacks(learnerFbRes.data?.feedbacks || []);
        } catch (err) {
          if (signal.aborted) return;
          if ([401, 403].includes(err?.response?.status)) throw err;
          setFeedbackWarning(previous => [previous, "Chưa tải được lịch sử đánh giá mentor. Vui lòng tải lại trang."].filter(Boolean).join(" "));
        }
      } catch (err) {
        if (signal.aborted) return;
        if (err?.response?.status === 404) {
          setError("Không tìm thấy learner. Vui lòng đảm bảo bạn đã đăng ký làm learner.");
        } else {
          setError(err?.response?.data?.message || err?.response?.data?.error || "Không thể tải dữ liệu");
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    loadData();
    return () => controller.abort();
  }, []);

  function normalizeSubmission(submission) {
    const sub = { ...submission };
    if (typeof sub.transcript === "string") { try { sub.transcript = JSON.parse(sub.transcript); } catch (_) {} }
    if (typeof sub.segments === "string") { try { sub.segments = JSON.parse(sub.segments); } catch (_) {} }
    if (typeof sub.words === "string") { try { sub.words = JSON.parse(sub.words); } catch (_) {} }
    if (typeof sub.word_analysis === "string") { try { sub.word_analysis = JSON.parse(sub.word_analysis); } catch (_) {} }
    return sub;
  }

  function playSegment(submissionId, start, end, idx) {
    const player = audioRefs.current[submissionId];
    if (!player) {
      console.warn("[LearnerFeedback] Audio player not found for submission:", submissionId);
      return;
    }
    
    if (typeof start !== "number" || typeof end !== "number") {
      console.warn("[LearnerFeedback] Invalid start/end time:", { start, end });
      return;
    }
    
    stopSegmentRef.current();
    setSegmentError("");
    const startTime = start > 1000 ? start / 1000 : start;
    const endTime = end > 1000 ? end / 1000 : end;
    stopSegmentRef.current = playAudioSegment(player, startTime, endTime, setSegmentError);
    
    setTimeout(() => {
      const el = document.querySelector(`[data-token-idx="${idx}"][data-submission-id="${submissionId}"]`);
      if (el) {
        el.focus();
        let scrollContainer = el.closest('.feedback-transcript-scroll') || el.closest('.feedback-submission-detail');
        if (scrollContainer) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = el.getBoundingClientRect();
          const scrollTop = scrollContainer.scrollTop;
          const scrollY = scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2) + (elementRect.height / 2);
          scrollContainer.scrollTo({
            top: Math.max(0, scrollY),
            behavior: 'smooth'
          });
        } else {
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
    return `feedback-token ${bad ? "token-bad" : "token-ok"} ${isNonEnglish ? "token-nonenglish" : ""}`;
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

  function renderSegmentedTranscript(submission, submissionId) {
    const segments = submission?.segments ?? [];
    const audioUrl = submission?.audio_url ?? null;
    if (!Array.isArray(segments) || segments.length === 0) return null;

    return (
      <div className="feedback-transcript-scroll">
        {segments.map((seg, i) => {
          const start = typeof seg.start === "number" ? seg.start : 0;
          const end = typeof seg.end === "number" ? seg.end : start;
          const segWords = Array.isArray(seg.segment_words) && seg.segment_words.length ? seg.segment_words : [];
          const fallbackWords = !segWords.length && typeof seg.text === "string"
            ? seg.text.split(/\s+/).map((w) => ({ word: w, start, end }))
            : [];
          const wordsToRender = segWords.length ? segWords : fallbackWords;
          const nonEnglishCount = wordsToRender.filter(w => w.lang && w.lang !== "en").length;
          const segmentClass = nonEnglishCount > 0 ? "feedback-segment-block segment-nonenglish" : "feedback-segment-block";

          return (
            <div key={i} className={segmentClass}>
              <div className="segment-text">
                {wordsToRender.map((w, j) => {
                  const title = buildTooltipForToken(w);
                  const cls = tokenClass(w);
                  const playStart = typeof w.start === "number" ? w.start : start;
                  const playEnd = typeof w.end === "number" ? w.end : end;
                  
                  return (
                    <button
                      key={`${i}-${j}`}
                      type="button"
                      className={cls}
                      data-token-idx={`${i}-${j}`}
                      data-submission-id={submissionId}
                      title={title}
                      onClick={() => playSegment(submissionId, playStart, playEnd, `${i}-${j}`)}
                      disabled={!audioUrl}
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

  function renderSubmissionDetail(fb) {
    const submissionId = fb.submission_id;
    const submission = submissionDetails[submissionId];
    if (!submission) return null;

    const segments = submission?.segments ?? [];
    const wordsSource = Array.isArray(submission?.word_analysis) && submission.word_analysis.length
      ? submission.word_analysis
      : Array.isArray(submission?.words) && submission.words.length
        ? submission.words
        : [];

    const audioUrl = submission?.audio_url;
    const transcriptText = typeof submission.transcript === "string"
      ? submission.transcript
      : submission.transcript?.text;

    return (
      <div className="feedback-submission-detail">
        <div className="section">
          <div className="section-title-inline">
            <FiCpu className="section-icon" />
            <span><UiText text={"Hội thoại & Transcript"} /></span>
          </div>
          
          {audioUrl && <AuthenticatedMedia as="audio"
            ref={el => { if (el) audioRefs.current[submissionId] = el; }}
            src={normalizeAudioUrl(audioUrl)}
            controls
            className="feedback-audio-control"
            preload="auto"
          />}

          {segments.length === 0 && wordsSource.length === 0 && transcriptText && (
            <p style={{ whiteSpace: "pre-wrap" }}><UiText>{transcriptText}</UiText></p>
          )}

          <UiText>{segments.length > 0 && renderSegmentedTranscript(submission, submissionId)}</UiText>
          
          {segments.length === 0 && wordsSource.length > 0 && (
            <div className="feedback-transcript-scroll">
              <div className="transcript-words">
                {wordsSource.map((w, i) => {
                  const playStart = typeof w.start === "number" ? w.start : 0;
                  const playEnd = typeof w.end === "number" ? w.end : (playStart + 2);
                  const title = buildTooltipForToken(w);
                  const cls = tokenClass(w);
                  return (
                    <button
                      key={i}
                      type="button"
                      className={cls}
                      data-token-idx={i}
                      data-submission-id={submissionId}
                      title={title}
                      onClick={() => playSegment(submissionId, playStart, playEnd, i)}
                      disabled={!audioUrl}
                      style={{ textTransform: "lowercase" }}
                    >
                      {String(w.word ?? "").toLowerCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* AI Assessment */}
        {submission.ai_assessment_contract?.status === "completed" &&
          typeof submission.ai_assessment_contract?.metrics?.language_quality === "number" &&
          Number.isFinite(submission.ai_assessment_contract.metrics.language_quality) &&
          submission.ai_assessment_contract.metrics.language_quality >= 0 &&
          submission.ai_assessment_contract.metrics.language_quality <= 100 && (
          <div className="section">
            <div className="section-title-inline">
              <FiCpu className="section-icon" />
              <span><UiText text={"Đánh giá tự động (AI)"} /></span>
            </div>
            <div className="score-grid">
              <div>
                <span className="label"><UiText text={"Chất lượng ngôn ngữ (phân tích transcript)"} /></span>
                <span className="value"><UiText>{submission.ai_assessment_contract.metrics.language_quality.toFixed(1)}</UiText>/100</span>
              </div>
            </div>
            {submission.topic && (
              <div className="feedback-ai-topic-box">
                <div className="label"><UiText text={"Chủ đề phát hiện"} /></div>
                <div className="value"><UiText>{submission.topic}</UiText> <UiText>{submission.topic_confidence ? `(${(submission.topic_confidence * 100).toFixed(0)}%)` : ""}</UiText></div>
              </div>
            )}
            {submission.suggestions && (
              <div className="feedback-auto-feedback">
                <div className="label"><UiText text={"Gợi ý cải thiện"} /></div>
                <div className="value"><UiText>{typeof submission.suggestions === "string" ? submission.suggestions : JSON.stringify(submission.suggestions)}</UiText></div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  async function handleSubmitFeedback() {
    if (!learnerId || !mentorInfo) return;
    
    setSubmitting(true);
    try {
      const res = await api.post(`/learners/${learnerId}/mentor/feedback`, {
        content: feedbackContent,
        rating: rating
      });
      
      // Refresh data
      const statusRes = await api.get(`/learners/${learnerId}/mentor/feedback-status`);
      setFeedbackStatus(statusRes.data);
      setMentorInfo(statusRes.data.mentor);
      
      const learnerFbRes = await api.get(`/learners/${learnerId}/mentor/feedbacks`);
      setLearnerFeedbacks(learnerFbRes.data?.feedbacks || []);
      
      // Reset form
      setRating(5);
      setFeedbackContent("");
      
      alert(englishText("Đánh giá đã được gửi thành công!"));
    } catch (err) {
      console.error("[LearnerFeedback] Submit feedback error:", err);
      alert(err?.response?.data?.error || englishText("Gửi đánh giá thất bại"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReportMentor() {
    if (!learnerId || !reportContent.trim()) {
      alert(englishText("Vui lòng nhập nội dung report"));
      return;
    }

    if (!reportStatus.canReport) {
      alert(`Bạn chỉ có thể report lại sau 24 giờ. Còn ${reportStatus.hoursRemaining} giờ nữa.`);
      return;
    }

    setReporting(true);
    try {
      const formData = new FormData();
      formData.append("content", reportContent);
      if (reportImage) formData.append("image", reportImage);
      if (reportVideo) formData.append("video", reportVideo);

      const res = await api.post(`/learners/${learnerId}/mentor/report`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      alert(englishText("Report đã được gửi thành công!"));
      setShowReportModal(false);
      setReportContent("");
      setReportImage(null);
      setReportVideo(null);
      setReportStatus({ canReport: false, hoursRemaining: 24 }); // Reset sau khi gửi
    } catch (err) {
      console.error("[LearnerFeedback] Report error:", err);
      if (err?.response?.data?.canReport === false) {
        setReportStatus({
          canReport: false,
          hoursRemaining: err.response.data.hoursRemaining || 24
        });
      }
      alert(err?.response?.data?.error || englishText("Gửi report thất bại"));
    } finally {
      setReporting(false);
    }
  }

  // Check report status when opening modal
  const openReportModal = async () => {
    setShowReportModal(true);
    setReportContent("");
    setReportImage(null);
    setReportVideo(null);
    
    if (learnerId && mentorInfo) {
      setCheckingReport(true);
      try {
        const auth = getAuth();
        const userId = auth?.user?._id || auth?.user?.id || auth?.user?.user_id;
        // Get mentor user_id
        const mentorUserRes = await api.get(`/learners/${learnerId}/mentor`);
        const mentorUserId = mentorUserRes.data?.mentor?.user_id || mentorUserRes.data?.user_id;
        
        if (userId && mentorUserId) {
          const res = await api.get("/admin/reports/can-report", {
            params: { reporter_id: userId, target_id: mentorUserId }
          });
          setReportStatus(res.data);
        }
      } catch (err) {
        console.error("[LearnerFeedback] Error checking report status:", err);
        setReportStatus({ canReport: true, hoursRemaining: 0 });
      } finally {
        setCheckingReport(false);
      }
    }
  };

  if (loading) return <div className="panel"><UiText text={"Đang tải feedbacks..."} /></div>;
  if (error) return <div className="panel"><div className="error"><UiText>{error}</UiText></div></div>;
  const aiFeedbacks=Object.values(submissionDetails).sort((a,b)=>Number(b.id)-Number(a.id)).map(getVerifiedAiFeedback).filter(Boolean);
  const recurringFeedbacks=buildRecurringAiFeedback(Object.values(submissionDetails));

  return (
    <div className="feedback-page">
      {feedbackWarning && <p role="alert"><UiText>{feedbackWarning}</UiText></p>}
      <section className="feedback-section" aria-labelledby="recurring-feedback-heading">
        <h2 id="recurring-feedback-heading"><UiText text={"Góp ý xuất hiện trong nhiều bài nộp"} /></h2>
        <p><UiText text={"Chỉ tổng hợp góp ý ngữ pháp/cách dùng từ kết quả AI đã xác minh và tải được. Mỗi bài nộp tính một lần cho cùng cụm từ và loại góp ý; số lần này không phải điểm kỹ năng."} /></p>
        {recurringFeedbacks.length===0 ? <p><UiText text={"Chưa thấy cùng cụm từ và loại góp ý xuất hiện trong ít nhất hai bài nộp đã tải."} /></p> : <>
          <p><UiText text={"Có"} />{" "}<UiText>{recurringFeedbacks.length}</UiText>{" "}<UiText text={"nhóm góp ý lặp. Hiển thị tối đa 6 nhóm có nhiều bài nộp nhất."} /></p>
          {recurringFeedbacks.slice(0,6).map(group=>{
            const practice=group.evidence.find(row=>row.challengePath);
            return <article key={group.key} className="feedback-card recurring-feedback-card">
              <h3><UiText>{group.type==='grammar'?'Ngữ pháp':'Cách dùng'}</UiText>: “{group.word}”</h3>
              <p><UiText text={"AI đã góp ý trong"} />{" "}<strong><UiText>{group.count}</UiText>{" "}<UiText text={"bài nộp"} /></strong><UiText text={". Cần đọc ngữ cảnh từng bài trước khi áp dụng."} /></p>
              <ul>{group.evidence.slice(0,5).map(row=><li key={row.submissionId}>
                <a href={`#ai-feedback-${row.submissionId}`}>{row.title}{" "}<UiText text={"— bài nộp #"} /><UiText>{row.submissionId}</UiText></a>
                {row.excerpt&&<p className="feedback-evidence-quote"><UiText text={"Trích transcript:"} />{" "}<q><UiText>{row.excerpt}</UiText></q></p>}
                <p>{row.note}</p>
              </li>)}</ul>
              {group.count>5&&<p><UiText text={"Hiển thị 5/"} /><UiText>{group.count}</UiText>{" "}<UiText text={"bài nộp làm bằng chứng; các kết quả đã tải nằm bên dưới."} /></p>}
              <h4><UiText text={"Bước luyện tiếp"} /></h4>
              <p><UiText text={"Đọc lại góp ý trong ngữ cảnh, viết lại 2–3 câu có “"} />{group.word}<UiText text={"”, rồi luyện lại bài liên quan để đối chiếu kết quả."} /></p>
              {practice&&<Link className="recurring-practice-link" to={practice.challengePath}><UiText text={"Luyện lại bài liên quan:"} />{" "}{practice.title}</Link>}
            </article>;
          })}
        </>}
      </section>
      <section className="feedback-section" aria-labelledby="learner-ai-feedback-heading">
        <h2 id="learner-ai-feedback-heading"><FiCpu />{" "}<UiText text={"Phản hồi AI cho bài nộp"} /></h2>
        <p><UiText text={"Phân tích nội dung transcript, không đánh giá phát âm hay độ trôi chảy của âm thanh. Bạn có thể xem kết quả ngay khi AI xử lý xong, không cần chờ nhận xét Mentor."} /></p>
        {aiFeedbacks.length===0 ? <p><UiText text={"Chưa có kết quả AI đã xác minh để hiển thị."} /></p> : aiFeedbacks.map(item=>(
          <article key={item.submissionId} id={`ai-feedback-${item.submissionId}`} className="feedback-card">
            <h3 className="feedback-card-title">{item.title}</h3>
            <p className="feedback-card-meta"><UiText text={"Bài nộp #"} /><UiText>{item.submissionId}</UiText></p>
            <p><UiText text={"Chất lượng ngôn ngữ trong transcript:"} />{" "}<strong><UiText>{item.score.toFixed(1)}</UiText>/100</strong></p>
            {item.feedback&&<p>{item.feedback}</p>}
            {item.suggestions.length>0&&<><h4><UiText text={"Gợi ý luyện tiếp"} /></h4><ul>{item.suggestions.map((text,index)=><li key={index}>{text}</li>)}</ul></>}
            {item.challengePath&&<Link to={item.challengePath}><UiText text={"Mở challenge và lịch sử bài nộp"} /></Link>}
          </article>
        ))}
      </section>
      {/* Phần 1: Đánh giá Mentor (lên đầu) */}
      {mentorInfo && (
        <section className="feedback-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2><UiText text={"Đánh giá Mentor"} /></h2>
            <button
              className="btn-ghost"
              onClick={openReportModal}
              style={{ color: "#dc2626", display: "flex", alignItems: "center", gap: 8 }}
            >
              <FiAlertTriangle />{" "}<UiText text={"Báo cáo Mentor"} />{" "}</button>
          </div>

          <div className="feedback-mentor-info">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <strong>{mentorInfo.name}</strong>
                <div className="rating">{" "}<UiText text={"Điểm đánh giá:"} />{" "}<strong><UiText>{mentorInfo.rating ?? "—"}</UiText>/10</strong>
                </div>
              </div>
            </div>

            {feedbackStatus && (
              <div className={`feedback-status-message ${feedbackStatus.canFeedback ? "can-feedback" : "cannot-feedback"}`}>
                <UiText>{feedbackStatus.canFeedback ? (
                  "✓ Bạn có thể đánh giá mentor ngay bây giờ"
                ) : (
                  `⏳ Bạn chỉ có thể đánh giá mentor sau ${feedbackStatus.daysRemaining} ngày nữa`
                )}</UiText>
              </div>
            )}
          </div>

          {/* Form đánh giá mentor */}
          {feedbackStatus?.canFeedback && (
            <div className="feedback-mentor-form">
              <label className="label"><UiText text={"Điểm đánh giá (0-10)"} /></label>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={rating}
                onChange={e => setRating(e.target.value)}
                style={{ width: "100%", marginBottom: 8 }}
              />
              <div className="help-text"><UiText text={"Điểm:"} />{" "}<strong><UiText>{rating}</UiText>/10</strong></div>

              <label className="label" style={{ marginTop: 12 }}><UiText text={"Nhận xét"} /></label>
              <textarea
                rows="3"
                value={feedbackContent}
                onChange={e => setFeedbackContent(e.target.value)}
                className="input"
                placeholder={englishText("Nhập nhận xét về mentor...")}
              />

              <button
                className="btn-submit"
                onClick={handleSubmitFeedback}
                disabled={submitting}
                style={{ marginTop: 12 }}
              >
                <UiText>{submitting ? "Đang gửi..." : "Gửi đánh giá"}</UiText>
              </button>
            </div>
          )}

          {/* Lịch sử đánh giá của learner */}
          {learnerFeedbacks.length > 0 && (
            <div className="feedback-history">
              <h3><UiText text={"Lịch sử đánh giá của bạn"} /></h3>
              <div style={{ display: "grid", gap: 12 }}>
                {learnerFeedbacks.map((fb, idx) => (
                  <div key={fb.id || idx} className="feedback-history-item">
                    <div className="feedback-history-item-header">
                      <div className="feedback-history-item-rating">
                        <FiStar style={{ color: "#F59E0B" }} />
                        <strong><UiText text={"Điểm:"} />{" "}<UiText>{fb.rating ?? "—"}</UiText>/10</strong>
                      </div>
                      <span className="feedback-history-item-date">
                        <UiText>{new Date(fb.created_at).toLocaleString('en-GB')}</UiText>
                      </span>
                    </div>
                    {fb.content && (
                      <div className="feedback-history-item-content">
                        {fb.content}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Phần 2: Nhận xét từ Mentor (xuống dưới) */}
      <section className="feedback-section">
        <h2><UiText text={"Nhận xét từ Mentor"} /></h2>
        {segmentError && <p role="alert"><UiText>{segmentError}</UiText></p>}
        {mentorFeedbacks.length === 0 && !feedbackWarning ? (
          <div className="feedback-empty-state">
            <p><UiText text={"Chưa có nhận xét nào từ mentor."} /></p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {mentorFeedbacks.map((fb, idx) => (
              <div key={fb.id || idx} className="feedback-card">
                <div className="feedback-card-header">
                  <div>
                    <h3 className="feedback-card-title">
                      <UiText>{fb.challenge_title || `Feedback #${fb.id}`}</UiText>
                    </h3>
                    {fb.submission_created_at && (
                      <div className="feedback-card-meta">{" "}<UiText text={"Nộp bài:"} />{" "}<UiText>{new Date(fb.submission_created_at).toLocaleString('en-GB')}</UiText>
                      </div>
                    )}
                  </div>
                  <span className="challenge-status-pill success">
                    <FiUserCheck />{" "}<UiText text={"Đã chấm"} />{" "}</span>
                </div>

                <div className="feedback-scores">
                  <div className="feedback-score-item">
                    <div className="feedback-score-label"><UiText text={"Điểm tổng"} /></div>
                    <div className="feedback-score-value total">
                      <UiText>{fb.assessment_contract?.status === "completed" && fb.final_score != null ? `${Number(fb.final_score).toFixed(1)}/100` : "Chưa xác minh"}</UiText>
                    </div>
                  </div>
                  <div className="feedback-score-item">
                    <div className="feedback-score-label"><UiText text={"Phát âm"} /></div>
                    <div className="feedback-score-value">
                      <UiText>{fb.assessment_contract?.status === "completed" && fb.pronunciation_score != null ? `${Number(fb.pronunciation_score).toFixed(1)}/100` : "Chưa đánh giá"}</UiText>
                    </div>
                  </div>
                  <div className="feedback-score-item">
                    <div className="feedback-score-label"><UiText text={"Trôi chảy"} /></div>
                    <div className="feedback-score-value">
                      <UiText>{fb.assessment_contract?.status === "completed" && fb.fluency_score != null ? `${Number(fb.fluency_score).toFixed(1)}/100` : "Chưa đánh giá"}</UiText>
                    </div>
                  </div>
                </div>

                {(() => {
                  let audioUrl = fb.audio_url;
                  if (audioUrl) {
                    audioUrl = normalizeAudioUrl(audioUrl);
                  }
                  return audioUrl ? (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}><UiText text={"Audio nhận xét"} /></div>
                      <AuthenticatedMedia as="audio" src={audioUrl} controls className="feedback-audio-control" preload="metadata" />
                    </div>
                  ) : null;
                })()}

                {(() => {
                  let feedbackText = fb.feedback;
                  if (typeof feedbackText === "string") {
                    try {
                      const parsed = JSON.parse(feedbackText);
                      if (parsed && typeof parsed === "object" && parsed.text) {
                        feedbackText = parsed.text;
                      } else if (typeof parsed === "string") {
                        feedbackText = parsed;
                      }
                    } catch (e) {}
                  }
                  return feedbackText ? (
                    <div className="feedback-mentor-review">
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}><UiText text={"Nhận xét"} /></div>
                      <div style={{ fontSize: 14 }}>
                        <UiText>{feedbackText}</UiText>
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Hiển thị transcript và đánh giá chi tiết */}
                <UiText>{renderSubmissionDetail(fb)}</UiText>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal Report Mentor */}
      {showReportModal && (
        <div className="feedback-report-modal">
          <div className="feedback-report-modal-content">
            <h3><UiText text={"Báo cáo Mentor"} /></h3>
            {checkingReport ? (
              <p><UiText text={"Đang kiểm tra..."} /></p>
            ) : !reportStatus.canReport ? (
              <div style={{ padding: 12, background: "#fef3c7", borderRadius: 6, marginBottom: 12 }}>
                <strong><UiText text={"⚠️ Bạn chỉ có thể report lại sau 24 giờ."} /></strong>
                <p><UiText text={"Còn"} />{" "}<UiText>{reportStatus.hoursRemaining}</UiText>{" "}<UiText text={"giờ nữa."} /></p>
              </div>
            ) : null}
            
            <label className="label"><UiText text={"Nội dung báo cáo"} /></label>
            <textarea
              rows="4"
              value={reportContent}
              onChange={e => setReportContent(e.target.value)}
              className="input"
              placeholder={englishText("Mô tả vấn đề bạn gặp phải với mentor...")}
              disabled={!reportStatus.canReport}
            />

            <label className="label" style={{ marginTop: 12 }}><UiText text={"Hình ảnh (nếu có)"} /></label>
            <input
              type="file"
              accept="image/*"
              onChange={e => setReportImage(e.target.files?.[0] || null)}
              style={{ marginBottom: 12 }}
              disabled={!reportStatus.canReport}
            />
            {reportImage && (
              <div style={{ marginTop: 8, marginBottom: 12 }}>
                <img src={URL.createObjectURL(reportImage)} alt="Preview" style={{ maxWidth: "200px", maxHeight: "200px" }} />
                <button onClick={() => setReportImage(null)} style={{ marginLeft: 8 }}><UiText text={"Xóa"} /></button>
              </div>
            )}

            <label className="label"><UiText text={"Video (nếu có)"} /></label>
            <input
              type="file"
              accept="video/*"
              onChange={e => setReportVideo(e.target.files?.[0] || null)}
              style={{ marginBottom: 12 }}
              disabled={!reportStatus.canReport}
            />
            {reportVideo && (
              <div style={{ marginTop: 8, marginBottom: 12 }}>
                <video src={URL.createObjectURL(reportVideo)} controls style={{ maxWidth: "300px", maxHeight: "200px" }} />
                <button onClick={() => setReportVideo(null)} style={{ marginLeft: 8 }}><UiText text={"Xóa"} /></button>
              </div>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button
                className="btn-submit"
                onClick={handleReportMentor}
                disabled={reporting || !reportContent.trim() || !reportStatus.canReport}
              >
                <UiText>{reporting ? "Đang gửi..." : "Gửi báo cáo"}</UiText>
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setShowReportModal(false);
                  setReportContent("");
                  setReportImage(null);
                  setReportVideo(null);
                }}
              >{" "}<UiText text={"Hủy"} />{" "}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
