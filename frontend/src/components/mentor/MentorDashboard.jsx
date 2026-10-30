import { UiText } from '../../i18n/UiLanguage.jsx';
import MentorSupportPanel from "./MentorSupportPanel";
// frontend/src/components/mentor/MentorDashboard.jsx
import React, { useState, useEffect } from "react";
import { getAuth } from "../../utils/auth";
import api from "../../api";
import OnlineClasses from '../common/OnlineClasses';
import { FiUsers } from "react-icons/fi";
import { Link } from "react-router-dom";
import "../../styles/mentor-dashboard.css";

export default function MentorDashboard() {
  const auth = getAuth();
  const userId = auth?.user?.id ?? auth?.user?._id ?? auth?.user?.user_id ?? null;
  const [mentorId, setMentorId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);

  useEffect(() => {
    const controller=new AbortController(),{signal}=controller;
    setMentorId(null);setStats(null);setLoading(true);setError('');
    async function load(){try{
      if(!userId)throw Error('Missing account');
      const res=await api.get(`/mentors/by-user/${userId}`,{signal});
      const id=res.data?.mentor_id ?? res.data?.id;
      if(!/^[1-9]\d*$/.test(String(id)))throw Error('Invalid Mentor');
      const summary=await api.get(`/mentors/${id}/dashboard/stats`,{signal});
      if(signal.aborted)return;
      if(!Number.isSafeInteger(summary.data?.stats?.totalLearners)||summary.data.stats.totalLearners<0)throw Error('Invalid stats');
      setMentorId(id);setStats(summary.data.stats);
    }catch{if(!signal.aborted)setError('Không thể tải thông tin Mentor. Vui lòng thử lại.');}
    finally{if(!signal.aborted)setLoading(false);}}
    load();return()=>controller.abort();
  }, [userId,attempt]);

  if(error)return <div className="mentor-dashboard"><p role="alert"><UiText>{error}</UiText></p><button onClick={()=>setAttempt(value=>value+1)}><UiText text={"Thử tải lại"} /></button></div>;
  if (loading) {
    return (
      <div className="mentor-dashboard">
        <div className="loading-state"><UiText text={"Đang tải..."} /></div>
      </div>
    );
  }

  if (!mentorId) {
    return (
      <div className="mentor-dashboard">
        <div className="error-state"><UiText text={"Không tìm thấy thông tin mentor"} /></div>
      </div>
    );
  }

  return (
    <div className="mentor-dashboard">
      <div className="dashboard-header">
        <h1><UiText text={"Learning support"} /></h1>
        <p><UiText text={"Theo dõi học viên được phân công và hỗ trợ khi cần; AI tiếp tục dẫn dắt hoạt động học tập."} /></p>
      </div>

      {/* Stats Cards */}
      <div className="dashboard-stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <FiUsers size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value"><UiText>{stats.totalLearners}</UiText></div>
            <div className="stat-label"><UiText text={"Học viên"} /></div>
          </div>
        </div>

      </div>

      <MentorSupportPanel mentorId={mentorId} />

      <div className="dashboard-grid">
        {/* Left Column: Calendar */}
        <div className="dashboard-left-column">
          <div className="dashboard-section calendar-section">
            <OnlineClasses compact />
          </div>
        </div>

        {/* Right Column: Support actions */}
        <div className="dashboard-right-column">
          <div className="dashboard-section">
            <div className="section-header">
              <h2><UiText text={"Hỗ trợ học tập"} /></h2>
            </div>
            <p><UiText text={"AI cung cấp phản hồi và hướng dẫn học tập trực tiếp. Mentor có thể xem kết quả của học viên được phân công và hỗ trợ qua cộng đồng khi cần."} /></p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link to="/mentor/assessment" className="btn-review"><UiText text={"Xem kết quả AI"} /></Link>
              <Link to="/mentor/communicate" className="btn-review"><UiText text={"Mở cộng đồng hỗ trợ"} /></Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
