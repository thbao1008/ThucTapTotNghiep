import React from "react";
import { Outlet } from "react-router-dom";
import MentorHeader from "./MentorHeader";
import MentorSidebar from "./MentorSidebar";

export default function MentorLayout({ children }) {
  return (
    <div className="shell-root theme-mentor">
      <aside className="shell-sidebar">
        <MentorSidebar />
      </aside>
      <div className="shell-main">
        <MentorHeader />
        <div className="mentor-breadcrumbs">{/* breadcrumbs nếu cần */}</div>
        <main className="shell-content">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
