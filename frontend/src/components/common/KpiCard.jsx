import { UiText } from '../../i18n/UiLanguage.jsx';
﻿// src/components/common/KpiCard.jsx
import React from "react";

export default function KpiCard({ title, value, delta, icon, color = "var(--primary)" }) {
  const deltaIsPositive = typeof delta === "number" ? delta >= 0 : null;
  return (
    <div className="kpi-card" role="group" aria-label={title}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <UiText>{title}</UiText>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-900)", marginTop: 6 }}>
            <UiText>{value}</UiText>
          </div>
        </div>

        {icon ? (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: color,
              color: "#fff",
              flexShrink: 0,
            }}
            aria-hidden
          >
            <UiText>{icon}</UiText>
          </div>
        ) : null}
      </div>

      {delta !== undefined && delta !== null && (
        <div style={{ marginTop: 8, fontSize: 13, color: deltaIsPositive ? "green" : "crimson" }}>
          <UiText>{deltaIsPositive ? `+${delta}%` : `${delta}%`}</UiText>{" "}<UiText text={"so với kỳ trước"} />{" "}</div>
      )}
    </div>
  );
}
