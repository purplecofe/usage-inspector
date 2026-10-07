export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = {
  percent?: number
  tokens?: number
  window: number
  cost?: number
  limits: Limit[]
}

export type DetailRow = { name: string; tokens: number }
export type Detail = {
  model: string
  total: number
  max: number
  percent: number
  isAutoCompact: boolean
  autoCompactAt?: number
  categories: (DetailRow & { kind: string })[]
  mcp: DetailRow[]
  memory: DetailRow[]
  skills?: { tokens: number; included: number; total: number }
  agentsTokens: number
  commandsTokens: number
  cacheHit?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-inspector': {
      snapshot: Snapshot | null
      turns: number[]
      baseline: number
      tick: number
      phase: number
      detail: Detail | null
    }
  }
}
