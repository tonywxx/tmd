// Relative "ago" time formatting for the sidebar.
// < 60s -> "10s ago", < 60m -> "1m ago", < 24h -> "1h ago",
// <= 3d -> "3d ago", beyond -> short date "15/12/26" (DD/MM/YY).

export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  if (!ts || ts <= 0) return "";
  const diff = Math.max(0, now - ts);

  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day <= 3) return `${day}d ago`;

  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}
