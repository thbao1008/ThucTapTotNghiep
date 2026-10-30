import { UiText } from '../../i18n/UiLanguage.jsx';
﻿import React from "react";

export default function Input({ value = "", onChange = () => {}, placeholder = "", type = "text", className = "", error = "", ...props }) {
  return (
    <div className={["input-wrap", !!error ? "has-error" : ""].filter(Boolean).join(" ")}>
      <input
        className={["input", className].filter(Boolean).join(" ")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        aria-invalid={!!error}
        {...props}
      />
      {error && <div className="input-error" role="alert"><UiText>{error}</UiText></div>}
    </div>
  );
}
