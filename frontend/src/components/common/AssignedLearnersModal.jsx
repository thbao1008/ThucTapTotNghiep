import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import React, { useEffect, useState } from "react";
import api from "../../api.js";
import Modal from "./Modal.jsx";
import UserForPage from "../admin/UserForPage.jsx";

export default function AssignedLearnersModal({ mentorId, onClose }) {
  const [learners, setLearners] = useState([]);
  const [selectedLearnerId, setSelectedLearnerId] = useState(null);
  const [realMentorId, setRealMentorId] = useState(null);

  useEffect(() => {
    if (!mentorId) return;
    const fetchLearners = async () => {
      try {
        const mentorRes = await api.get(`/mentors/by-user/${mentorId}`);
        const mentorIdValue = mentorRes.data.mentor_id || mentorRes.data.id;
        setRealMentorId(mentorIdValue);

        const learnersRes = await api.get(`/admin/mentors/${mentorIdValue}/learners`);
        setLearners(learnersRes.data.learners || []);
      } catch (err) {
        console.error("❌ Lỗi load learners:", err);
      }
    };
    fetchLearners();
  }, [mentorId]);

  return (
    <Modal title={englishText("Danh sách học viên được bổ nhiệm")} onClose={onClose}>
      <table className="table">
        <thead>
          <tr>
            <th><UiText text={"STT"} /></th>
            <th><UiText text={"Tên học viên"} /></th>
            <th><UiText text={"Email"} /></th>
            <th><UiText text={"SĐT"} /></th>
            <th><UiText text={"Thao tác"} /></th>
          </tr>
        </thead>
        <tbody>
          {learners.map((l, idx) => (
            <tr key={l.learner_id || l.id}>
              <td><UiText>{idx + 1}</UiText></td>
              <td>{l.learner_name || l.name}</td>
              <td>{l.email}</td>
              <td>{l.phone}</td>
              <td>
                <button 
                  onClick={() => setSelectedLearnerId(l.user_id)}
                  style={{ marginRight: "8px" }}
                >{" "}<UiText text={"Xem / Đổi Mentor"} />{" "}</button>

              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedLearnerId && (
        <UserForPage
          userId={selectedLearnerId}
          onClose={() => setSelectedLearnerId(null)}
        />
      )}
    </Modal>
  );
}
