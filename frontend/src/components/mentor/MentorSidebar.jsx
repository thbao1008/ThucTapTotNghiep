// src/components/mentor/MentorSidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  FiHome,
  FiClipboard,
  FiMessageCircle,
  FiBookOpen,
  FiCalendar,
  FiUsers,
  FiFolder,
  FiShare2
} from "react-icons/fi";

export default function MentorSidebar({ collapsed = false }) {
  const {  } = useAuth();

  const menu = [
    { id: "dashboard", label: "Dashboard", icon: <FiHome />, to: "/mentor/dashboard", alwaysShow: true },
    { id: "assessment", label: "Assessment", icon: <FiClipboard />, to: "/mentor/assessment", alwaysShow: false },
    { id: "challenge-creator", label: "Challenge Creator", icon: <FiBookOpen />, to: "/mentor/challenge-creator", alwaysShow: false },
    { id: "schedules", label: "Schedules", icon: <FiCalendar />, to: "/mentor/schedules", alwaysShow: false },
    { id: "learners", label: "Learners", icon: <FiUsers />, to: "/mentor/learners", alwaysShow: false },
    { id: "resources", label: "Resources", icon: <FiFolder />, to: "/mentor/resources", alwaysShow: false },
    { id: "communicate", label: "Communicate", icon: <FiShare2 />, to: "/mentor/communicate", alwaysShow: false }
  ];

  // Show all menu items
  const visibleMenu = menu;

  return (
    <>
      <nav className="sidebar-nav">
        {visibleMenu.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            <span className="link-icon">{item.icon}</span>
            {!collapsed && <span className="link-label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && <span>© 2025 AESP Mentor</span>}
      </div>
    </>
  );
}
