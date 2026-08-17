import { useRef } from "react";
import { useStore } from "../../lib/store";
import { getBackend } from "../../lib/backend";
import {
  ACCENTS,
  AUTO_SAVE_OPTIONS,
  EDITOR_FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  PREVIEW_FONT_OPTIONS,
} from "../../lib/constants";
import type { AccentColor, Settings, Theme } from "../../lib/types";

const GLOBAL_HOTKEY_KEYS: (keyof Settings)[] = [
  "globalHotkeysEnabled",
  "globalHotkeyOpenPath",
];

export default function SettingsDialog() {
  const settings = useStore((s) => s.settings);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const updateSettings = useStore((s) => s.updateSettings);

  // Snapshot taken when the dialog opens so Cancel can revert live changes
  // (which are already persisted as the user makes them).
  const snapshot = useRef<Settings>(settings);

  // Apply a settings change immediately: update the store so the UI reacts,
  // persist to disk, and re-register the global hotkey when its fields change.
  async function apply(p: Partial<Settings>) {
    updateSettings(p);
    const next = useStore.getState().settings;
    try {
      await getBackend().setSettings(next);
      if (GLOBAL_HOTKEY_KEYS.some((k) => k in p)) {
        await getBackend().updateGlobalHotkey(next);
      }
    } catch (e) {
      useStore.getState().pushToast(`Could not save settings: ${String(e)}`, "error");
    }
  }

  function close() {
    setSettingsOpen(false);
  }

  async function cancel() {
    const prev = snapshot.current;
    updateSettings(prev);
    try {
      await getBackend().setSettings(prev);
      await getBackend().updateGlobalHotkey(prev);
    } catch {
      /* ignore revert failures */
    }
    setSettingsOpen(false);
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">Settings</div>
        <div className="modal-body">
          <section>
            <h3>Appearance</h3>
            <label>Theme</label>
            <select
              value={settings.theme}
              onChange={(e) => apply({ theme: e.target.value as Theme })}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>

            <label>Accent Color</label>
            <div className="accent-row">
              {ACCENTS.map((a: AccentColor) => (
                <button
                  key={a}
                  className={"accent-swatch accent-" + a + (settings.accentColor === a ? " selected" : "")}
                  onClick={() => apply({ accentColor: a })}
                  title={a}
                />
              ))}
            </div>

            <label>Editor Font Size</label>
            <select
              value={settings.fontSize}
              onChange={(e) => apply({ fontSize: Number(e.target.value) })}
            >
              {FONT_SIZE_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>

            <label>Editor Font</label>
            <select
              value={settings.fontFamily}
              onChange={(e) => apply({ fontFamily: e.target.value })}
            >
              {EDITOR_FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <label>Preview Font</label>
            <select
              value={settings.previewFontFamily}
              onChange={(e) => apply({ previewFontFamily: e.target.value })}
            >
              {PREVIEW_FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.showLineNumbers}
                onChange={(e) => apply({ showLineNumbers: e.target.checked })}
              />
              Show line numbers
            </label>
          </section>

          <section>
            <h3>Editing</h3>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.autoSave}
                onChange={(e) => apply({ autoSave: e.target.checked })}
              />
              Auto-save
            </label>
            {settings.autoSave && (
              <>
                <label>Auto-save delay (ms)</label>
                <select
                  value={settings.autoSaveDelay}
                  onChange={(e) => apply({ autoSaveDelay: Number(e.target.value) })}
                >
                  {AUTO_SAVE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.showFileDates}
                onChange={(e) => apply({ showFileDates: e.target.checked })}
              />
              Show file dates in browser
            </label>
          </section>

          <section>
            <h3>Advanced</h3>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.globalHotkeysEnabled}
                onChange={(e) => apply({ globalHotkeysEnabled: e.target.checked })}
              />
              Enable global hotkey (Open from Path)
            </label>
            <label>Global hotkey</label>
            <input
              type="text"
              value={settings.globalHotkeyOpenPath}
              onChange={(e) => apply({ globalHotkeyOpenPath: e.target.value })}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.betaUpdates}
                onChange={(e) => apply({ betaUpdates: e.target.checked })}
              />
              Receive beta updates
            </label>
          </section>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={cancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
