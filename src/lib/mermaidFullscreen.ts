import { Maximize2, Minimize2 } from "lucide-react";
import { lucideSvg } from "./iconSvg";

// Fullscreen singleton for mermaid figures. Extracted from mermaidFigure.ts
// (candidate A): behavior unchanged, only relocated.
// At most one figure is fullscreen at a time; a single document-level Escape
// listener is attached while one is active and torn down when the last figure
// exits, so we never leak listeners.
let fsCurrent: { figure: HTMLElement; btn: HTMLButtonElement } | null = null;
let fsEscHandler: ((e: KeyboardEvent) => void) | null = null;

function applyFullscreenState(
  figure: HTMLElement,
  btn: HTMLButtonElement,
  on: boolean,
): void {
  figure.classList.toggle("is-fullscreen", on);
  btn.innerHTML = lucideSvg(on ? Minimize2 : Maximize2);
  btn.title = on ? "Exit fullscreen" : "Enter fullscreen";
  btn.setAttribute("aria-label", btn.title);
}

export function setFullscreen(
  figure: HTMLElement,
  btn: HTMLButtonElement,
  on: boolean,
): void {
  if (on) {
    // If a different figure is already fullscreen, collapse it first.
    if (fsCurrent && fsCurrent.figure !== figure) {
      applyFullscreenState(fsCurrent.figure, fsCurrent.btn, false);
    }
    fsCurrent = { figure, btn };
    applyFullscreenState(figure, btn, true);
    if (!fsEscHandler) {
      fsEscHandler = (ev) => {
        if (ev.key !== "Escape" || !fsCurrent) return;
        const { figure: f, btn: b } = fsCurrent;
        if (f.isConnected) applyFullscreenState(f, b, false);
        fsCurrent = null;
        document.removeEventListener("keydown", fsEscHandler!);
        fsEscHandler = null;
      };
      document.addEventListener("keydown", fsEscHandler);
    }
  } else {
    applyFullscreenState(figure, btn, false);
    if (fsCurrent && fsCurrent.figure === figure) {
      fsCurrent = null;
      if (fsEscHandler) {
        document.removeEventListener("keydown", fsEscHandler);
        fsEscHandler = null;
      }
    }
  }
}

export function setupFullscreen(
  btn: HTMLButtonElement | null,
  figure: HTMLElement,
): void {
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const on = !figure.classList.contains("is-fullscreen");
    setFullscreen(figure, btn, on);
  });
}
