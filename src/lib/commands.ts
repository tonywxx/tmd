// ---- Command module ----
//
// One interface — executeCommand(name, …args) — for every action the app can
// take, regardless of entry point (native menu, deep link, global hotkey,
// toolbar button, watcher event). Callers register handlers with
// registerCommand; wiring layers (App.tsx) map external events to command
// names. This gives locality: all entry points converge on the same handlers.

export type CommandHandler = (...args: unknown[]) => void | Promise<void>;

const registry = new Map<string, CommandHandler>();

export function registerCommand(name: string, fn: CommandHandler): void {
  registry.set(name, fn);
}

export function executeCommand(
  name: string,
  ...args: unknown[]
): void | Promise<void> {
  return registry.get(name)?.(...args);
}

export function hasCommand(name: string): boolean {
  return registry.has(name);
}
