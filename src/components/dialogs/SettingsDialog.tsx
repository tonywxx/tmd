import { useState } from "react";
import { useStore } from "../../lib/store";
import { api } from "../../lib/bridge";
import {
  ACCENTS,
  AUTO_SAVE_OPTIONS,
  EDITOR_FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  PREVIEW_FONT_OPTIONS,
} from "../../lib/constants";
import type { AccentColor, Settings, Theme } from "../../lib/types";

export default function SettingsDialog() {
  const settings = useStore((s) => s.settings);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const updateSettings = useStore((s) => s.updateSettings);
  const pushToast = useStore((s) => s.pushToast);
  const [draft, setDraft] = useState<Settings>(settings);

  function patch(p: Partial<Settings>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  async function save() {
    try {
      await api.setSettings(draft);
      updateSettings(draft);
      await api.updateGlobalHotkey(draft);
      setSettingsOpen(false);
      pushToast("Settings saved", "success");
    } catch (e) {
      pushToast(`Could not save settings: ${String(e)}`, "error");
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">Settings</div>
        <div className="modal-body">
          <section>
            <h3>Appearance</h3>
            <label>Theme</label>
            <select value={draft.theme} onChange={(e) => patch({ theme: e.target.value as Theme })}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>

            <label>Accent Color</label>
            <div className="accent-row">
              {ACCENTS.map((a: AccentColor) => (
                <button
                  key={a}
                  className={"accent-swatch accent-" + a + (draft.accentColor === a ? " selected" : "")}
                  onClick={() => patch({ accentColor: a })}
                  title={a}
                />
              ))}
            </div>

            <label>Editor Font Size</label>
            <select value={draft.fontSize} onChange={(e) => patch({ fontSize: Number(e.target.value) })}>
              {FONT_SIZE_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>

            <label>Editor Font</label>
            <select value={draft.fontFamily} onChange={(e) => patch({ fontFamily: e.target.value })}>
              {EDITOR_FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <label>Preview Font</label>
            <select value={draft.previewFontFamily} onChange={(e) => patch({ previewFontFamily: e.target.value })}>
              {PREVIEW_FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.showLineNumbers}
                onChange={(e) => patch({ showLineNumbers: e.target.checked })}
              />
              Show line numbers
            </label>
          </section>

          <section>
            <h3>Editing</h3>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.autoSave}
                onChange={(e) => patch({ autoSave: e.target.checked })}
              />
              Auto-save
            </label>
            {draft.autoSave && (
              <>
                <label>Auto-save delay (ms)</label>
                <select
                  value={draft.autoSaveDelay}
                  onChange={(e) => patch({ autoSaveDelay: Number(e.target.value) })}
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
                checked={draft.showFileDates}
                onChange={(e) => patch({ showFileDates: e.target.checked })}
              />
              Show file dates in browser
            </label>
          </section>

          <section>
            <h3>Advanced</h3>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.globalHotkeysEnabled}
                onChange={(e) => patch({ globalHotkeysEnabled: e.target.checked })}
              />
              Enable global hotkey (Open from Path)
            </label>
            <label>Global hotkey</label>
            <input
              type="text"
              value={draft.globalHotkeyOpenPath}
              onChange={(e) => patch({ globalHotkeyOpenPath: e.target.value })}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.betaUpdates}
                onChange={(e) => patch({ betaUpdates: e.target.checked })}
              />
              Receive beta updates
            </label>
          </section>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={() => setSettingsOpen(false)}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
