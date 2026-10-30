import { UiOption } from '../i18n/UiLanguage.jsx';
import { englishText } from '../i18n/uiLanguage.js';
import { UiText } from '../i18n/UiLanguage.jsx';
import React, { useState, useCallback, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getAuth, saveAuth, clearAuth } from "../utils/auth";
import userAvatar from "../assets/icons/users.png";
import api from "../api";
import {useAuth} from '../context/AuthContext.jsx';
import "../styles/profile.css";
import Cropper from "react-easy-crop";
import Modal from "react-modal";

// Set app element for react-modal
if (typeof window !== "undefined") {
  Modal.setAppElement("#root");
}

export default function ProfilePage() {
  const auth = getAuth();
  const currentUser = auth?.user;
  const navigate = useNavigate();
  const {logout}=useAuth();
  
  // Lấy user ID từ current user
  const userId = currentUser?.id || currentUser?._id || currentUser?.user_id;
  const role = currentUser?.role?.toLowerCase() || "";
  
  const [user, setUser] = useState(currentUser || {});
  const [bio, setBio] = useState("");
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState("");
  const [savingBio, setSavingBio] = useState(false);
  const [bioNotice, setBioNotice] = useState('');
  const [mentorId, setMentorId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(user?.avatar_url || user?.avatar || null);

  // cropper state
  const [showCropper, setShowCropper] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // password state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  // security question state
  const [showSecurityQuestion, setShowSecurityQuestion] = useState(false);
  const [currentSecurityQuestion, setCurrentSecurityQuestion] = useState("");
  const [hasSecurityQuestion, setHasSecurityQuestion] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [newSecurityAnswer, setNewSecurityAnswer] = useState("");
  const [oldSecurityAnswer, setOldSecurityAnswer] = useState("");
  const [savingSecurityQuestion, setSavingSecurityQuestion] = useState(false);
  const [securityQuestionError, setSecurityQuestionError] = useState("");

  // Load user data
  useEffect(() => {
    async function loadUserData() {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        // Load user info (dùng route /users/me thay vì /admin/users/:id)
        const userRes = await api.get(`/users/me`);
        if (userRes.data?.user) {
          const userData = userRes.data.user;
          setUser(userData);
          // Set preview từ avatar_url hoặc avatar, ưu tiên avatar_url
          const avatarUrl = userData.avatar_url || userData.avatar || null;
          setPreview(avatarUrl);
          // Cập nhật vào auth để lưu vào localStorage
          if (avatarUrl) {
            saveAuth({ ...auth, user: { ...auth.user, avatar_url: avatarUrl, avatar: avatarUrl } });
          }
          
          // Load bio nếu là mentor
          if (userRes.data.user.role?.toLowerCase() === "mentor") {
            try {
              const mentorRes = await api.get(`/mentors/by-user/${userId}`);
              console.log("Mentor response:", mentorRes.data);
              // Backend trả về: { mentor_id: ..., bio: ..., name: ..., ... }
              const mentorIdFromRes = mentorRes.data?.mentor_id;
              if (mentorIdFromRes) {
                console.log("Setting mentorId:", mentorIdFromRes);
                setMentorId(mentorIdFromRes);
                const mentorBio = mentorRes.data?.bio;
                if (mentorBio) {
                  setBio(mentorBio);
                  setBioInput(mentorBio);
                } else {
                  // Nếu chưa có bio, set empty string
                  setBio("");
                  setBioInput("");
                }
              } else {
                console.error("No mentor_id in response:", mentorRes.data);
              }
            } catch (err) {
              console.error("Error loading mentor bio:", err);
              console.error("Error details:", err.response?.data);
            }
          }
          
          // Load security question (chỉ mentor và learner)
          if (userRes.data.user.role?.toLowerCase() === "mentor" || userRes.data.user.role?.toLowerCase() === "learner") {
            try {
              const securityRes = await api.get("/auth/security-question");
              if (securityRes.data?.security_question) {
                setCurrentSecurityQuestion(securityRes.data.security_question);
                setHasSecurityQuestion(true);
              } else {
                setHasSecurityQuestion(false);
              }
            } catch (err) {
              console.error("Error loading security question:", err);
              setHasSecurityQuestion(false);
            }
          }
        }
      } catch (err) {
        console.error("Error loading user data:", err);
      } finally {
        setLoading(false);
      }
    }
    
    loadUserData();
  }, [userId]);

  // 👉 Nếu chưa login thì redirect
  if (!currentUser) return <Navigate to="/login" replace />;

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(URL.createObjectURL(file));
      setShowCropper(true);
    }
  }

  const onCropComplete = useCallback((_, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  async function getCroppedImg(imageSrc, crop) {
    const image = new Image();
    image.src = imageSrc;
    await new Promise((resolve) => (image.onload = resolve));

    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg");
    });
  }

  async function handleConfirm() {
    try {
      const blob = await getCroppedImg(selectedImage, croppedAreaPixels);
      const formData = new FormData();
      formData.append("avatar", blob, "avatar.jpg");

      const res = await api.post(`/users/me/avatar`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data?.user) {
        const avatarUrl = res.data.user.avatar_url || res.data.user.avatar;
        setPreview(avatarUrl);
        setUser({ ...user, avatar_url: avatarUrl, avatar: avatarUrl });
        // Cập nhật vào auth và localStorage
        const updatedUser = { ...auth.user, avatar_url: avatarUrl, avatar: avatarUrl };
        saveAuth({ ...auth, user: updatedUser });
      }
      setShowCropper(false);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi cập nhật ảnh");
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setMessage("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage("Vui lòng nhập đầy đủ thông tin.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("Mật khẩu mới và xác nhận không khớp.");
      return;
    }

    try {
      const res = await api.post("/auth/change-password", {
        oldPassword: currentPassword,
        newPassword: newPassword,
      });

      setMessage("Đổi mật khẩu thành công ✅");
      setShowChangePassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (res.data?.requiresLogin) {
        await logout({ skipServer: true });
        navigate('/login', { replace: true });
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Đổi mật khẩu thất bại");
    }
  }

  async function handleSaveBio() {
    console.log("handleSaveBio called, mentorId:", mentorId);
    if (!mentorId) {
      console.error("No mentorId available, trying to reload...");
      // Thử reload mentorId
      try {
        const userId = currentUser?.id || currentUser?._id || currentUser?.user_id;
        if (userId) {
          const mentorRes = await api.get(`/mentors/by-user/${userId}`);
          const newMentorId = mentorRes.data?.mentor_id;
          if (newMentorId) {
            console.log("Reloaded mentorId:", newMentorId);
            setMentorId(newMentorId);
            // Retry save
            await saveBioWithId(newMentorId);
            return;
          }
        }
      } catch (err) {
        console.error("Error reloading mentorId:", err);
      }
      alert(englishText("Không tìm thấy thông tin mentor. Vui lòng tải lại trang."));
      return;
    }
    
    await saveBioWithId(mentorId);
  }

  async function saveBioWithId(id) {
    if (savingBio) return;
    setSavingBio(true);
    setBioNotice('');
    try {
      const res = await api.patch(`/mentors/${id}/profile`, {
        bio: bioInput,
      });
      setBio(res.data.mentor.bio);
      setEditingBio(false);
      setBioNotice('Cập nhật giới thiệu thành công ✅');
    } catch (err) {
      setBioNotice(err?.response?.data?.message || "Lỗi khi cập nhật giới thiệu");
    } finally {
      setSavingBio(false);
    }
  }

  async function handleChangeSecurityQuestion(e) {
    e.preventDefault();
    // TODO: Implement security question update when schema is ready
    alert(englishText("Tính năng đổi câu hỏi bảo mật đang được phát triển"));
  }

  if (loading) {
    return <div className="profile-fullscreen"><p><UiText text={"Đang tải..."} /></p></div>;
  }

  return (
    <div className="profile-fullscreen">
      <h2><UiText text={"Thông tin cá nhân"} /></h2>

      <div className="profile-container">
        {/* Avatar + nút cập nhật */}
        <div className="profile-avatar">
          <img src={preview || userAvatar} alt={englishText(user.name || "User")} />
          <label className="upload-btn">{" "}<UiText text={"Đổi avatar"} />{" "}<input type="file" accept="image/*" onChange={handleFileChange} />
          </label>
        </div>

        {/* Modal cropper */}
        <Modal 
          isOpen={showCropper} 
          onRequestClose={() => setShowCropper(false)}
          appElement={document.getElementById("root")}
          ariaHideApp={true}
          style={{
            overlay: {
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            },
            content: {
              position: 'relative',
              inset: 'auto',
              width: '90%',
              maxWidth: '500px',
              padding: '24px',
              borderRadius: '12px',
              border: 'none',
              background: '#fff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px'
            }
          }}
        >
          <div className="cropper-container">
            <Cropper
              image={selectedImage}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="modal-actions">
            <button className="btn-primary" onClick={handleConfirm}><UiText text={"Xác nhận"} /></button>
            <button className="btn-secondary" onClick={() => setShowCropper(false)}><UiText text={"Hủy"} /></button>
          </div>
        </Modal>

        {/* Thông tin chi tiết */}
        <div className="profile-details">
          {bioNotice && <p role="status"><UiText>{bioNotice}</UiText></p>}
          <div className="info-row"><strong><UiText text={"Họ tên:"} /></strong> {user.name || "-"}</div>
          <div className="info-row"><strong><UiText text={"Số điện thoại:"} /></strong> {user.phone || "-"}</div>
          <div className="info-row"><strong><UiText text={"Email:"} /></strong> {user.email || "-"}</div>
          <div className="info-row">
            <strong><UiText text={"Ngày sinh:"} /></strong>{" "}
            <UiText>{user.dob ? new Date(user.dob).toLocaleDateString('en-GB') : "Chưa cập nhật"}</UiText>
          </div>
          
          {/* Bio (cho mentor) - có thể edit trực tiếp */}
          {(role === "mentor" || user.role?.toLowerCase() === "mentor") && (
            <div className="info-row bio-row">
              <strong><UiText text={"Giới thiệu:"} /></strong>
              {editingBio ? (
                <div className="bio-edit-container">
                  <textarea
                    maxLength={4000}
                    value={bioInput}
                    onChange={(e) => setBioInput(e.target.value)}
                    rows="4"
                    className="bio-textarea"
                    placeholder={englishText("Nhập giới thiệu về bản thân...")}
                  />
                  <div className="bio-actions">
                    <button 
                      className="btn-primary btn-sm" 
                      onClick={handleSaveBio}
                      disabled={savingBio}
                    >
                      <UiText>{savingBio ? "Đang lưu..." : "Lưu"}</UiText>
                    </button>
                    <button 
                      className="btn-secondary btn-sm" 
                      onClick={() => {
                        setBioInput(bio);
                        setEditingBio(false);
                      }}
                      disabled={savingBio}
                    >{" "}<UiText text={"Hủy"} />{" "}</button>
                  </div>
                </div>
              ) : (
                <div className="bio-display">
                  <span><UiText>{bio || "Chưa cập nhật"}</UiText></span>
                  <button 
                    className="btn-link btn-edit-bio" 
                    onClick={() => {
                      setBioInput(bio);
                      setEditingBio(true);
                    }}
                  >
                    <UiText>{bio ? "Chỉnh sửa" : "Thêm giới thiệu"}</UiText>
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Đổi mật khẩu và câu hỏi bảo mật (chỉ mentor và learner) */}
          {(role === "mentor" || role === "learner" || user.role?.toLowerCase() === "mentor" || user.role?.toLowerCase() === "learner") && (
            <>
              {/* Đổi mật khẩu */}
              <div style={{ marginTop: "20px" }}>
                {!showChangePassword && (
                  <button className="btn-link" onClick={() => setShowChangePassword(true)}>{" "}<UiText text={"Đổi mật khẩu"} />{" "}</button>
                )}

                {showChangePassword && (
                  <div className="change-password">
                    <h3><UiText text={"Đổi mật khẩu"} /></h3>
                    <form onSubmit={handleChangePassword}>
                      <input 
                        type="password" 
                        placeholder={englishText("Mật khẩu hiện tại")}
                        value={currentPassword} 
                        onChange={(e) => setCurrentPassword(e.target.value)} 
                      />
                      <input 
                        type="password" 
                        placeholder={englishText("Mật khẩu mới")}
                        value={newPassword} 
                        onChange={(e) => setNewPassword(e.target.value)} 
                      />
                      <input 
                        type="password" 
                        placeholder={englishText("Xác nhận mật khẩu mới")}
                        value={confirmPassword} 
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                      />
                      <div className="form-actions">
                        <button type="submit" className="btn-primary"><UiText text={"Cập nhật"} /></button>
                        <button 
                          type="button" 
                          className="btn-secondary"
                          onClick={() => {
                            setShowChangePassword(false);
                            setMessage("");
                          }}
                        >{" "}<UiText text={"Hủy"} />{" "}</button>
                      </div>
                    </form>
                    {message && <p className="message"><UiText>{message}</UiText></p>}
                  </div>
                )}
              </div>

              {/* Đổi câu hỏi bảo mật */}
              <div style={{ marginTop: "20px" }}>
                {!showSecurityQuestion && (
                  <button className="btn-link" onClick={() => setShowSecurityQuestion(true)}>{" "}<UiText text={"Đổi câu hỏi bảo mật"} />{" "}</button>
                )}

                {showSecurityQuestion && (
                  <div className="change-password">
                  <h3><UiText>{hasSecurityQuestion ? "Đổi câu hỏi bảo mật" : "Thiết lập câu hỏi bảo mật"}</UiText></h3>
                  <p style={{ color: "#666", fontSize: "14px", marginBottom: "16px" }}>{" "}<UiText text={"Câu hỏi bảo mật giúp bạn khôi phục mật khẩu nếu quên."} />{" "}<UiText>{hasSecurityQuestion && "Để đổi câu hỏi, bạn cần nhập đúng câu trả lời của câu hỏi hiện tại."}</UiText>
                  </p>

                  {hasSecurityQuestion && (
                    <div style={{ marginBottom: "16px", padding: "12px", background: "#f0f7ff", borderRadius: "8px", borderLeft: "4px solid var(--primary)" }}>
                      <strong><UiText text={"Câu hỏi hiện tại:"} /></strong> <UiText>{currentSecurityQuestion}</UiText>
                    </div>
                  )}

                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setSecurityQuestionError("");

                    if (!selectedQuestion) {
                      setSecurityQuestionError("Vui lòng chọn câu hỏi bảo mật");
                      return;
                    }
                    if (!newSecurityAnswer.trim()) {
                      setSecurityQuestionError("Vui lòng nhập câu trả lời");
                      return;
                    }
                    if (hasSecurityQuestion && !oldSecurityAnswer.trim()) {
                      setSecurityQuestionError("Vui lòng nhập câu trả lời của câu hỏi hiện tại");
                      return;
                    }

                    setSavingSecurityQuestion(true);
                    try {
                      await api.post("/auth/security-question", {
                        security_question: selectedQuestion,
                        security_answer: newSecurityAnswer.trim(),
                        old_answer: hasSecurityQuestion ? oldSecurityAnswer.trim() : null
                      });
                      alert(englishText("✅ Cập nhật câu hỏi bảo mật thành công"));
                      setCurrentSecurityQuestion(selectedQuestion);
                      setHasSecurityQuestion(true);
                      setShowSecurityQuestion(false);
                      setSelectedQuestion("");
                      setNewSecurityAnswer("");
                      setOldSecurityAnswer("");
                      setSecurityQuestionError("");
                    } catch (err) {
                      setSecurityQuestionError(err?.response?.data?.message || "Có lỗi xảy ra khi cập nhật câu hỏi bảo mật");
                    } finally {
                      setSavingSecurityQuestion(false);
                    }
                  }}>
                    {hasSecurityQuestion && (
                      <div className="field" style={{ marginBottom: "16px" }}>
                        <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>{" "}<UiText text={"Câu trả lời câu hỏi hiện tại *"} />{" "}</label>
                        <input
                          type="text"
                          className="input"
                          value={oldSecurityAnswer}
                          onChange={(e) => setOldSecurityAnswer(e.target.value)}
                          placeholder={englishText("Nhập câu trả lời của câu hỏi hiện tại")}
                          style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd" }}
                        />
                      </div>
                    )}

                    <div className="field" style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>{" "}<UiText text={"Chọn câu hỏi bảo mật *"} />{" "}</label>
                      <select
                        className="input"
                        value={selectedQuestion}
                        onChange={(e) => setSelectedQuestion(e.target.value)}
                        style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd" }}
                      >
                        <UiOption value="">{"-- Chọn câu hỏi --"}</UiOption>
                        <UiOption value="Tên thú cưng đầu tiên của bạn?">{"Tên thú cưng đầu tiên của bạn?"}</UiOption>
                        <UiOption value="Món ăn bạn thường ăn vào dịp sinh nhật thời nhỏ?">{"Món ăn bạn thường ăn vào dịp sinh nhật thời nhỏ?"}</UiOption>
                        <UiOption value="Tên đường nơi bạn lớn lên?">{"Tên đường nơi bạn lớn lên?"}</UiOption>
                        <UiOption value="Tên người bạn hàng xóm thân nhất hồi nhỏ?">{"Tên người bạn hàng xóm thân nhất hồi nhỏ?"}</UiOption>
                        <UiOption value="Ngôi trường tiểu học đầu tiên bạn theo học?">{"Ngôi trường tiểu học đầu tiên bạn theo học?"}</UiOption>
                        <UiOption value="Tên ông/bà thường gọi bạn ở nhà?">{"Tên ông/bà thường gọi bạn ở nhà?"}</UiOption>
                        <UiOption value="Món ăn mẹ thường nấu cho bạn khi ốm?">{"Món ăn mẹ thường nấu cho bạn khi ốm?"}</UiOption>
                        <UiOption value="Địa điểm gia đình bạn thường đi chơi vào dịp Tết?">{"Địa điểm gia đình bạn thường đi chơi vào dịp Tết?"}</UiOption>
                        <UiOption value="Trò chơi dân gian bạn thích nhất hồi nhỏ?">{"Trò chơi dân gian bạn thích nhất hồi nhỏ?"}</UiOption>
                        <UiOption value="Bộ phim đầu tiên bạn xem ở rạp?">{"Bộ phim đầu tiên bạn xem ở rạp?"}</UiOption>
                        <UiOption value="Người bạn thân đầu tiên của bạn tên gì?">{"Người bạn thân đầu tiên của bạn tên gì?"}</UiOption>
                      </select>
                    </div>

                    <div className="field" style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>{" "}<UiText text={"Câu trả lời *"} />{" "}</label>
                      <input
                        type="text"
                        className="input"
                        value={newSecurityAnswer}
                        onChange={(e) => setNewSecurityAnswer(e.target.value)}
                        placeholder={englishText("Nhập câu trả lời")}
                        style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd" }}
                      />
                    </div>

                    {securityQuestionError && (
                      <div style={{ color: "#b00020", fontSize: "14px", marginBottom: "12px", padding: "8px", background: "#fff5f5", borderRadius: "6px" }}>
                        <UiText>{securityQuestionError}</UiText>
                      </div>
                    )}

                    <div className="form-actions">
                      <button 
                        type="submit" 
                        className="btn-primary"
                        disabled={savingSecurityQuestion}
                      >
                        <UiText>{savingSecurityQuestion ? "Đang lưu..." : "Lưu"}</UiText>
                      </button>
                      <button 
                        type="button" 
                        className="btn-secondary"
                        onClick={() => {
                          setShowSecurityQuestion(false);
                          setSelectedQuestion("");
                          setNewSecurityAnswer("");
                          setOldSecurityAnswer("");
                          setSecurityQuestionError("");
                        }}
                      >{" "}<UiText text={"Hủy"} />{" "}</button>
                    </div>
                  </form>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
