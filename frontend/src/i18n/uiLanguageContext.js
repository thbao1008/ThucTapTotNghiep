import {createContext} from 'react';

// Copy regeneration must not replace the context used by mounted consumers.
export const LanguageContext = createContext({locale:'en',toggleLanguage(){}});
