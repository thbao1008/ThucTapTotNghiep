import { UiText } from '../../i18n/UiLanguage.jsx';
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getAuth } from "../../utils/auth";
import api from "../../api";
import ChallengeDetail from "./ChallengeDetail";

// The modal receives these props from Challenges; the URL route must resolve them.
export default function ChallengeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const user = auth?.user ?? getAuth()?.user;
  const userId = user?.id ?? user?._id ?? user?.user_id;
  const validId = /^\d+$/.test(id ?? "") && Number(id) > 0 && Number(id) <= 2_147_483_647;
  const [lookup, setLookup] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!validId || !userId) return;
    const controller = new AbortController();
    setLookup({ userId, loading: true });
    async function load() {
      try {
        const { data } = await api.get(`/learners/by-user/${userId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const learner = data?.learner ?? data;
        const learnerId = Number(learner?.id ?? learner?.learner_id);
        if (!Number.isSafeInteger(learnerId) || learnerId <= 0 ||
            (learner?.user_id != null && String(learner.user_id) !== String(userId))) {
          throw new Error("Thông tin người học không hợp lệ.");
        }
        setLookup({ userId, learnerId });
      } catch (error) {
        if (!controller.signal.aborted) setLookup({ userId, error: error.response?.data?.message || "Không tải được thông tin người học. Hãy thử lại." });
      }
    }
    load();
    return () => controller.abort();
  }, [userId, validId, retry]);
  if (!validId) return <p role="alert"><UiText text={"Challenge không hợp lệ."} /></p>;
  if (!userId) return <p role="alert"><UiText text={"Vui lòng đăng nhập để xem bài nộp."} /></p>;
  if (!lookup || lookup.userId !== userId || lookup.loading) return <p><UiText text={"Đang tải thông tin người học..."} /></p>;
  if (lookup.error) return <div role="alert"><UiText>{lookup.error}</UiText> <button onClick={() => setRetry(value => value + 1)}><UiText text={"Thử lại"} /></button></div>;
  return <ChallengeDetail id={Number(id)} learnerId={lookup.learnerId} onClose={() => navigate("/learn/challenges")} />;
}
