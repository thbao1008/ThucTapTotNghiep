// src/pages/CommunicateCenter.jsx
import React, { useEffect, useState, useRef } from "react";
import { FiHeart, FiMessageCircle, FiMic, FiSend, FiSmile, FiImage, FiX, FiChevronDown, FiChevronUp, FiPlay, FiCornerDownRight, FiSettings, FiArrowLeft } from "react-icons/fi";
import api from "../api";
import Modal from "../components/common/Modal";
import AudioPlayer from "../components/common/AudioPlayer";
import Notifications from "../components/common/Notifications";
import AdminCommunity from "../components/admin/AdminCommunity";
import { useAuth } from "../context/AuthContext";
import { getAuth } from "../utils/auth";
import { normalizeFileUrl, normalizeVideoUrl, normalizeImageUrl, normalizeAudioUrl } from "../utils/apiHelpers";
import "../styles/communicate.css";

export default function CommunicateCenter() {
  const {  } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all"); // "all" | "my-posts" | "liked"
  const [myPostsFilter, setMyPostsFilter] = useState("all"); // "all" | "approved" | "pending" | "rejected"
  const [selectedPostId, setSelectedPostId] = useState(null); // ID của post đang được chọn để xem comments trong modal
  const [postComments, setPostComments] = useState({}); // { postId: [comments] }
  const [loadingComments, setLoadingComments] = useState({});
  const [showCommentsModal, setShowCommentsModal] = useState(false); // Modal bình luận
  const [showAdminManage, setShowAdminManage] = useState(false); // Toggle hiển thị AdminCommunity
  
  // Post form state
  const [postContent, setPostContent] = useState("");
  const [postAudio, setPostAudio] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [postImage, setPostImage] = useState(null);
  const [postVideo, setPostVideo] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const recordingTimerRef = useRef(null);
  
  // Comment form state (per post)
  const [commentForms, setCommentForms] = useState({}); // { postId: { content, audio, audioUrl, isRecording, mediaRecorder } }
  const [showEmojiPicker, setShowEmojiPicker] = useState({}); // { postId: true }
  const [replyingTo, setReplyingTo] = useState({}); // { postId: commentId } - Track which comment user is replying to
  const [selectedMedia, setSelectedMedia] = useState(null); // { url, type: 'image' | 'video' }

  // Lấy user từ auth (đúng cách)
  const auth = getAuth();
  const user = auth?.user || {};
  const role = user?.role || "";
  const [userName, setUserName] = useState(user?.name || "");
  
  // Debug: Log role để kiểm tra
  useEffect(() => {
    console.log("Current role:", role);
    console.log("User object:", user);
    if (role === "admin") {
      console.log("✅ Admin role detected, nút Quản lý bài đăng should be visible");
    } else {
      console.log("❌ Role is not admin:", role);
    }
  }, [role, user]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioPlayerRef = useRef(null);
  const observerRef = useRef(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Load user name if not available
  useEffect(() => {
    if (!userName && user?.id && role) {
      // Try to get user name from API if not in localStorage
      const fetchUserName = async () => {
        try {
          let res;
          if (role === 'learner') {
            res = await api.get(`/learners/by-user/${user.id}`);
            if (res.data?.learner?.name) {
              setUserName(res.data.learner.name);
            }
          } else if (role === 'mentor') {
            res = await api.get(`/mentors/by-user/${user.id}`);
            if (res.data?.name) {
              setUserName(res.data.name);
            }
          }
        } catch (err) {
          console.error("Error loading user name:", err);
          // Fallback: use name from localStorage if available
          if (user?.name) {
            setUserName(user.name);
          }
        }
      };
      fetchUserName();
    } else if (user?.name && !userName) {
      // Use name from localStorage if available
      setUserName(user.name);
    }
  }, [userName, user?.id, user?.name, role]);

  useEffect(() => {
    loadPosts(true);
  }, [activeTab, myPostsFilter]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMorePosts();
        }
      },
      { threshold: 0.1 }
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => {
      if (observerRef.current) {
        observer.unobserve(observerRef.current);
      }
    };
  }, [hasMore, loading]);

  // Track post views khi post được hiển thị trên màn hình
  useEffect(() => {
    if (!user?.id || posts.length === 0) return;

    const postElements = document.querySelectorAll('.post-card');
    const viewObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const postId = parseInt(entry.target.dataset.postId);
            if (postId) {
              // Track view (debounce để tránh gọi quá nhiều)
              markPostAsViewed(postId);
            }
          }
        });
      },
      { threshold: 0.5 } // Post phải hiển thị ít nhất 50% mới được tính là đã xem
    );

    postElements.forEach(el => {
      if (el.dataset.postId) {
        viewObserver.observe(el);
      }
    });

    return () => {
      postElements.forEach(el => viewObserver.unobserve(el));
    };
  }, [posts, user?.id]);

  // Function để track view (với debounce)
  const viewTrackingRef = useRef({});
  async function markPostAsViewed(postId) {
    // Debounce: chỉ track mỗi post một lần trong session
    if (viewTrackingRef.current[postId]) return;
    viewTrackingRef.current[postId] = true;

    try {
      await api.post(`/community/posts/${postId}/view`);
    } catch (err) {
      // Không hiển thị lỗi nếu track view fail
      console.error("Error tracking post view:", err);
    }
  }

  async function loadPosts(reset = false) {
    try {
      setLoading(true);
      if (reset) {
        setPage(1);
        setPosts([]);
      }
      
      let response;
      if (activeTab === "my-posts") {
        const status = myPostsFilter === "all" ? null : myPostsFilter;
        response = await api.get("/community/posts/my-posts", {
          params: { status, page: 1, limit: 20 }
        });
      } else if (activeTab === "liked") {
        response = await api.get("/community/posts/liked", {
          params: { page: 1, limit: 20 }
        });
      } else {
        response = await api.get("/community/posts", {
          params: { page: 1, limit: 20 }
        });
      }
      
      const newPosts = response.data.posts || [];
      if (reset) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }
      setHasMore(newPosts.length === 20);
    } catch (err) {
      console.error("Error loading posts:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMorePosts() {
    if (loading || !hasMore) return;
    
    try {
      setLoading(true);
      const nextPage = page + 1;
      let response;
      
      if (activeTab === "my-posts") {
        const status = myPostsFilter === "all" ? null : myPostsFilter;
        response = await api.get("/community/posts/my-posts", {
          params: { status, page: nextPage, limit: 20 }
        });
      } else {
        response = await api.get("/community/posts", {
          params: { page: nextPage, limit: 20 }
        });
      }
      
      const newPosts = response.data.posts || [];
      setPosts(prev => [...prev, ...newPosts]);
      setHasMore(newPosts.length === 20);
      setPage(nextPage);
    } catch (err) {
      console.error("Error loading more posts:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePost() {
    if (!postContent && !audioUrl && !postImage && !postVideo) return;
    
    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append("content", postContent);
      if (postAudio) {
        formData.append("audio", postAudio);
      }
      if (postImage) {
        formData.append("image", postImage);
      }
      if (postVideo) {
        formData.append("video", postVideo);
      }

      const response = await api.post("/community/posts", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setPostContent("");
      setPostAudio(null);
      setAudioUrl(null);
      setAudioDuration(0);
      setPostImage(null);
      setPostVideo(null);
      setImagePreview(null);
      setVideoPreview(null);
      
      // Hiển thị message từ backend (admin posts được duyệt ngay, learner/mentor cần chờ)
      if (response.data?.message) {
        // Không cần alert, chỉ reload posts (admin posts sẽ hiển thị ngay)
      }
      
      // Reload posts
      loadPosts(true);
    } catch (err) {
      console.error("Error creating post:", err);
      alert("Lỗi khi đăng bài: " + (err.response?.data?.message || err.message));
    } finally {
      setSubmitting(false);
    }
  }

  function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type.startsWith("image/")) {
      setPostImage(file);
      setPostVideo(null);
      setVideoPreview(null);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    } else if (file.type.startsWith("video/")) {
      setPostVideo(file);
      setPostImage(null);
      setImagePreview(null);
      const reader = new FileReader();
      reader.onload = (e) => setVideoPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  }

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function isVideoUrl(url) {
    if (!url) return false;
    return /\.(mp4|webm|ogg|mov|avi|wmv|flv|mkv)$/i.test(url);
  }

  function renderMedia(url) {
    if (!url) return null;
    
    // Normalize URL to ensure it works with proxy
    const normalizedUrl = normalizeFileUrl(url);
    
    if (isVideoUrl(url)) {
      return (
        <div className="media-preview" style={{ marginTop: "12px" }}>
          <video 
            src={normalizedUrl} 
            controls 
            style={{ 
              width: "100%", 
              maxHeight: "500px",
              borderRadius: "8px",
              display: "block"
            }}
            onError={(e) => {
              console.error("Error loading video:", normalizedUrl);
              e.target.style.display = "none";
            }}
          />
        </div>
      );
    } else {
      return (
        <div className="media-preview" style={{ marginTop: "12px" }}>
          <img 
            src={normalizedUrl} 
            alt="Post media" 
            style={{ 
              width: "100%", 
              maxHeight: "500px",
              borderRadius: "8px",
              objectFit: "contain",
              display: "block",
              cursor: "pointer"
            }} 
            onClick={() => setSelectedMedia({ url: normalizedUrl, type: 'image' })}
            onError={(e) => {
              console.error("Error loading image:", normalizedUrl);
              e.target.style.display = "none";
            }}
          />
        </div>
      );
    }
  }

  async function handleToggleLike(postId) {
    try {
      await api.post("/community/likes", { postId });
      loadPosts(true);
    } catch (err) {
      console.error("Error toggling like:", err);
    }
  }

  async function selectPost(postId) {
    setSelectedPostId(postId);
    setShowCommentsModal(true);
    await loadComments(postId);
  }

  async function loadComments(postId) {
    if (postComments[postId] || loadingComments[postId]) return;
    
    try {
      setLoadingComments(prev => ({ ...prev, [postId]: true }));
      const response = await api.get(`/community/posts/${postId}/comments`);
      setPostComments(prev => ({
        ...prev,
        [postId]: response.data.comments || []
      }));
    } catch (err) {
      console.error("Error loading comments:", err);
    } finally {
      setLoadingComments(prev => {
        const newState = { ...prev };
        delete newState[postId];
        return newState;
      });
    }
  }

  async function handleCreateComment(postId, parentCommentId = null) {
    const form = commentForms[postId];
    if (!form || (!form.content && !form.audioUrl)) return;
    
    try {
      const formData = new FormData();
      formData.append("content", form.content || "");
      if (form.audio) {
        formData.append("audio", form.audio);
      }
      if (parentCommentId) {
        formData.append("parentCommentId", parentCommentId);
      }

      await api.post(`/community/posts/${postId}/comments`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      // Reset form
      setCommentForms(prev => {
        const newState = { ...prev };
        delete newState[postId];
        return newState;
      });
      setReplyingTo(prev => {
        const newState = { ...prev };
        delete newState[postId];
        return newState;
      });
      
      // Reload comments
      await loadComments(postId);
      // Reload posts to update comment count
      loadPosts(true);
    } catch (err) {
      console.error("Error creating comment:", err);
      alert("Lỗi khi bình luận: " + (err.response?.data?.message || err.message));
    }
  }

  // Audio recording functions
  async function startRecording(postId, isPost = false) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      let startTime = Date.now();

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        const file = new File([blob], "recording.webm", { type: "audio/webm" });
        const duration = Math.floor((Date.now() - startTime) / 1000);
        
        if (isPost) {
          setAudioUrl(url);
          setPostAudio(file);
          setAudioDuration(duration);
          setRecordingDuration(0);
          if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
          }
        } else {
          setCommentForms(prev => ({
            ...prev,
            [postId]: {
              ...prev[postId],
              audioUrl: url,
              audio: file,
              audioDuration: duration,
              isRecording: false,
              mediaRecorder: null
            }
          }));
        }
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      
      if (isPost) {
        setMediaRecorder(recorder);
        setIsRecording(true);
        setRecordingDuration(0);
        recordingTimerRef.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
      } else {
        setCommentForms(prev => ({
          ...prev,
          [postId]: {
            ...prev[postId],
            isRecording: true,
            mediaRecorder: recorder,
            recordingStartTime: Date.now()
          }
        }));
      }
    } catch (err) {
      console.error("Error starting recording:", err);
      alert("Không thể truy cập microphone");
    }
  }

  function stopRecording(postId, isPost = false) {
    if (isPost) {
      if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        setIsRecording(false);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
      }
    } else {
      const form = commentForms[postId];
      if (form?.mediaRecorder && form.isRecording) {
        form.mediaRecorder.stop();
        setCommentForms(prev => ({
          ...prev,
          [postId]: {
            ...prev[postId],
            isRecording: false
          }
        }));
      }
    }
  }

  // Emoji picker
  const emojis = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕"];

  function insertEmoji(postId, emoji) {
    setCommentForms(prev => ({
      ...prev,
      [postId]: {
        ...prev[postId],
        content: (prev[postId]?.content || "") + emoji
      }
    }));
    setShowEmojiPicker(prev => ({ ...prev, [postId]: false }));
  }

  const myPostsStats = {
    all: posts.length,
    approved: posts.filter(p => p.status === "approved").length,
    pending: posts.filter(p => p.status === "pending").length,
    rejected: posts.filter(p => p.status === "rejected").length
  };

  const content = (
    <div className="communicate-center">
      <div className="communicate-header">
        <h2>Cư Dân AESP</h2>
        <div className="header-actions">
          {role === "admin" && (
            <button
              className="btn-admin-manage"
              onClick={() => setShowAdminManage(!showAdminManage)}
              title="Quản lý bài đăng"
            >
              {showAdminManage ? <FiArrowLeft /> : <FiSettings />} 
              <span>{showAdminManage ? "Quay lại" : "Quản lý bài đăng"}</span>
            </button>
          )}
          <Notifications />
        </div>
      </div>

      {/* Hiển thị AdminCommunity khi admin bấm "Quản lý bài đăng" */}
      {showAdminManage && role === "admin" ? (
        <AdminCommunity />
      ) : (
        <>
          <div className="communicate-tabs">
            <button
              className={`tab-button ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              Tất cả bài đăng
            </button>
            {role !== "admin" && (
              <>
                <button
                  className={`tab-button ${activeTab === "my-posts" ? "active" : ""}`}
                  onClick={() => setActiveTab("my-posts")}
                >
                  Các bài đăng của bạn
                </button>
                <button
                  className={`tab-button ${activeTab === "liked" ? "active" : ""}`}
                  onClick={() => setActiveTab("liked")}
                >
                  Bài đăng yêu thích
                </button>
              </>
            )}
          </div>

      {activeTab === "my-posts" && role !== "admin" && (
        <div className="my-posts-filters">
          <button
            className={`filter-button ${myPostsFilter === "all" ? "active" : ""}`}
            onClick={() => setMyPostsFilter("all")}
          >
            Tất cả <span className="filter-badge">{myPostsStats.all}</span>
          </button>
          <button
            className={`filter-button ${myPostsFilter === "approved" ? "active" : ""}`}
            onClick={() => setMyPostsFilter("approved")}
          >
            Đã duyệt <span className="filter-badge">{myPostsStats.approved}</span>
          </button>
          <button
            className={`filter-button ${myPostsFilter === "pending" ? "active" : ""}`}
            onClick={() => setMyPostsFilter("pending")}
          >
            Đang chờ <span className="filter-badge">{myPostsStats.pending}</span>
          </button>
          <button
            className={`filter-button ${myPostsFilter === "rejected" ? "active" : ""}`}
            onClick={() => setMyPostsFilter("rejected")}
          >
            Bị từ chối <span className="filter-badge">{myPostsStats.rejected}</span>
          </button>
        </div>
      )}

      {/* Post Form - Hiển thị trực tiếp khi tab "all" hoặc "liked" (cho tất cả roles kể cả admin) */}
      {(activeTab === "all" || activeTab === "liked" || role === "admin") && (
        <div className="post-form-card">
          <div className="post-form-header">
            <div className="author-avatar">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user?.name || "User"} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
              ) : (
                user?.name?.charAt(0).toUpperCase() || "U"
              )}
            </div>
            <div className="post-form-title">
              Cùng chia sẻ học thuật thôi {userName ? userName : "bạn"}
            </div>
            <button
              className={`btn-mic-header ${isRecording ? "recording" : ""}`}
              onClick={() => {
                if (isRecording) {
                  stopRecording(null, true);
                } else {
                  startRecording(null, true);
                }
              }}
              title={isRecording ? "Dừng ghi âm" : "Ghi âm"}
            >
              <FiMic />
            </button>
          </div>
          <div className="post-form-content">
            <textarea
              placeholder="Bạn đang nghĩ gì?"
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              className="form-textarea"
              rows={4}
            />
            
            {/* Audio Preview với Waveform */}
            {audioUrl && (
              <div className="audio-preview-waveform">
                <button
                  className="btn-play-audio"
                  onClick={() => {
                    if (audioPlayerRef.current) {
                      if (isPlayingAudio) {
                        audioPlayerRef.current.pause();
                        setIsPlayingAudio(false);
                      } else {
                        audioPlayerRef.current.play();
                        setIsPlayingAudio(true);
                      }
                    }
                  }}
                >
                  <FiPlay />
                </button>
                <audio
                  ref={audioPlayerRef}
                  src={audioUrl}
                  onEnded={() => setIsPlayingAudio(false)}
                  onPause={() => setIsPlayingAudio(false)}
                  style={{ display: "none" }}
                />
                <div className="audio-waveform">
                  <div className="waveform-bars">
                    {Array.from({ length: 50 }).map((_, i) => (
                      <div
                        key={i}
                        className={`waveform-bar ${isPlayingAudio ? "playing" : ""}`}
                        style={{
                          height: `${Math.random() * 60 + 20}%`,
                          animationDelay: `${i * 0.05}s`
                        }}
                      />
                    ))}
                  </div>
                  <div className="audio-duration">{formatDuration(audioDuration)}</div>
                </div>
                <button
                  className="btn-remove-audio"
                  onClick={() => {
                    if (audioPlayerRef.current) {
                      audioPlayerRef.current.pause();
                      setIsPlayingAudio(false);
                    }
                    setAudioUrl(null);
                    setPostAudio(null);
                    setAudioDuration(0);
                  }}
                >
                  <FiX />
                </button>
              </div>
            )}

            {/* Recording Indicator */}
            {isRecording && (
              <div className="recording-indicator">
                <div className="recording-dot"></div>
                <span>Đang ghi âm... {formatDuration(recordingDuration)}</span>
              </div>
            )}

            {/* Image/Video Preview */}
            {imagePreview && (
              <div className="media-preview">
                <img src={imagePreview} alt="Preview" />
                <button
                  className="btn-remove-media"
                  onClick={() => {
                    setPostImage(null);
                    setImagePreview(null);
                  }}
                >
                  <FiX />
                </button>
              </div>
            )}

            {videoPreview && (
              <div className="media-preview">
                <video src={videoPreview} controls />
                <button
                  className="btn-remove-media"
                  onClick={() => {
                    setPostVideo(null);
                    setVideoPreview(null);
                  }}
                >
                  <FiX />
                </button>
              </div>
            )}

            <div className="form-actions">
              <label className="btn-icon" title="Upload hình ảnh hoặc video">
                <FiImage />
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleImageSelect}
                  style={{ display: "none" }}
                />
              </label>
              <button
                className="btn-primary"
                onClick={handleCreatePost}
                disabled={(!postContent && !audioUrl && !postImage && !postVideo) || submitting}
              >
                <FiSend /> {submitting ? "Đang đăng..." : "Đăng bài"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Posts Column - Full Width */}
      <div className="posts-column">
          {loading && posts.length === 0 ? (
            <div className="loading">Đang tải...</div>
          ) : posts.length === 0 ? (
            <div className="empty-state">
              <p>Chưa có bài đăng nào</p>
            </div>
          ) : (
            <div className="posts-list">
              {posts.map(post => (
                <div 
                  key={post.id} 
                  className={`post-card ${post.is_pinned ? "pinned" : ""} ${post.is_viewed === 0 ? "unviewed" : ""}`}
                  data-post-id={post.id}
                >
              {post.is_pinned && <div className="pin-badge">📌 Đã ghim</div>}
              
              <div className="post-header">
                <div className="post-author">
                  <div className="author-avatar">
                    {post.author_avatar_url ? (
                      <img src={post.author_avatar_url} alt={post.author_name || "User"} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                    ) : (
                      post.author_name?.charAt(0).toUpperCase() || "U"
                    )}
                  </div>
                  <div>
                    <div className="author-name">{post.author_name || "Người dùng"}</div>
                    <div className="post-meta">
                      {new Date(post.created_at).toLocaleDateString("vi-VN", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </div>
                  </div>
                </div>
                {post.status === "pending" && (
                  <span className="status-badge pending">Đang chờ duyệt</span>
                )}
                {post.status === "rejected" && (
                  <span className="status-badge rejected">Bị từ chối</span>
                )}
              </div>

              {post.title && <h3 className="post-title">{post.title}</h3>}
              
              <div className="post-content">
                {post.content && <p>{post.content}</p>}
                {post.audio_url && (
                  <AudioPlayer src={normalizeAudioUrl(post.audio_url)} />
                )}
                {post.image_url && renderMedia(post.image_url)}
              </div>

              {post.status === "rejected" && post.rejection_reason && (
                <div className="rejection-reason">
                  <strong>Lý do từ chối:</strong> {post.rejection_reason}
                </div>
              )}

              <div className="post-actions">
                <button
                  className={`action-btn like-btn ${post.is_liked ? "liked" : ""}`}
                  onClick={() => handleToggleLike(post.id)}
                >
                  <FiHeart /> {post.likes_count || 0}
                </button>
                <button
                  className={`action-btn comment-btn ${selectedPostId === post.id ? "active" : ""}`}
                  onClick={() => selectPost(post.id)}
                >
                  <FiMessageCircle /> {post.comments_count || 0}
                </button>
              </div>
        </div>
      ))}
            </div>
          )}
      </div>

          {/* Comments Modal */}
          <Modal
            title="Bình luận"
            onClose={() => {
              setShowCommentsModal(false);
              setSelectedPostId(null);
            }}
            className="comments-modal"
            isOpen={showCommentsModal && selectedPostId !== null}
          >
        {selectedPostId && (() => {
          const post = posts.find(p => p.id === selectedPostId);
          if (!post) return null;

          // Group comments by parent
          const topLevelComments = (postComments[selectedPostId] || []).filter(c => !c.parent_comment_id);
          const repliesMap = {};
          (postComments[selectedPostId] || []).forEach(c => {
            if (c.parent_comment_id) {
              if (!repliesMap[c.parent_comment_id]) repliesMap[c.parent_comment_id] = [];
              repliesMap[c.parent_comment_id].push(c);
            }
          });

          function renderComment(comment, isReply = false) {
            return (
              <div key={comment.id} className={`comment-item ${isReply ? 'comment-reply' : ''}`}>
                {isReply && <FiCornerDownRight className="reply-indicator" />}
                <div className="comment-author">
                  <div className="author-avatar small">
                    {comment.author_avatar_url ? (
                      <img src={comment.author_avatar_url} alt={comment.author_name || "User"} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                    ) : (
                      comment.author_name?.charAt(0).toUpperCase() || "U"
                    )}
                  </div>
                  <div className="comment-content-wrapper">
                    <div className="author-name">
                      {comment.author_name}
                      {comment.author_role === 'admin' && <span className="admin-tag"> [Người quản trị]</span>}
                    </div>
                    <div className="comment-content">
                      {comment.content && <p>{comment.content}</p>}
                      {comment.audio_url && <AudioPlayer src={normalizeAudioUrl(comment.audio_url)} />}
                    </div>
                    <div className="comment-meta">
                      {new Date(comment.created_at).toLocaleDateString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                      <button
                        className="btn-reply-comment"
                        onClick={() => {
                          setReplyingTo(prev => ({ ...prev, [selectedPostId]: comment.id }));
                          setCommentForms(prev => ({
                            ...prev,
                            [selectedPostId]: {
                              ...prev[selectedPostId],
                              content: `@${comment.author_name} `
                            }
                          }));
                        }}
                      >
                        Trả lời
                      </button>
                    </div>
                  </div>
                </div>
                {repliesMap[comment.id] && repliesMap[comment.id].length > 0 && (
                  <div className="comment-replies">
                    {repliesMap[comment.id].map(reply => renderComment(reply, true))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div className="comments-modal-layout">
              {/* Post Info - Left */}
              <div className="comments-modal-post">
                <div className="post-header">
                  <div className="post-author">
                    <div className="author-avatar">
                      {post.author_avatar_url ? (
                        <img src={post.author_avatar_url} alt={post.author_name || "User"} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                      ) : (
                        post.author_name?.charAt(0).toUpperCase() || "U"
                      )}
                    </div>
                    <div>
                      <div className="author-name">{post.author_name || "Người dùng"}</div>
                      <div className="post-meta">
                        {new Date(post.created_at).toLocaleDateString("vi-VN", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                {post.title && <h3 className="post-title">{post.title}</h3>}
                <div className="post-content">
                  {post.content && <p>{post.content}</p>}
                  {post.audio_url && <AudioPlayer src={post.audio_url} />}
                  {post.image_url && renderMedia(post.image_url)}
                </div>
                <div className="post-actions">
                  <button
                    className={`action-btn like-btn ${post.is_liked ? "liked" : ""}`}
                    onClick={() => handleToggleLike(post.id)}
                  >
                    <FiHeart /> {post.likes_count || 0}
                  </button>
                  <button className="action-btn comment-btn active">
                    <FiMessageCircle /> {post.comments_count || 0}
                  </button>
                </div>
              </div>

              {/* Comments - Right */}
              <div className="comments-modal-comments">
                {loadingComments[selectedPostId] ? (
                  <div className="loading-comments">Đang tải bình luận...</div>
                ) : (
                  <>
                    <div className="comments-list-scroll">
                      {topLevelComments.length === 0 ? (
                        <div className="empty-comments">
                          <p>Chưa có bình luận nào</p>
                        </div>
                      ) : (
                        topLevelComments.map(comment => renderComment(comment))
                      )}
                    </div>

                    {/* Comment Form */}
                    <div className="comment-form-inline">
                      <div className="author-avatar small">
                        {user?.avatar_url ? (
                          <img src={user.avatar_url} alt={user?.name || "User"} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                        ) : (
                          user?.name?.charAt(0).toUpperCase() || "U"
                        )}
                      </div>
                      <div className="comment-input-wrapper">
                        {replyingTo[selectedPostId] && (
                          <div className="replying-to-indicator">
                            Đang trả lời bình luận...
                            <button onClick={() => {
                              setReplyingTo(prev => {
                                const newState = { ...prev };
                                delete newState[selectedPostId];
                                return newState;
                              });
                            }}>
                              <FiX />
                            </button>
                          </div>
                        )}
                        <textarea
                          placeholder={replyingTo[selectedPostId] ? "Viết trả lời..." : "Viết bình luận..."}
                          value={commentForms[selectedPostId]?.content || ""}
                          onChange={(e) => setCommentForms(prev => ({
                            ...prev,
                            [selectedPostId]: {
                              ...prev[selectedPostId],
                              content: e.target.value
                            }
                          }))}
                          className="form-textarea"
                          rows={2}
                        />
                        <div className="comment-form-actions">
                          <div className="emoji-picker-wrapper">
                            <button
                              className="btn-icon"
                              onClick={() => setShowEmojiPicker(prev => ({
                                ...prev,
                                [selectedPostId]: !prev[selectedPostId]
                              }))}
                            >
                              <FiSmile />
                            </button>
                            {showEmojiPicker[selectedPostId] && (
                              <div className="emoji-picker">
                                {emojis.map((emoji, idx) => (
                                  <button
                                    key={idx}
                                    className="emoji-item"
                                    onClick={() => insertEmoji(selectedPostId, emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            className={`btn-icon ${commentForms[selectedPostId]?.isRecording ? "recording" : ""}`}
                            onClick={() => {
                              if (commentForms[selectedPostId]?.isRecording) {
                                stopRecording(selectedPostId, false);
                              } else {
                                startRecording(selectedPostId, false);
                              }
                            }}
                          >
                            <FiMic />
                          </button>
                          {commentForms[selectedPostId]?.audioUrl && (
                            <div className="audio-preview-waveform">
                              <button
                                className="btn-play-audio"
                                onClick={() => {
                                  if (audioPlayerRef.current) {
                                    if (isPlayingAudio) {
                                      audioPlayerRef.current.pause();
                                      setIsPlayingAudio(false);
                                    } else {
                                      audioPlayerRef.current.play();
                                      setIsPlayingAudio(true);
                                    }
                                  }
                                }}
                              >
                                <FiPlay />
                              </button>
                              <audio
                                ref={audioPlayerRef}
                                src={commentForms[selectedPostId].audioUrl}
                                onEnded={() => setIsPlayingAudio(false)}
                                onPause={() => setIsPlayingAudio(false)}
                                style={{ display: "none" }}
                              />
                              <div className="audio-waveform">
                                <div className="waveform-bars">
                                  {Array.from({ length: 50 }).map((_, i) => (
                                    <div
                                      key={i}
                                      className={`waveform-bar ${isPlayingAudio ? "playing" : ""}`}
                                      style={{
                                        height: `${Math.random() * 60 + 20}%`,
                                        animationDelay: `${i * 0.05}s`
                                      }}
                                    />
                                  ))}
                                </div>
                                <div className="audio-duration">
                                  {formatDuration(commentForms[selectedPostId].audioDuration || 0)}
                                </div>
                              </div>
                              <button
                                className="btn-remove-audio"
                                onClick={() => {
                                  if (audioPlayerRef.current) {
                                    audioPlayerRef.current.pause();
                                    setIsPlayingAudio(false);
                                  }
                                  setCommentForms(prev => ({
                                    ...prev,
                                    [selectedPostId]: {
                                      ...prev[selectedPostId],
                                      audioUrl: null,
                                      audio: null,
                                      audioDuration: 0
                                    }
                                  }));
                                }}
                              >
                                <FiX />
                              </button>
                            </div>
                          )}
                          <button
                            className="btn-primary small"
                            onClick={async () => {
                              await handleCreateComment(selectedPostId, replyingTo[selectedPostId] || null);
                              await loadComments(selectedPostId);
                            }}
                            disabled={!commentForms[selectedPostId]?.content && !commentForms[selectedPostId]?.audioUrl}
                          >
                            <FiSend /> {replyingTo[selectedPostId] ? 'Trả lời' : 'Gửi'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Media Modal for fullscreen view */}
      {selectedMedia && (
        <Modal
          title={null}
          onClose={() => setSelectedMedia(null)}
          className="media-fullscreen-modal"
        >
          {selectedMedia.type === 'image' ? (
            <img 
              src={selectedMedia.url} 
              alt="Fullscreen" 
              style={{ 
                maxWidth: "95vw", 
                maxHeight: "95vh", 
                objectFit: "contain",
                display: "block",
                margin: "0 auto"
              }}
            />
          ) : (
            <video 
              src={selectedMedia.url} 
              controls 
              style={{ 
                maxWidth: "95vw", 
                maxHeight: "95vh",
                display: "block",
                margin: "0 auto"
              }}
            />
          )}
          </Modal>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="communicate-center">
      {content}
    </div>
  );
}
