import { englishText } from "../../i18n/uiLanguage.js";
import { UiText } from '../../i18n/UiLanguage.jsx';
﻿// src/components/admin/AdminSidebar.jsx
import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  FiUsers, FiPackage,
  FiShoppingBag, FiBarChart2, FiLifeBuoy
} from "react-icons/fi";
import {DashboardIcon, CommunityIcon, navigationLabels} from '../common/navigationIcons.js';
import api from "../../api.js";

export default function AdminSidebar({ collapsed = false }) {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    setStats(null);
    async function load() {
      if (pending || controller.signal.aborted || user?.role !== 'admin') return;
      pending = true;
      try {
        const {data} = await api.get('/admin/dashboard/traffic', {signal:controller.signal,timeout:12000});
        const value=data?.stats;
        if(!data?.success || !Number.isSafeInteger(value?.totalTraffic) || value.totalTraffic<0
          || !Number.isSafeInteger(value?.onlineUsers) || value.onlineUsers<0)throw Error('Invalid traffic response');
        if(!controller.signal.aborted)setStats({traffic:value.totalTraffic,online:value.onlineUsers});
      } catch {if(!controller.signal.aborted)setStats(null);}
      finally {pending=false;}
    }
    load(); const timer=setInterval(load,30000);
    return ()=>{clearInterval(timer);controller.abort();};
  }, [user?.id,user?.role]);

  const menu = [
    { id: "dashboard", label: navigationLabels.dashboard, icon: <DashboardIcon />, to: "/admin", alwaysShow: true },
    { id: "users", label: "Users", icon: <FiUsers />, to: "/admin/users", alwaysShow: false },
    { id: "packages", label: "Packages", icon: <FiPackage />, to: "/admin/packages", alwaysShow: false },
    { id: "purchases", label: "Purchases", icon: <FiShoppingBag />, to: "/admin/purchases", alwaysShow: false },
    { id: "reports", label: "Reports", icon: <FiBarChart2 />, to: "/admin/reports", alwaysShow: false },
    { id: "support", label: "Support", icon: <FiLifeBuoy />, to: "/admin/support", alwaysShow: false },
    { id: "communicate", label: navigationLabels.community, icon: <CommunityIcon />, to: "/admin/communicate", alwaysShow: false },
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
            end={item.to === '/admin'}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            <span className="link-icon"><UiText>{item.icon}</UiText></span>
            {!collapsed && <span className="link-label"><UiText>{item.label}</UiText></span>}
          </NavLink>
        ))}
      </nav>

      {/* Block thống kê */}
      <div className="sidebar-stats">
        <div className="stat-item">
          <span className="stat-label"><UiText text={"Lưu lượng"} /></span>
          <span className="stat-value"><UiText>{stats ? stats.traffic.toLocaleString('en-GB') : '—'}</UiText></span>
        </div>
        <div className="stat-item">
          <span className="stat-label"><UiText text={"Đang online"} /></span>
          <span className="stat-value"><UiText>{stats ? stats.online : '—'}</UiText></span>
        </div>
      </div>

      <div className="sidebar-footer">
        {!collapsed && <span>AESP · Admin</span>}
      </div>
    </>
  );
}
