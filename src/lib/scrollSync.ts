import { SYNC_COOLDOWN_MS } from "./constants";

// Proportional, bidirectional scroll sync between the editor and preview with a
// cooldown guard to prevent feedback loops.
//
// State is instance-scoped (no module globals), so multiple editor/preview
// pairs — or tests — can each create their own synchronizer.

export class ScrollSync {
  private editorEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private cooling = false;
  private coolTimer: ReturnType<typeof setTimeout> | null = null;

  registerEditor(el: HTMLElement) {
    this.editorEl = el;
    this.attach(el, "editor");
  }

  registerPreview(el: HTMLElement) {
    this.previewEl = el;
    this.attach(el, "preview");
  }

  unregisterEditor() {
    this.editorEl = null;
  }

  unregisterPreview() {
    this.previewEl = null;
  }

  destroy() {
    if (this.coolTimer) clearTimeout(this.coolTimer);
    this.cooling = false;
  }

  private attach(el: HTMLElement, source: "editor" | "preview") {
    el.addEventListener("scroll", () => {
      if (this.cooling) return;
      if (!this.editorEl || !this.previewEl) return;
      const from = source === "editor" ? this.editorEl : this.previewEl;
      const to = source === "editor" ? this.previewEl : this.editorEl;
      const fromMax = from.scrollHeight - from.clientHeight;
      const toMax = to.scrollHeight - to.clientHeight;
      if (fromMax <= 0 || toMax <= 0) return;
      const ratio = from.scrollTop / fromMax;
      to.scrollTop = ratio * toMax;
      this.cooling = true;
      if (this.coolTimer) clearTimeout(this.coolTimer);
      this.coolTimer = setTimeout(() => {
        this.cooling = false;
      }, SYNC_COOLDOWN_MS);
    });
  }
}

// The app's single editor+preview pair shares one instance; tests can
// construct their own.
export const scrollSync = new ScrollSync();
