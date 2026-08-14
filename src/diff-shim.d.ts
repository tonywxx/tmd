// `diff` ships without bundled types in this environment; declare a minimal
// module surface for the functions we use.
declare module "diff" {
  export interface Change {
    value: string;
    added?: boolean;
    removed?: boolean;
    count?: number;
  }
  export function diffLines(
    oldStr: string,
    newStr: string,
    options?: unknown,
  ): Change[];
}
