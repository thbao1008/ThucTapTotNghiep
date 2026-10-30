import { UiText } from '../i18n/UiLanguage.jsx';
import React, { useCallback, useEffect, useRef, useState } from "react";

import { isProtectedUploadUrl, requestAuthenticatedMedia } from "./mediaRequest.js";
export { isProtectedUploadUrl, readAuthToken } from "./mediaRequest.js";

export async function loadAuthenticatedMediaUrl(src, signal) {
  return requestAuthenticatedMedia(src, signal, [
    import.meta.env.VITE_FILE_BASE,
    import.meta.env.VITE_API_BASE
  ]);
}

export function useAuthenticatedMedia(src) {
  const [mediaUrl, setMediaUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loadRequest, setLoadRequest] = useState({ attempt: 0, autoplay: false });
  const cleanupRef = useRef(null);

  useEffect(() => {
    setError(null);
    if (!src) {
      setMediaUrl(null);
      setLoadRequest(previous => ({ ...previous, autoplay: false }));
      return undefined;
    }
    if (!isProtectedUploadUrl(src)) {
      setMediaUrl(src);
      setLoadRequest(previous => ({ ...previous, autoplay: false }));
      return undefined;
    }

    const controller = new AbortController();
    setMediaUrl(null);
    const handleSessionExpired = () => {
      controller.abort();
      cleanupRef.current?.();
      cleanupRef.current = null;
      setMediaUrl(null);
      setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để nghe audio.");
    };
    window.addEventListener("session-expired", handleSessionExpired);

    loadAuthenticatedMediaUrl(src, controller.signal)
      .then(media => {
        if (controller.signal.aborted) {
          media.cleanup();
          return;
        }
        cleanupRef.current = media.cleanup;
        setMediaUrl(media.url);
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setError(error.message || "Không thể tải audio. Vui lòng thử lại.");
          setMediaUrl(null);
        }
      });

    return () => {
      controller.abort();
      window.removeEventListener("session-expired", handleSessionExpired);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [src, loadRequest.attempt]);

  const revoke = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setMediaUrl(null);
    setLoadRequest(previous => ({ ...previous, autoplay: false }));
  }, []);

  const reload = useCallback(({ autoplay = false } = {}) => {
    setLoadRequest(previous => ({ attempt: previous.attempt + 1, autoplay }));
  }, []);

  return {
    mediaUrl,
    error,
    revoke,
    reload,
    shouldAutoplay: loadRequest.autoplay
  };
}

export function useAuthenticatedMediaUrl(src) {
  return useAuthenticatedMedia(src).mediaUrl;
}

export const AuthenticatedMedia = React.forwardRef(function AuthenticatedMedia(
  { as: Element = "audio", src, onEnded, onError, onClick, ...props },
  forwardedRef
) {
  const { mediaUrl, error, revoke, reload, shouldAutoplay } = useAuthenticatedMedia(src);
  const mediaRef = useRef(null);
  const setMediaRef = useCallback(element => {
    mediaRef.current = element;
    if (typeof forwardedRef === "function") forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }, [forwardedRef]);

  useEffect(() => {
    if (shouldAutoplay && mediaUrl && mediaRef.current) {
      mediaRef.current.play().catch(error => {
        console.error("Unable to start authorized media playback:", error.message);
        revoke();
      });
    }
  }, [mediaUrl, revoke, shouldAutoplay]);

  function finishPlayback(event, callback) {
    if (typeof src === "string" && isProtectedUploadUrl(src)) revoke();
    callback?.(event);
  }

  function handleClick(event) {
    if (!mediaUrl && typeof src === "string" && isProtectedUploadUrl(src)) {
      reload({ autoplay: true });
    }
    onClick?.(event);
  }

  return (
    <>
    <Element
      {...props}
      ref={setMediaRef}
      src={mediaUrl || undefined}
      onEnded={event => finishPlayback(event, onEnded)}
      onError={event => finishPlayback(event, onError)}
      onClick={handleClick}
    />
    {error && (Element === "audio" || Element === "video") && (
      <span role="alert">
        <UiText>{error}</UiText> <button type="button" onClick={() => reload()}><UiText text={"Thử lại"} /></button>
      </span>
    )}
    </>
  );
});
