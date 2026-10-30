import { englishText } from '../i18n/uiLanguage.js';
import { UiText } from '../i18n/UiLanguage.jsx';
// src/pages/CommunicateCenter.jsx
import React, { useEffect, useState, useRef } from "react";
import {Link,useSearchParams} from 'react-router-dom';
import { FiHeart, FiMessageCircle, FiMic, FiSend, FiSmile, FiImage, FiX, FiChevronDown, FiChevronUp, FiPlay, FiCornerDownRight, FiSettings, FiArrowLeft } from "react-icons/fi";
import {communityPostRequest,applyCommunityLike} from "../utils/communityFeed.js";
import api from "../api";
import Modal from "../components/common/Modal";
import AudioPlayer from "../components/common/AudioPlayer";
import UserAvatar from '../components/common/UserAvatar.jsx';
import AdminCommunity from "../components/admin/AdminCommunity";
import { useAuth } from "../context/AuthContext";
import { getAuth } from "../utils/auth";
import { normalizeFileUrl, normalizeVideoUrl, normalizeImageUrl, normalizeAudioUrl } from "../utils/apiHelpers";
import "../styles/communicate.css";
import '../styles/community-refresh.css';

export default function CommunicateCenter() {
  const context=useAuth();
  const [profile,setProfile]=useState(null);
  const composerRef=useRef(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all"); // "all" | "my-posts" | "liked"
  const [myPostsFilter, setMyPostsFilter] = useState("all"); // "all" | "approved" | "pending" | "rejected"
  const [selectedPostId, setSelectedPostId] = useState(null); // ID của post đang được chọn để xem comments trong modal
  const [postComments, setPostComments] = useState({}); // { postId: [comments] }
  const [loadingComments, setLoadingComments] = useState({});
  const [showCommentsModal, setShowCommentsModal] = useState(false); // Modal bình luận
  const [linkedPost,setLinkedPost]=useState(null);
  const [searchParams,setSearchParams]=useSearchParams();
  const linkedPostId=searchParams.get('post');
  const feedRequestRef=useRef(0);
  const loadingMoreRef=useRef(false);
  const interactionPending=useRef(new Set()),commentsRequests=useRef(new Map()),viewActive=useRef(false);
  const [reactionBusy,setReactionBusy]=useState({}),[commentBusy,setCommentBusy]=useState({}),[actionError,setActionError]=useState('');
  const commentInputRef=useRef(null);
  useEffect(()=>{viewActive.current=true;return()=>{viewActive.current=false;commentsRequests.current.forEach(controller=>controller.abort());};},[]);
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
  const account=context?.user||auth?.user||{};
  const hasProfile=profile&&String(profile.id)===String(account.id);
  const user = hasProfile?{...account,name:profile.name,avatar_url:profile.avatar_url}:account;
  const currentAvatar=hasProfile?profile.avatar_url:account.avatar_url||account.avatar;
  const role = user?.role || "";
  const userName=user.name||'';
  const profilePath={learner:'/learn/profile',mentor:'/mentor/profile',admin:'/admin/profile'}[role];
  useEffect(()=>{
    if(!account.id)return;
    const controller=new AbortController();
    api.get('/users/me',{signal:controller.signal}).then(({data})=>{const current=data.user??data;if(!controller.signal.aborted&&String(current?.id)===String(account.id))setProfile(current);}).catch(()=>{});
    return()=>controller.abort();
  },[account.id]);
  useEffect(()=>{
    if(!/^[1-9]\d*$/.test(linkedPostId||'')||Number(linkedPostId)>2147483647||!user.id)return;
    const controller=new AbortController();
    api.get(`/community/posts/${linkedPostId}`,{signal:controller.signal}).then(({data})=>{
      if(controller.signal.aborted||!data?.post)return;
      setShowAdminManage(false);setLinkedPost(data.post);setSelectedPostId(data.post.id);setShowCommentsModal(true);
      setPostComments(previous=>({...previous,[data.post.id]:data.comments||[]}));
    }).catch(()=>{if(!controller.signal.aborted)setActionError('Bài viết này không còn khả dụng hoặc bạn không có quyền xem.');});
    return()=>controller.abort();
  },[linkedPostId,user.id]);
  
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioPlayerRef = useRef(null);
  const observerRef = useRef(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if(!showAdminManage)loadPosts(true);
    return ()=>{feedRequestRef.current++;};
  }, [activeTab, myPostsFilter, showAdminManage, user.id]);

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

  async function loadPosts(reset=false){
    const requestId=++feedRequestRef.current;
    setLoading(true);
    if(reset){setPage(1);setPosts([]);}
    try{
      const request=communityPostRequest(activeTab,myPostsFilter,1);
      const response=await api.get(request.url,{params:request.params});
      if(requestId!==feedRequestRef.current)return;
      const rows=response.data.posts||[];
      setPosts(previous=>reset?rows:[...previous,...rows]);setHasMore(rows.length===20);
    }catch{if(requestId===feedRequestRef.current)console.warn('Không thể tải bảng tin cộng đồng.');}
    finally{if(requestId===feedRequestRef.current)setLoading(false);}
  }

  async function loadMorePosts(){
    if(loading||!hasMore||loadingMoreRef.current||showAdminManage)return;
    const requestId=feedRequestRef.current;loadingMoreRef.current=true;setLoading(true);
    try{
      const nextPage=page+1;
      const request=communityPostRequest(activeTab,myPostsFilter,nextPage);
      const response=await api.get(request.url,{params:request.params});
      if(requestId!==feedRequestRef.current)return;
      const rows=response.data.posts||[];
      setPosts(previous=>[...previous,...rows]);setHasMore(rows.length===20);setPage(nextPage);
    }catch{if(requestId===feedRequestRef.current)console.warn('Không thể tải thêm bài đăng.');}
    finally{loadingMoreRef.current=false;if(requestId===feedRequestRef.current)setLoading(false);}
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

  async function handleToggleLike(postId,commentId=null) {
    const key=commentId?`comment:${commentId}`:`post:${postId}`;
    if(interactionPending.current.has(key))return;
    interactionPending.current.add(key);setReactionBusy(previous=>({...previous,[key]:true}));setActionError('');
    try {
      const {data}=await api.post("/community/likes", commentId?{commentId}:{postId});
      if(!viewActive.current)return;
      if(commentId)setPostComments(previous=>({...previous,[postId]:applyCommunityLike(previous[postId]||[],commentId,data)}));
      else {
        setPosts(previous=>applyCommunityLike(previous,postId,data,activeTab==='liked'));
        setLinkedPost(previous=>previous?.id===postId?applyCommunityLike([previous],postId,data)[0]:previous);
        if(activeTab==='liked'&&!data.liked){setShowCommentsModal(false);setSelectedPostId(null);}
      }
    } catch (err) {
      if(viewActive.current)setActionError('Không thể cập nhật lượt thích. Vui lòng thử lại.');
    }finally{interactionPending.current.delete(key);if(viewActive.current)setReactionBusy(previous=>({...previous,[key]:false}));}
  }

  async function selectPost(postId) {
    setActionError('');
    setSelectedPostId(postId);
    setShowCommentsModal(true);
    await loadComments(postId,true);
  }

  async function loadComments(postId,force=false) {
    if (!force&&(postComments[postId] || commentsRequests.current.has(postId))) return;
    commentsRequests.current.get(postId)?.abort();
    const controller=new AbortController();commentsRequests.current.set(postId,controller);
    try {
      setLoadingComments(prev => ({ ...prev, [postId]: true }));
      const response = await api.get(`/community/posts/${postId}/comments`,{signal:controller.signal});
      if(controller.signal.aborted||!viewActive.current)return;
      setPostComments(prev => ({
        ...prev,
        [postId]: response.data.comments || []
      }));
    } catch (err) {
      if(!controller.signal.aborted&&viewActive.current)setActionError('Không tải được bình luận. Vui lòng thử lại.');
    } finally {
      if(commentsRequests.current.get(postId)!==controller)return;
      commentsRequests.current.delete(postId);
      if(!viewActive.current)return;
      setLoadingComments(prev => {
        const newState = { ...prev };
        delete newState[postId];
        return newState;
      });
    }
  }

  async function handleCreateComment(postId, parentCommentId = null) {
    const form = commentForms[postId];
    const key=`send:${postId}`;
    if (!form || (!form.content?.trim() && !form.audioUrl)||interactionPending.current.has(key)) return;
    interactionPending.current.add(key);setCommentBusy(previous=>({...previous,[postId]:true}));setActionError('');
    try {
      const formData = new FormData();
      formData.append("content", form.content || "");
      if (form.audio) {
        formData.append("audio", form.audio);
      }
      if (parentCommentId) {
        formData.append("parentCommentId", parentCommentId);
      }

      const {data}=await api.post(`/community/posts/${postId}/comments`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      if(!viewActive.current)return;
      if(!data?.comment?.id)throw Error('Unconfirmed comment');
      // Display the confirmed comment immediately, even when a follow-up list request fails.
      setPostComments(previous=>({...previous,[postId]:[...(previous[postId]||[]).filter(row=>row.id!==data.comment.id),data.comment]}));
      setPosts(previous=>previous.map(row=>row.id===postId?{...row,comments_count:data.comment.comments_count??Number(row.comments_count||0)+1}:row));
      setLinkedPost(previous=>previous?.id===postId?{...previous,comments_count:data.comment.comments_count??Number(previous.comments_count||0)+1}:previous);

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
      await loadComments(postId,true);
    } catch (err) {
      if(viewActive.current)setActionError(err.response?.data?.message||'Không thể gửi bình luận. Vui lòng thử lại.');
    }finally{interactionPending.current.delete(key);if(viewActive.current)setCommentBusy(previous=>({...previous,[postId]:false}));}
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
      alert(englishText("Không thể truy cập microphone"));
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

  const content = (
    <div className="communicate-center community-page">
      <div className="communicate-header">
        <div><span className="community-eyebrow">AESP COMMUNITY</span><h1><UiText>Community</UiText></h1><p><UiText>Ask a question or share what you’re practising.</UiText></p></div>
        <div className="header-actions">
          {role === "admin" && (
            <button
              className="btn-admin-manage"
              onClick={() => setShowAdminManage(!showAdminManage)}
              title={englishText("Quản lý bài đăng")}
            >
              {showAdminManage ? <FiArrowLeft /> : <FiSettings />} 
              <span><UiText>{showAdminManage ? "Quay lại" : "Quản lý bài đăng"}</UiText></span>
            </button>
          )}
        </div>
      </div>

      {/* Hiển thị AdminCommunity khi admin bấm "Quản lý bài đăng" */}
      {showAdminManage && role === "admin" ? (
        <AdminCommunity />
      ) : (
        <>
          <div className="community-layout"><main className="community-feed">
          <div className="communicate-tabs">
            <button
              className={`tab-button ${activeTab === "all" ? "active" : ""}`}
              aria-pressed={activeTab==='all'}
              onClick={() => setActiveTab("all")}
            >{" "}<UiText text={"Tất cả bài đăng"} />{" "}</button>
            {role !== "admin" && (
              <>
                <button
                  className={`tab-button ${activeTab === "my-posts" ? "active" : ""}`}
                  aria-pressed={activeTab==='my-posts'}
                  onClick={() => setActiveTab("my-posts")}
                >{" "}<UiText text={"Các bài đăng của bạn"} />{" "}</button>
                <button
                  className={`tab-button ${activeTab === "liked" ? "active" : ""}`}
                  aria-pressed={activeTab==='liked'}
                  onClick={() => setActiveTab("liked")}
                >{" "}<UiText text={"Bài đăng yêu thích"} />{" "}</button>
              </>
            )}
          </div>

      {activeTab === "my-posts" && role !== "admin" && (
        <div className="my-posts-filters">
          <button
            className={`filter-button ${myPostsFilter === "all" ? "active" : ""}`}
            onClick={() => setMyPostsFilter("all")}
          >{" "}<UiText text={"Tất cả"} />{" "}
          </button>
          <button
            className={`filter-button ${myPostsFilter === "approved" ? "active" : ""}`}
            onClick={() => setMyPostsFilter("approved")}
          >{" "}<UiText text={"Đã duyệt"} />{" "}
          </button>
          <button
            className={`filter-button ${myPostsFilter === "pending" ? "active" : ""}`}
            onClick={() => setMyPostsFilter("pending")}
          >{" "}<UiText text={"Đang chờ"} />{" "}
          </button>
          <button
            className={`filter-button ${myPostsFilter === "rejected" ? "active" : ""}`}
            onClick={() => setMyPostsFilter("rejected")}
          >{" "}<UiText text={"Bị từ chối"} />{" "}
          </button>
        </div>
      )}

      {/* Post Form - Hiển thị trực tiếp khi tab "all" hoặc "liked" (cho tất cả roles kể cả admin) */}
      {(activeTab === "all" || activeTab === "liked" || role === "admin") && (
        <div className="post-form-card">
          <div className="post-form-header">
            <div className="author-avatar">
              <UserAvatar src={currentAvatar} name={userName} size={42}/>
            </div>
            <div className="post-form-title"><strong>{userName}</strong><span><UiText>Share an update</UiText></span></div>
            <button
              className={`btn-mic-header ${isRecording ? "recording" : ""}`}
              onClick={() => {
                if (isRecording) {
                  stopRecording(null, true);
                } else {
                  startRecording(null, true);
                }
              }}
              title={englishText(isRecording ? "Dừng ghi âm" : "Ghi âm")}
            >
              <FiMic />
            </button>
          </div>
          <div className="post-form-content">
            <textarea
              placeholder={englishText("Bạn đang nghĩ gì?")}
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              className="form-textarea"
              ref={composerRef} aria-label={englishText('Nội dung bài viết')}
              rows={3}
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
                  <div className="audio-duration"><UiText>{formatDuration(audioDuration)}</UiText></div>
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
                <span><UiText text={"Đang ghi âm..."} />{" "}<UiText>{formatDuration(recordingDuration)}</UiText></span>
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
              <label className="btn-icon" title={englishText("Upload hình ảnh hoặc video")}>
                <FiImage aria-hidden="true"/><span><UiText>Photo / video</UiText></span>
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
                <FiSend /> <UiText>{submitting ? "Đang đăng..." : "Đăng bài"}</UiText>
              </button>
            </div>
          </div>
        </div>
      )}

      {actionError&&!showCommentsModal&&<p role="alert" className="community-action-error"><UiText>{actionError}</UiText></p>}
      {/* Posts Column - Full Width */}
      <div className="posts-column">
          {loading && posts.length === 0 ? (
            <div className="loading"><UiText text={"Đang tải..."} /></div>
          ) : posts.length === 0 ? (
            <div className="empty-state">
              <p><UiText text={"Chưa có bài đăng nào"} /></p>
            </div>
          ) : (
            <div className="posts-list">
              {posts.map(post => (
                <div 
                  key={post.id} 
                  className={`post-card ${post.is_pinned ? "pinned" : ""} ${post.is_viewed === 0 ? "unviewed" : ""}`}
                  data-post-id={post.id}
                >
              {post.is_pinned && <div className="pin-badge"><UiText text={"📌 Đã ghim"} /></div>}
              
              <div className="post-header">
                <div className="post-author">
                  <div className="author-avatar">
                    <UserAvatar src={post.author_avatar_url} name={post.author_name} size={44}/>
                  </div>
                  <div>
                    <div className="author-name">{post.author_name || <UiText text={"Người dùng"} />}</div>
                    <div className="post-meta">
                      <UiText>{new Date(post.created_at).toLocaleDateString('en-GB', {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}</UiText>
                    </div>
                  </div>
                </div>
                {post.status === "pending" && (
                  <span className="status-badge pending"><UiText text={"Đang chờ duyệt"} /></span>
                )}
                {post.status === "rejected" && (
                  <span className="status-badge rejected"><UiText text={"Bị từ chối"} /></span>
                )}
              </div>

              {post.title && <h3 className="post-title">{post.title}</h3>}
              
              <div className="post-content">
                {post.content && <p>{post.content}</p>}
                {post.audio_url && (
                  <AudioPlayer src={normalizeAudioUrl(post.audio_url)} />
                )}
                <UiText>{post.image_url && renderMedia(post.image_url)}</UiText>
              </div>

              {post.status === "rejected" && post.rejection_reason && (
                <div className="rejection-reason">
                  <strong><UiText text={"Lý do từ chối:"} /></strong> <UiText>{post.rejection_reason}</UiText>
                </div>
              )}

              <div className="post-actions">
                <button
                  type="button" aria-label={englishText(post.is_liked?'Bỏ thích bài viết':'Thích bài viết')} aria-pressed={Boolean(post.is_liked)} disabled={reactionBusy[`post:${post.id}`]}
                  className={`action-btn like-btn ${post.is_liked ? "liked" : ""}`}
                  onClick={() => handleToggleLike(post.id)}
                >
                  <FiHeart aria-hidden="true" fill={post.is_liked?'currentColor':'none'}/> <UiText>{post.is_liked?'Bỏ thích':'Thích'}</UiText> <span className="community-action-count">{post.likes_count || 0}</span>
                </button>
                <button
                  type="button" aria-label={englishText('Mở bình luận')}
                  className={`action-btn comment-btn ${selectedPostId === post.id ? "active" : ""}`}
                  onClick={() => selectPost(post.id)}
                >
                  <FiMessageCircle aria-hidden="true"/> <UiText>Bình luận</UiText> <span className="community-action-count">{post.comments_count || 0}</span>
                </button>
              </div>
        </div>
      ))}
            </div>
          )}
      </div>
      </main><aside className="community-sidebar">
        <div className="community-profile-card">
          <UserAvatar src={currentAvatar} name={userName} size={64}/>
          <h2>{userName}</h2><span className="community-role"><UiText>{role==='admin'?'Admin':role==='mentor'?'Mentor':'Learner'}</UiText></span>
          {profilePath&&<Link className="community-profile-link" to={profilePath}><UiText>View profile</UiText><span aria-hidden="true">↗</span></Link>}
        </div>
        <div className="community-note-card"><h3><UiText>Your community</UiText></h3>
          <p><UiText>Questions, practice ideas and useful resources.</UiText></p>
          <button type="button" onClick={()=>{setActiveTab('all');requestAnimationFrame(()=>composerRef.current?.focus());}}><FiMessageCircle aria-hidden="true"/><UiText>Start a discussion</UiText></button>
          {role!=='admin'&&<small><UiText>Your posts appear after review.</UiText></small>}
        </div>
      </aside></div>

          {/* Comments Modal */}
          <Modal
            title={englishText("Bình luận")}
            onClose={() => {
              setShowCommentsModal(false);
              setSelectedPostId(null);
              setLinkedPost(null);
              if(linkedPostId)setSearchParams(previous=>{const next=new URLSearchParams(previous);next.delete('post');return next;},{replace:true});
            }}
            className="comments-modal community-discussion"
            isOpen={showCommentsModal && selectedPostId !== null}
          >
        {actionError&&<p role="alert" className="community-action-error"><UiText>{actionError}</UiText></p>}
        {selectedPostId && (() => {
          const post = posts.find(p => p.id === selectedPostId)||(linkedPost?.id===selectedPostId?linkedPost:null);
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
                    <UserAvatar src={comment.author_avatar_url} name={comment.author_name} size={34}/>
                  </div>
                  <div className="comment-content-wrapper">
                    <div className="author-name">
                      {comment.author_name}
                      {comment.author_role === 'admin' && <span className="admin-tag">{" "}<UiText text={"[Người quản trị]"} /></span>}
                    </div>
                    <div className="comment-content">
                      {comment.content && <p>{comment.content}</p>}
                      {comment.audio_url && <AudioPlayer src={normalizeAudioUrl(comment.audio_url)} />}
                    </div>
                    <div className="comment-meta">
                      <button type="button" className={`community-comment-like ${comment.is_liked?'liked':''}`} aria-label={englishText(comment.is_liked?'Bỏ thích bình luận':'Thích bình luận')} aria-pressed={Boolean(comment.is_liked)} disabled={reactionBusy[`comment:${comment.id}`]} onClick={()=>handleToggleLike(selectedPostId,comment.id)}><FiHeart aria-hidden="true" fill={comment.is_liked?'currentColor':'none'}/><span>{comment.likes_count||0}</span></button>
                      <UiText>{new Date(comment.created_at).toLocaleDateString('en-GB', {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}</UiText>
                      <button
                        type="button"
                        className="btn-reply-comment"
                        disabled={commentBusy[selectedPostId]}
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
                      >{" "}<UiText text={"Trả lời"} />{" "}</button>
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
                      <UserAvatar src={post.author_avatar_url} name={post.author_name} size={44}/>
                    </div>
                    <div>
                      <div className="author-name">{post.author_name || <UiText text={"Người dùng"} />}</div>
                      <div className="post-meta">
                        <UiText>{new Date(post.created_at).toLocaleDateString('en-GB', {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}</UiText>
                      </div>
                    </div>
                  </div>
                </div>
                {post.title && <h3 className="post-title">{post.title}</h3>}
                <div className="post-content">
                  {post.content && <p>{post.content}</p>}
                  {post.audio_url && <AudioPlayer src={post.audio_url} />}
                  <UiText>{post.image_url && renderMedia(post.image_url)}</UiText>
                </div>
                <div className="post-actions">
                  <button
                    type="button" aria-label={englishText(post.is_liked?'Bỏ thích bài viết':'Thích bài viết')} aria-pressed={Boolean(post.is_liked)} disabled={reactionBusy[`post:${post.id}`]}
                    className={`action-btn like-btn ${post.is_liked ? "liked" : ""}`}
                    onClick={() => handleToggleLike(post.id)}
                  >
                      <FiHeart aria-hidden="true" fill={post.is_liked?'currentColor':'none'}/> <UiText>{post.is_liked?'Bỏ thích':'Thích'}</UiText> <span className="community-action-count">{post.likes_count || 0}</span>
                  </button>
                  <button type="button" aria-label={englishText('Viết bình luận')} className="action-btn comment-btn active" onClick={()=>commentInputRef.current?.focus()}>
                    <FiMessageCircle aria-hidden="true"/> <UiText>Bình luận</UiText> <span className="community-action-count">{post.comments_count || 0}</span>
                  </button>
                </div>
              </div>

              {/* Comments - Right */}
              <div className="comments-modal-comments">
                {loadingComments[selectedPostId] ? (
                  <div className="loading-comments"><UiText text={"Đang tải bình luận..."} /></div>
                ) : (
                  <>
                    <div className="comments-list-scroll">
                      {topLevelComments.length === 0 ? (
                        <div className="empty-comments">
                          <p><UiText text={"Chưa có bình luận nào"} /></p>
                        </div>
                      ) : (
                        topLevelComments.map(comment => renderComment(comment))
                      )}
                    </div>

                    {/* Comment Form */}
                    <div className="comment-form-inline">
                      <div className="author-avatar small">
                        <UserAvatar src={currentAvatar} name={userName} size={34}/>
                      </div>
                      <div className="comment-input-wrapper">
                        {replyingTo[selectedPostId] && (
                          <div className="replying-to-indicator">{" "}<UiText text={"Đang trả lời bình luận..."} />{" "}<button onClick={() => {
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
                          placeholder={englishText(replyingTo[selectedPostId] ? "Viết trả lời..." : "Viết bình luận...")}
                          value={commentForms[selectedPostId]?.content || ""}
                          onChange={(e) => setCommentForms(prev => ({
                            ...prev,
                            [selectedPostId]: {
                              ...prev[selectedPostId],
                              content: e.target.value
                            }
                          }))}
                          className="form-textarea"
                          ref={commentInputRef} aria-label={englishText('Viết bình luận')}
                          disabled={commentBusy[selectedPostId]}
                          rows={2}
                        />
                        <div className="comment-form-actions">
                          <div className="emoji-picker-wrapper">
                            <button
                              className="btn-icon"
                              type="button" aria-label={englishText('Chọn biểu tượng cảm xúc')} disabled={commentBusy[selectedPostId]}
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
                                    <UiText>{emoji}</UiText>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            className={`btn-icon ${commentForms[selectedPostId]?.isRecording ? "recording" : ""}`}
                            type="button" aria-label={englishText('Ghi âm bình luận')} disabled={commentBusy[selectedPostId]}
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
                                  <UiText>{formatDuration(commentForms[selectedPostId].audioDuration || 0)}</UiText>
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
                            }}
                            disabled={commentBusy[selectedPostId]||(!commentForms[selectedPostId]?.content?.trim() && !commentForms[selectedPostId]?.audioUrl)}
                          >
                            <FiSend /> <UiText>{replyingTo[selectedPostId] ? 'Trả lời' : 'Gửi'}</UiText>
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

  return content;
}
