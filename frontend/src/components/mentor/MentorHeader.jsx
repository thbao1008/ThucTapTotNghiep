import Notifications from "../common/Notifications";
import Brand from "../common/Brand.jsx";
import {TranslationToggle, UiText } from "../../i18n/UiLanguage.jsx";
import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "../../utils/auth";
import { useAuth } from "../../context/AuthContext";
import userAvatar from "../../assets/icons/users.png";
import "../../styles/theme.css";
export default function MentorHeader() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const auth = getAuth();
  const userName = auth?.user?.name || "Mentor";

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function toggleDropdown() {
    setOpen((s) => !s);
  }

  useEffect(() => {
    function onClick(e) {
      if (!dropdownRef.current || !buttonRef.current) return;
      if (
        !dropdownRef.current.contains(e.target) &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <header className="shell-header" role="banner">
      {/* Logo */}
      <div className="header-left">
        <div className="brand-block">
          <Brand />
        </div>
      </div>

      {/* Welcome text */}
      <div className="header-center">
        <div className="welcome-text">{" "}<UiText text={"Welcome Mentor,"} />{" "}<strong>{userName}!</strong>
        </div>
      </div>

      {/* User dropdown */}
      <div className="header-right">
        <TranslationToggle />
        <Notifications />
        <div className="dropdown-wrapper">
          <button
            ref={buttonRef}
            className="user-dropdown-toggle"
            onClick={toggleDropdown}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <img
              src={auth?.user?.avatar || userAvatar}
              alt="User avatar"
              className="user-avatar"
            />
          </button>

          {open && (
            <div
              ref={dropdownRef}
              className="dropdown-menu dropdown-elevated"
              role="menu"
            >
              <button
                className="dropdown-item"
                onClick={() => {
                  navigate("/mentor/profile");
                  setOpen(false);
                }}
              >{" "}<UiText text={"Thông tin cá nhân"} />{" "}</button>
              <div className="divider-hr" />
              <button className="dropdown-item danger" onClick={handleLogout}>{" "}<UiText text={"Đăng xuất"} />{" "}</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
