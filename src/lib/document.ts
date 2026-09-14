// ---- Document module (candidate C) ----
//
// Single seam for the tab open↔save lifecycle. The implementation stays
// where it is (fileops.ts opens, documentIO.ts orchestrates, persist.ts
// saves); this module is only the interface external callers program to.
//
// New code imports document lifecycle functions from here, not from the
// three implementation files directly. documentIO.ts itself keeps its direct
// imports to avoid a re-export cycle.
export {
  openFileByPath,
  previewFileByPath,
  openFileFromBrowser,
  newUntitledTab,
  duplicateActiveTab,
  openFileFromUrl,
} from "./fileops";
export {
  handleOpenFile,
  handleOpenFolder,
  saveActiveTab,
  saveActiveTabAs,
  exportPdf,
  exportHtml,
  openHelpFile,
  handleDeepLink,
} from "./documentIO";
export {
  persistTab,
  persistTabToPath,
  saveTabAs,
  applyExternalContent,
  syncFromDisk,
  watchFile,
} from "./persist";
