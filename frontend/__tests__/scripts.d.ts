// CLI 脚本与浏览器规则一一对应，实现见 scripts/seed-lib.mjs
declare module '*/scripts/seed-lib.mjs' {
  export const SEED_VERSION: string
  export function hashString(input: string): string
  export function seedFingerprint(seedRows: Record<string, unknown[]>): string
  export function isRecord(value: unknown): boolean
  export function isValidRow(row: unknown): boolean
  export function validateSeed(seedRows: unknown): {
    moduleCount: number
    totalRows: number
    fingerprint: string
  }
}
