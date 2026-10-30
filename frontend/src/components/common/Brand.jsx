import { UiText } from '../../i18n/UiLanguage.jsx';
import React from 'react';
import { FiMessageSquare } from 'react-icons/fi';

export default function Brand() {
  return <div className="aesp-brand" aria-label="AESP"><span className="aesp-brand-mark"><FiMessageSquare aria-hidden="true" /></span>
    <span><UiText text={"AESP"} /><span className="aesp-brand-dot">.</span></span></div>;
}
