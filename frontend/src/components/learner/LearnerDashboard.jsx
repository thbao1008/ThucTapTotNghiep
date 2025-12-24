// frontend/src/components/learner/LearnerDashboard.jsx
import React, { useState, useEffect } from "react";
import { getAuth } from "../../utils/auth";
import { useAuth } from "../../context/AuthContext";
import api from "../../api";
import ProgressAnalytics from "./ProgressAnalytics";
import Calendar from "../common/Calendar";
import { FiCheckCircle, FiAlertCircle, FiTarget } from "react-icons/fi";
import "../../styles/learner-dashboard.css";

export default function LearnerDashboard() {
  const auth = getAuth();
  const { } = useAuth();
  const userId = auth?.user?.id ?? auth?.user?._id ?? auth?.user?.user_id ?? null;
  const [learnerId, setLearnerId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const lres = await api.get(`/learners/by-user/${userId}`);
        const learnerObj = lres.data?.learner ?? lres.data ?? null;
        const lid = learnerObj?.id ?? learnerObj?.learner_id ?? null;
        setLearnerId(lid);
      } catch (err) {
        console.error("Error loading learner:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [userId]);

  useEffect(() => {
    if (!learnerId) return;

    async function loadAnalytics() {
      try {
        setLoadingAnalytics(true);
        const res = await api.get(`/learners/${learnerId}/progress-analytics`);
        setAnalytics(res.data);
      } catch (err) {
        console.error("Error loading analytics:", err);
      } finally {
        setLoadingAnalytics(false);
      }
    }

    loadAnalytics();
  }, [learnerId]);

  if (loading) {
    return (
      <div className="learner-dashboard">
        <div className="loading-state">Đang tải...</div>
      </div>
    );
  }

  if (!learnerId) {
    return (
      <div className="learner-dashboard">
        <div className="error-state">Không tìm thấy thông tin học viên</div>
      </div>
    );
  }

  return (
    <div className="learner-dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Xem tiến độ học tập và lịch học của bạn</p>
      </div>

      <div className="dashboard-grid">
        {/* Left Column: Progress Analytics */}
        <div className="dashboard-left-column">
          <div className="dashboard-section analytics-section">
            <div className="section-header">
              <h2>Phân tích tiến độ</h2>
              <p className="section-subtitle">Xem chi tiết tiến độ học tập và số liệu thống kê</p>
            </div>
            <div className="analytics-content">
              {loadingAnalytics ? (
                <div className="loading-state">Đang tải dữ liệu phân tích...</div>
              ) : analytics ? (
                <ProgressAnalytics analytics={analytics} hideRecommendations={true} />
              ) : (
                <div className="empty-state">Chưa có dữ liệu phân tích. Hãy bắt đầu luyện tập!</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Calendar + Recommendations */}
        <div className="dashboard-right-column">
          {/* Calendar */}
          <div className="dashboard-section calendar-section">
            <Calendar learnerId={learnerId} />
          </div>

          {/* AI Recommendations */}
          {analytics && analytics.recommendations && (
            <div className="dashboard-section recommendations-section">
              <div className="section-header">
                <h2>Đánh giá & Gợi Ý từ AI</h2>
                <p className="section-subtitle">Nhận gợi ý cải thiện từ AI dựa trên tiến độ học tập</p>
              </div>
              <div className="recommendations-content">
                {analytics.recommendations.overall_assessment && (
                  <div className="assessment-box">
                    <p>{analytics.recommendations.overall_assessment}</p>
                  </div>
                )}

                {Array.isArray(analytics.recommendations.strengths) && analytics.recommendations.strengths.length > 0 && (
                  <div className="recommendations-group">
                    <h4>
                      <FiCheckCircle className="icon-success" /> Điểm Mạnh
                    </h4>
                    <ul className="recommendations-list">
                      {analytics.recommendations.strengths.map((strength, idx) => (
                        <li key={idx}>{strength}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(analytics.recommendations.improvements_needed) && analytics.recommendations.improvements_needed.length > 0 && (
                  <div className="recommendations-group">
                    <h4>
                      <FiAlertCircle className="icon-warning" /> Cần Cải Thiện
                    </h4>
                    <ul className="recommendations-list">
                      {analytics.recommendations.improvements_needed.map((improvement, idx) => (
                        <li key={idx}>{improvement}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(analytics.recommendations.recommendations) && analytics.recommendations.recommendations.length > 0 && (
                  <div className="recommendations-group">
                    <h4>
                      <FiTarget className="icon-primary" /> Gợi Ý Cải Thiện
                    </h4>
                    <ul className="recommendations-list">
                      {analytics.recommendations.recommendations.map((rec, idx) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(analytics.recommendations.priority_areas) && analytics.recommendations.priority_areas.length > 0 && (
                  <div className="recommendations-group">
                    <h4>
                      <FiTarget className="icon-primary" /> Lĩnh Vực Ưu Tiên
                    </h4>
                    <ul className="recommendations-list">
                      {analytics.recommendations.priority_areas.map((area, idx) => (
                        <li key={idx}>{area}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
