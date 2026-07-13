// Recharts needs concrete sRGB paint values (oklch CSS vars don't paint reliably in SVG).
export const chartColors = {
  primary: "#2563eb",   // blue-600
  accent:  "#38bdf8",   // sky-400
  success: "#22c55e",   // green-500
  warning: "#f59e0b",   // amber-500
  danger:  "#ef4444",   // red-500
  teal:    "#14b8a6",
  violet:  "#8b5cf6",
};

export const chartPalette = [
  chartColors.primary,
  chartColors.accent,
  chartColors.success,
  chartColors.warning,
  chartColors.danger,
];

export const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--popover-foreground)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  },
  labelStyle: { color: "var(--muted-foreground)", fontSize: 11 },
};

export const axisStyle = {
  stroke: "currentColor",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};
