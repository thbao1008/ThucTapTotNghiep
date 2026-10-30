// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import App from "./app/App.jsx";
import "./styles/theme.css";
import "./styles/base.css";
import "./styles/ui-refresh.css";
import "./styles/home-refresh.css";
import './styles/learning-refresh.css';
import { UiLanguageProvider } from "./i18n/UiLanguage.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { getAuth } from "./utils/auth";

const auth = getAuth();
if (auth?.user?.role) {
  try {
    document.body.classList.add(`theme-${auth.user.role}`);
  } catch (e) {}
}

// Tạo QueryClient với một vài tuỳ chọn mặc định
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <UiLanguageProvider><AuthProvider><App /></AuthProvider></UiLanguageProvider>
    </BrowserRouter>
    {import.meta.env.VITE_SHOW_DEVTOOLS === 'true' && <ReactQueryDevtools initialIsOpen={false} />}
  </QueryClientProvider>
);
