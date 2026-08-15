import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import "./index.css";

// Surface any startup error ON SCREEN and also write it to
// /tmp/tmd-frontend-error.log (via the Rust command) so it can be read even
// when there is no display/screenshot available.
function showError(msg: string) {
  const text = String(msg);
  const pre = `<pre style="color:#f66;background:#111;padding:16px;margin:0;white-space:pre-wrap;word-break:break-word;font:13px ui-monospace,monospace">${text}</pre>`;
  const root = document.getElementById("root");
  if (root) root.innerHTML = pre;
  if (document.body) document.body.innerHTML = pre;
  // eslint-disable-next-line no-console
  console.error("[tmd]", text);
  try {
    void invoke("log_frontend_error", { msg: text });
  } catch {
    /* ignore */
  }
}

// Runtime errors must NOT wipe the app: they are logged for diagnostics but the
// editor keeps running. Only a synchronous startup failure (below) may replace
// the DOM, because at that point nothing has rendered yet.
window.addEventListener("error", (e) => {
  const msg = "window.onerror: " + (e.error?.stack || e.message);
  // eslint-disable-next-line no-console
  console.error("[tmd]", msg);
  try {
    void invoke("log_frontend_error", { msg });
  } catch {
    /* ignore */
  }
});
window.addEventListener("unhandledrejection", (e) => {
  const msg =
    "unhandledrejection: " +
    (e.reason?.stack || (typeof e.reason === "string" ? e.reason : JSON.stringify(e.reason)));
  // eslint-disable-next-line no-console
  console.error("[tmd]", msg);
  try {
    void invoke("log_frontend_error", { msg });
  } catch {
    /* ignore */
  }
});

try {
  const root = document.getElementById("root");
  if (!root) {
    showError(
      "FATAL: #root element not found.\nindex.html was not served (asset protocol / frontend serving failure).",
    );
  } else {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
    try {
      void invoke("log_frontend_error", { msg: "RENDER_OK" });
    } catch {
      /* ignore */
    }
  }
} catch (e) {
  showError("render threw: " + ((e as Error)?.stack || String(e)));
}
