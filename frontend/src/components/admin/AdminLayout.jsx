// src/components/admin/AdminLayout.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";
import '../../styles/admin-workspace.css';

export default function AdminLayout({ children }) {
  return (
    <div className="shell-root theme-admin">
      <aside className="shell-sidebar">
        <AdminSidebar />
      </aside>
      <div className="shell-main">
        <AdminHeader />
        <div className="admin-breadcrumbs">{/* breadcrumbs */}</div>
        <main className="shell-content">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
