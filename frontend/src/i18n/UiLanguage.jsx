import React, { useContext, useEffect, useState } from 'react';
import {LanguageContext} from './uiLanguageContext.js';

import { FiGlobe } from 'react-icons/fi';
import { readTranslationPreference, writeTranslationPreference, selectUiCopy } from './uiLanguage.js';

export const useUiLanguage = () => useContext(LanguageContext);

export function UiLanguageProvider({ children }) {
  const [locale, setLocale] = useState(() => readTranslationPreference() ? 'vi' : 'en');

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const sync=event=>{if(event.key==='aesp.ui.showVietnamese')setLocale(event.newValue==='true'?'vi':'en');};
    window.addEventListener('storage',sync);
    return ()=>window.removeEventListener('storage',sync);
  }, []);
  function toggleLanguage() {
    setLocale(previous => {
      const next = previous === 'en' ? 'vi' : 'en';
      writeTranslationPreference(next === 'vi');
      return next;
    });
  }
  return <LanguageContext.Provider value={{ locale, toggleLanguage }}>{children}</LanguageContext.Provider>;
}

export function UiText({ children, text, className = '', plain = false }) {
  const { locale } = useContext(LanguageContext);
  const value = text ?? children;
  if (typeof value !== 'string') return value ?? null;
  const copy = selectUiCopy(value, locale);
  if (plain) return copy.text;
  return <span className={`ui-copy ${className}`} lang={copy.lang}>{copy.text}</span>;
}

export function TranslationToggle() {
  const { locale, toggleLanguage } = useContext(LanguageContext);

  return <button type="button" className="translation-toggle" aria-label={locale==='en'?'Switch interface to Vietnamese':'Chuyển giao diện sang tiếng Anh'} onClick={toggleLanguage}>
    <FiGlobe aria-hidden="true" /><span>{locale==='en'?'Tiếng Việt':'English'}</span>
  </button>;
}

export function UiOption({ children, value, ...props }) {
  const { locale } = useUiLanguage();
  const original = typeof children === 'string' || typeof children === 'number' ? children : '';
  const copy = selectUiCopy(String(original), locale);
  return <option {...props} value={value ?? resolveOptionValue(original)}>{copy.text}</option>;
}
function resolveOptionValue(value) { return selectUiCopy(String(value), 'en').text; }
