import { englishText } from '../../i18n/uiLanguage.js';
import { UiText } from '../../i18n/UiLanguage.jsx';
﻿import React from "react";
import { createPortal } from "react-dom";
import "../../styles/modal.css";

export default function Modal({ title, children, onClose, className = "", isOpen = true }) {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        // chỉ đóng khi click đúng overlay
        if (e.target.classList.contains("modal-overlay")) {
          onClose?.();
        }
      }}
    >
      <div className={`modal-card ${className}`} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="modal-header">
            <h3><UiText>{title}</UiText></h3>
            <button
              className="btn-close"
              onClick={onClose}
              aria-label={englishText("Đóng")}
            >
              ✕
            </button>
          </div>
        )}
        <div className="modal-body"><UiText>{children}</UiText></div>
      </div>
    </div>,
    document.body
  );
}
