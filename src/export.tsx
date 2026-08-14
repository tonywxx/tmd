// Hidden export webview (reserved). PDF export currently prints the main
// window via the Rust `print_window` command, so this window is idle.
// Kept as a build entry point for future standalone-export use.
const root = document.getElementById("export-root");
if (root) {
  root.textContent = "tmd export";
}
