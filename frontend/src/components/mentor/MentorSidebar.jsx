import { englishText } from "../../i18n/uiLanguage.js";
import { UiText } from '../../i18n/UiLanguage.jsx';
// src/components/mentor/MentorSidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  FiClipboard,
  FiUsers,
  FiFolder
} from "react-icons/fi";
import {DashboardIcon, CommunityIcon, ChatIcon, OnlineClassesIcon, ChallengesIcon, navigationLabels} from '../common/navigationIcons.js';

export default function MentorSidebar({ collapsed = false }) {
  const {  } = useAuth();

  const menu = [
    { id: "dashboard", label: navigationLabels.dashboard, icon: <DashboardIcon />, to: "/mentor/dashboard", alwaysShow: true },
    { id: "assessment", label: "AI results & support", icon: <FiClipboard />, to: "/mentor/assessment", alwaysShow: false },
    { id: "challenges", label: navigationLabels.challenges, icon: <ChallengesIcon />, to: "/mentor/challenge-creator" },
    { id: "schedules", label: navigationLabels.onlineClasses, icon: <OnlineClassesIcon />, to: "/mentor/schedules", alwaysShow: false },
    { id: "chat", label: navigationLabels.chat, icon: <ChatIcon />, to: "/mentor/chat" },
    { id: "learners", label: "Learners", icon: <FiUsers />, to: "/mentor/learners", alwaysShow: false },
    { id: "resources", label: "Resources", icon: <FiFolder />, to: "/mentor/resources", alwaysShow: false },
    { id: "communicate", label: navigationLabels.community, icon: <CommunityIcon />, to: "/mentor/communicate", alwaysShow: false }
  ];

  // Show all menu items
  const visibleMenu = menu;

  return (
    <>
      <nav className="sidebar-nav">
        {visibleMenu.map((item) => (
          <NavLink
            key={item.id} aria-label={englishText(item.label)} title={englishText(item.label)}
            to={item.to}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            <span className="link-icon"><UiText>{item.icon}</UiText></span>
            {!collapsed && <span className="link-label"><UiText>{item.label}</UiText></span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && <span>AESP · Mentor</span>}
      </div>
    </>
  );
}
