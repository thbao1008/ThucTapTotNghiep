import { englishText } from "../../i18n/uiLanguage.js";
import { UiText } from '../../i18n/UiLanguage.jsx';
// src/components/learner/LearnerSidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { getAuth } from "../../utils/auth";
import { useAuth } from "../../context/AuthContext";
import {
  DashboardIcon, CatalogIcon, SpeakingPracticeIcon, ChallengesIcon,
  OnlineClassesIcon, ChatIcon, CommunityIcon, FeedbackIcon, navigationLabels,
} from '../common/navigationIcons.js';

export default function LearnerSidebar({ basePath = "/learn", collapsed = false }) {
  const auth = getAuth();
  const {  } = useAuth();
  const role = auth?.user?.role || "guest";

  const learnerMenu = [
    { id: "dashboard", label: navigationLabels.dashboard, path: `${basePath}/dashboard`, icon: <DashboardIcon />, alwaysShow: true },
    { id: "catalog", label: "Learning Catalog", path: `${basePath}/catalog`, icon: <CatalogIcon />, alwaysShow: false },
    { id: "practice", label: "AI Speaking Practice", path: `${basePath}/practice`, icon: <SpeakingPracticeIcon />, alwaysShow: false },
    { id: "challenges", label: navigationLabels.challenges, path: `${basePath}/challenges`, icon: <ChallengesIcon />, alwaysShow: false },
    { id: "schedules", label: navigationLabels.onlineClasses, path: `${basePath}/schedules`, icon: <OnlineClassesIcon /> },
    { id: "chat", label: navigationLabels.chat, path: `${basePath}/chat`, icon: <ChatIcon /> },
    { id: "communicate", label: navigationLabels.community, path: `${basePath}/communicate`, icon: <CommunityIcon />, alwaysShow: false },
    { id: "feedback", label: "Feedback", path: `${basePath}/feedback`, icon: <FeedbackIcon />, alwaysShow: false },
  ];

  // Show all menu items
  const visibleMenu = learnerMenu;

  return (
    <>
      <nav className="sidebar-nav" aria-label="Learner navigation">
        {visibleMenu.map((item) => (
          <NavLink
            key={item.id} aria-label={englishText(item.label)} title={englishText(item.label)}
            to={item.path}
            end={item.path === basePath}
            className={({ isActive }) =>
              `sidebar-link${isActive ? " active" : ""}`
            }
          >
            <span className="link-icon" aria-hidden>
              <UiText>{item.icon}</UiText>
            </span>
            {!collapsed && <span className="link-label"><UiText>{item.label}</UiText></span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && <span>AESP · Learner</span>}
      </div>
    </>
  );
}
