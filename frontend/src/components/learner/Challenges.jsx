// src/components/learner/Challenges.jsx
import React, { useEffect, useState, useRef } from "react";
import { getAuth } from "../../utils/auth";
import api from "../../api";
import Modal from "../common/Modal";
import { useAuth } from "../../context/AuthContext";
import "../../styles/challenge.css";
import ChallengeDetail from "./ChallengeDetail";
import { FiStar, FiUser } from "react-icons/fi";

export default function Challenges() {
  const auth = getAuth();
  const {  } = useAuth();
  const userId = auth?.user?.id ?? auth?.user?._id ?? auth?.user?.user_id ?? null;
  const startedRef = useRef(false);

  const [learnerId, setLearnerId] = useState(null);
  const [mentorId, setMentorId] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailChallenge, setDetailChallenge] = useState(null);

  const [query, setQuery] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [mentorOnly, setMentorOnly] = useState(false);
  const [bookmarked, setBookmarked] = useState(new Set());
  const [favoriteChallenges, setFavoriteChallenges] = useState([]);
  const [showFavorites, setShowFavorites] = useState(false);

  useEffect(() => {
    if (!userId) return setLoading(false);
    if (startedRef.current) return;
    startedRef.current = true;

    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const lres = await api.get(`/learners/by-user/${userId}`);
        const learnerObj = lres.data?.learner ?? lres.data ?? null;
        const lid = learnerObj?.id ?? learnerObj?.learner_id ?? null;
        if (!mounted) return;
        setLearnerId(lid);

        if (!lid) return setChallenges([]);

        try {
          const mres = await api.get(`/learners/${lid}/mentor`);
          setMentorId(mres.data?.mentor_id ?? null);
        } catch {
          setMentorId(null);
        }

        // Load all challenges
        const cres = await api.get(`/challenges`);
        const arr = cres.data?.challenges ?? cres.data ?? [];
        const minimal = Array.isArray(arr)
          ? arr.map(c => ({
              id: c.id ?? c._id,
              title: c.title ?? "",
              level: c.level ?? "",
              description: stripHtml(c.description ?? ""),
              type: c.type ?? "",
              mentor_id: c.mentor_id ?? null,
              mentor_name: c.mentor_name ?? null,
              created_at: c.created_at,
              _color: pickColor(String(c.id ?? c._id))
            }))
          : [];
        if (!mounted) return;
        setChallenges(minimal);

        // Load bookmarked challenges
        try {
          const bookmarkedRes = await api.get(`/learners/${lid}/challenges/bookmarked`);
          const bookmarkedArr = bookmarkedRes.data?.challenges ?? bookmarkedRes.data ?? [];
          const bookmarkedIds = new Set(bookmarkedArr.map(c => c.id ?? c.challenge_id));
          if (mounted) {
            setBookmarked(bookmarkedIds);
            setFavoriteChallenges(minimal.filter(c => bookmarkedIds.has(c.id)));
          }
        } catch (err) {
          console.warn("Could not load bookmarked challenges", err);
        }
      } catch (err) {
        console.error("Load challenges error", err);
        setChallenges([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; startedRef.current = false; };
  }, [userId]);

  function pickColor(seed) {
    const colors = ["#4F46E5","#EC4899","#10B981","#F59E0B","#3B82F6","#8B5CF6","#F43F5E","#06B6D4"];
    const idx = [...seed].reduce((a,ch) => (a + ch.charCodeAt(0)), 0) % colors.length;
    return colors[idx];
  }

  function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || div.innerText || "").trim();
  }

  const filtered = challenges.filter(c => {
    if (mentorOnly && mentorId && c.mentor_id !== mentorId) return false;
    if (filterLevel && c.level !== filterLevel) return false;
    if (query && !c.title.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const displayChallenges = showFavorites ? favoriteChallenges : filtered;

  function openDetail(ch) {
    setDetailChallenge(ch);
  }

  async function toggleBookmark(challengeId) {
    if (!learnerId) return;
    const prev = new Set(bookmarked);
    const next = new Set(prev);
    const isBookmarked = prev.has(challengeId);
    isBookmarked ? next.delete(challengeId) : next.add(challengeId);
    setBookmarked(next);

    // Update favorite challenges list
    if (isBookmarked) {
      setFavoriteChallenges(prev => prev.filter(c => c.id !== challengeId));
    } else {
      const challenge = challenges.find(c => c.id === challengeId);
      if (challenge) {
        setFavoriteChallenges(prev => [...prev, challenge]);
      }
    }

    try {
      if (isBookmarked) {
        await api.delete(`/learners/${learnerId}/challenges/${challengeId}/bookmark`);
      } else {
        await api.post(`/learners/${learnerId}/challenges/${challengeId}/bookmark`);
      }
    } catch (err) {
      console.error("toggleBookmark error", err);
      setBookmarked(prev);
      // Revert favorite challenges
      if (isBookmarked) {
        const challenge = challenges.find(c => c.id === challengeId);
        if (challenge) {
          setFavoriteChallenges(prev => [...prev, challenge]);
        }
      } else {
        setFavoriteChallenges(prev => prev.filter(c => c.id !== challengeId));
      }
    }
  }

  const content = (
    <div className="challenge-page">
      <div className="page-header">
        <h2 className="page-title">Danh sách Challenges</h2>
        <button
          className={`favorite-toggle ${showFavorites ? "active" : ""}`}
          onClick={() => setShowFavorites(!showFavorites)}
        >
          <FiStar style={{ marginRight: "6px" }} />
          {showFavorites ? "Tất cả" : "Yêu thích"} ({bookmarked.size})
        </button>
      </div>

      <div className="challenge-toolbar">
        <div className="search">
          <input
            placeholder="Tìm theo tên challenge..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
          <option value="">Tất cả level</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>

        {mentorId && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={mentorOnly}
              onChange={e => setMentorOnly(e.target.checked)}
            />
            Challenge giảng viên của bạn
          </label>
        )}
      </div>

      {loading ? (
        <div className="challenge-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="challenge-card skeleton-card">
              <div className="skeleton-thumb skeleton-animate" />
              <div className="skeleton-line skeleton-animate skeleton-medium" />
              <div className="skeleton-line skeleton-animate skeleton-small" />
            </div>
          ))}
        </div>
      ) : displayChallenges.length === 0 ? (
        <div className="empty-state">
          {showFavorites 
            ? "Bạn chưa có challenge yêu thích nào. Hãy đánh dấu ⭐ để thêm vào danh sách yêu thích!" 
            : "Không có challenge phù hợp với bộ lọc hiện tại."}
        </div>
      ) : (
        <div className="challenge-grid">
          {displayChallenges.map(c => {
            const isBookmarked = bookmarked.has(c.id);
            return (
              <div key={c.id} className="challenge-card">
                <div
                  className="challenge-thumb"
                  style={{ background: `linear-gradient(135deg, ${c._color} 0%, ${c._color}33 100%)` }}
                >
                  <div className="challenge-badges">
                    {isBookmarked && (
                      <span className="challenge-badge favorite-badge">
                        ⭐ Yêu thích
                      </span>
                    )}
                    <span 
                      className="challenge-badge" 
                      style={{
                        background: c.level === "easy" ? "#10b981" :
                                   c.level === "medium" ? "#f59e0b" :
                                   c.level === "hard" ? "#ef4444" : "#6b7280",
                        color: "#fff"
                      }}
                    >
                      {c.level || "-"}
                    </span>
                    {c.type && (
                      <span className="challenge-badge type-badge">
                        {c.type}
                      </span>
                    )}
                    {mentorId && c.mentor_id === mentorId && (
                      <span className="challenge-badge mentor-badge">
                        Của giảng viên
                      </span>
                    )}
                  </div>
                </div>

                <div className="challenge-content">
                  <div className="challenge-title">{c.title}</div>
                  <div className="challenge-desc">{c.description}</div>
                  {c.mentor_name && (
                    <div className="challenge-mentor">
                      <FiUser size={14} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                      {c.mentor_name}
                    </div>
                  )}
                </div>

                <div className="challenge-footer">
                  <button className="btn-view" onClick={() => openDetail(c)}>
                    Xem chi tiết
                  </button>
                  <button 
                    className={`btn-mark ${isBookmarked ? "marked" : ""}`}
                    onClick={() => toggleBookmark(c.id)}
                    title={isBookmarked ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
                  >
                    <FiStar style={{ color: isBookmarked ? "#F59E0B" : "#9CA3AF" }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detailChallenge && (
        <Modal title={detailChallenge.title} onClose={() => setDetailChallenge(null)}>
          <ChallengeDetail
            id={detailChallenge.id}
            learnerId={learnerId}
            onClose={() => setDetailChallenge(null)}
          />
        </Modal>
      )}
    </div>
  );

  return (
    <div className="challenges">
      {content}
    </div>
  );
}
