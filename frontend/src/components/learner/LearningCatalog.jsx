import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
import { useEffect, useState } from "react";
import { getAuth } from "../../utils/auth";
import api from "../../api";
import Modal from "../common/Modal";
import PDFPreview from "../common/PDFPreview";
import { normalizeVideoUrl } from "../../utils/apiHelpers";
import { AuthenticatedMedia } from "../../utils/authenticatedMedia.jsx";
import "../../styles/catalog.css";
import { FiFileText, FiVideo } from "react-icons/fi";

export default function LearningCatalog() {
  const auth = getAuth();
  const userId = auth?.user?.id ?? auth?.user?._id ?? auth?.user?.user_id;

  const [learnerId, setLearnerId] = useState(null);
  const [mentorId, setMentorId] = useState(null);
  const [mentorName, setMentorName] = useState("");
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadingMentorName, setLoadingMentorName] = useState(true);
  const [selectedResource, setSelectedResource] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(''); setResources([]); setMentorId(null); setMentorName(''); setLoadingMentorName(true);
    async function load() {
      try {
        if (!userId) throw Error('Missing account');

        // 1. Lấy learnerId từ userId
        const learnerRes = await api.get(`/learners/by-user/${userId}`, {signal:controller.signal});
        const lid = learnerRes.data?.learner?.id;
        setLearnerId(lid);
        if (!lid) {
          setLoading(false);
          setLoadingMentorName(false);
          return;
        }

        // 2. Lấy mentorId từ learnerId
        const mentorRes = await api.get(`/learners/${lid}/mentor`, {signal:controller.signal});
        const mid = mentorRes.data?.mentor_id;
        setMentorId(mid);
        if (!mid) {
          setLoading(false);
          setLoadingMentorName(false);
          return;
        }

        // 3 + 4. Lấy song song: thông tin giảng viên và tài liệu (chỉ lấy tài liệu đã publish)
        const [mentorInfo, res] = await Promise.all([
          api.get(`/mentors/${mid}`, {signal:controller.signal}),
          api.get(`/mentors/${mid}/resources/published`, {signal:controller.signal})
        ]);

        // Tùy vào response BE, lấy đúng name:
        const nameFromMentorObj =
          mentorInfo.data?.mentor?.name ??
          mentorInfo.data?.name ?? // phòng trường hợp BE trả trực tiếp
          "";

        setMentorName(nameFromMentorObj);
        setResources(res.data?.resources || []);
      } catch (err) {
        if (!controller.signal.aborted) setLoadError('Unable to load resources. Please try again.');
      } finally {
        if (!controller.signal.aborted) {setLoading(false); setLoadingMentorName(false);}
      }
    }

    load();
    return () => controller.abort();
  }, [userId, loadAttempt]);

  const filtered = resources.filter(r =>
    (r.title || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openPreview = (r) => setSelectedResource(r);

  if (loading) return <p role="status"><UiText text="Đang tải tài liệu..." /></p>;
  if (loadError) return <div className="learner-page"><p role="alert"><UiText>{loadError}</UiText></p><button className="btn" onClick={()=>setLoadAttempt(n=>n+1)}><UiText text="Thử tải lại" /></button></div>;

  return (
    <div className="learner-page">
      <h2><UiText text={"Kho tài liệu"} /></h2>

      {mentorId === null ? (
        <p className="subtitle"><UiText text={"Bạn chưa được gán giảng viên nào"} /></p>
      ) : loadingMentorName ? (
        <p className="subtitle"><UiText text={"Đang tải tên giảng viên..."} /></p>
      ) : mentorName ? (
        <p className="subtitle">{" "}<UiText text={"Tài liệu học tập của giảng viên:"} />{" "}<strong><UiText>{mentorName}</UiText></strong>
        </p>
      ) : (
        <p className="subtitle"><UiText text={"Không lấy được tên giảng viên"} /></p>
      )}

      <input
        type="text"
        className="search-input"
        placeholder={englishText("Tìm kiếm theo tên tài liệu...")}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {loading ? (
        <p><UiText text={"Đang tải tài liệu..."} /></p>
      ) : (
        <div className="resources-grid">
          {filtered.length === 0 ? (
            <div className="empty-state"><UiText text={"Không tìm thấy tài liệu phù hợp"} /></div>
          ) : (
            filtered.map((r) => (
              <div key={r.id} className="resource-card" onClick={() => openPreview(r)}>
                <div className="resource-preview">
                  {r.type === "pdf" ? <FiFileText size={40} /> : <FiVideo size={40} />}
                </div>
                <div className="resource-title">{r.title}</div>
                <div className="resource-desc">{r.description}</div>
              </div>
            ))
          )}
        </div>
      )}

      {selectedResource && (
        <Modal 
          title={selectedResource.type === "pdf" ? null : selectedResource.title}
          onClose={() => setSelectedResource(null)}
          className={selectedResource.type === "pdf" ? "resource-preview-modal" : ""}
        >
          {selectedResource.type === "pdf" ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ flex: 1, minHeight: "600px" }}>
                <PDFPreview
                  url={selectedResource.file_url}
                  title={selectedResource.title}
                  onClose={() => setSelectedResource(null)}
                />
              </div>
              {selectedResource.description && (
                <p style={{ marginTop: "10px", flexShrink: 0, padding: "12px", background: "#f9fafb", borderRadius: "6px" }}>
                  {selectedResource.description}
                </p>
              )}
            </div>
          ) : selectedResource.type === "video" ? (
            <div>
              <AuthenticatedMedia as="video"
                src={normalizeVideoUrl(selectedResource.file_url)} 
                controls 
                width="100%" 
                style={{ 
                  maxHeight: "70vh",
                  borderRadius: "8px",
                  backgroundColor: "#000"
                }}
              />
              {selectedResource.description && (
                <p style={{ marginTop: "10px" }}>{selectedResource.description}</p>
              )}
            </div>
          ) : (
            <div>
              <p><UiText text={"Không thể xem trước tài liệu này."} /></p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
