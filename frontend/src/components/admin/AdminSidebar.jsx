// src/components/admin/AdminSidebar.jsx
import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  FiHome, FiUsers, FiPackage,
  FiShoppingBag, FiBarChart2, FiLifeBuoy,
  FiMessageCircle, FiShare2
} from "react-icons/fi";
import api from "../../api.js";

export default function AdminSidebar({ collapsed = false }) {
  const {  } = useAuth();
  const [stats, setStats] = useState({ traffic: 0, online: 0 });

  async function fetchTrafficStats() {
    try {
      const res = await api.get("/admin/dashboard/traffic");
      if (res.data.success && res.data.stats) {
        setStats({
          traffic: res.data.stats.totalTraffic || 0,
          online: res.data.stats.onlineUsers || 0
        });
      }
    } catch (err) {
      console.error("❌ Lỗi load traffic stats:", err);
    }
  }

  useEffect(() => {
    fetchTrafficStats();
    const interval = setInterval(fetchTrafficStats, 30000); // Update mỗi 30 giây
    return () => clearInterval(interval);
  }, []);

  const menu = [
    { id: "dashboard", label: "Dashboard", icon: <FiHome />, to: "/admin", alwaysShow: true },
    { id: "users", label: "Users", icon: <FiUsers />, to: "/admin/users", alwaysShow: false },
    { id: "packages", label: "Packages", icon: <FiPackage />, to: "/admin/packages", alwaysShow: false },
    { id: "purchases", label: "Purchases", icon: <FiShoppingBag />, to: "/admin/purchases", alwaysShow: false },
    { id: "reports", label: "Reports", icon: <FiBarChart2 />, to: "/admin/reports", alwaysShow: false },
    { id: "support", label: "Support", icon: <FiLifeBuoy />, to: "/admin/support", alwaysShow: false },
    { id: "communicate", label: "Communicate", icon: <FiShare2 />, to: "/admin/communicate", alwaysShow: false },
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

      {/* Block thống kê */}
      <div className="sidebar-stats">
        <div className="stat-item">
          <span className="stat-label">Lưu lượng</span>
          <span className="stat-value">{stats.traffic.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Đang online</span>
          <span className="stat-value">{stats.online}</span>
        </div>
      </div>

      <div className="sidebar-footer">
        {!collapsed && <span>© 2025 AESP Admin</span>}
      </div>
    </>
  );
}
