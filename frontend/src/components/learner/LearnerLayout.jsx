// src/components/learner/LearnerLayout.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import LearnerHeader from "./LearnerHeader";
import LearnerSidebar from "./LearnerSidebar";

export default function LearnerLayout({ children }) {
  return (
    <div className="shell-root theme-learner">
      <aside className="shell-sidebar">
        <LearnerSidebar />
      </aside>
      <div className="shell-main">
        <header className="shell-header">
          <LearnerHeader />
        </header>
        <div className="learner-breadcrumbs">{/* breadcrumbs nếu cần */}</div>
        <main className="shell-content">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
