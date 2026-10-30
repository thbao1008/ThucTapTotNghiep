import React, { useEffect, useState } from 'react';

// A Blob URL belongs to this rendered player, never to repeated renders.
export default function RecordedAudio({ blob, ...props }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url ? <audio {...props} src={url} /> : null;
}
