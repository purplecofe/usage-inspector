import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Detail, DetailRow, Limit, Snapshot } from '../types'

const snapshot = atom({ plugin: 'usage-inspector', key: 'snapshot' } as const, null)
const turns = atom({ plugin: 'usage-inspector', key: 'turns' } as const, [] as number[])
const baseline = atom({ plugin: 'usage-inspector', key: 'baseline' } as const, 0)
const detail = atom({ plugin: 'usage-inspector', key: 'detail' } as const, null)
const phase = atom({ plugin: 'usage-inspector', key: 'phase' } as const, 0)
const tick = atom({ plugin: 'usage-inspector', key: 'tick' } as const, 0)

const MAX_TURNS = 8
const PANE = 'usage-detail'
const BARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
const WINDOWS: Record<string, { label: string; ms: number }> = {
  five_hour: { label: '5h', ms: 5 * 3600_000 },
  seven_day: { label: '7d', ms: 7 * 86400_000 },
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CELLS = 6
const BAND_HEIGHT: 44 | 54 = 54
const IS_STACKED = BAND_HEIGHT === 54
const PAD_Y = IS_STACKED ? 9 : 12
const GREEN = '#34c759'
const YELLOW = '#ffb020'
const RED = '#ff453a'
const ACCENT = '#4f8cff'
const GREY = '128,128,128'

const fmtCost = (usd: number) => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const turnUsage = (list: number[]) => {
  if (list.length < 1) return undefined
  return `+${fmtTokens(list[list.length - 1] ?? 0)}`
}

const pad = (n: number) => String(n).padStart(2, '0')

const fmtLeft = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m >= 1440) return `${Math.floor(m / 1440)}d${Math.floor((m % 1440) / 60)}h`
  if (m >= 60) return `${Math.floor(m / 60)}h${pad(m % 60)}m`
  return `${m}m`
}

const fmtReset = (at: Date, withDay: boolean) =>
  `${withDay ? DAYS[at.getDay()] + ' ' : ''}${pad(at.getHours())}:${pad(at.getMinutes())}`

const ctxColor = (p: number) => (p >= 85 ? 'red' : p >= 60 ? 'yellow' : 'green')

const paceColor = (used: number, elapsed: number) => {
  if (used >= 90) return 'red'
  if (used <= elapsed) return 'green'
  return used <= elapsed + 15 ? 'yellow' : 'red'
}


const hex = (c: string) => (c === 'red' ? RED : c === 'yellow' ? YELLOW : GREEN)

const turnsSvg = (list: number[], wave?: number) => {
  const H = 16
  const W = 8 * 11 - 5
  const max = Math.max(...list, 1)
  const pad = MAX_TURNS - list.length
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  for (let i = 0; i < MAX_TURNS; i++) {
    const x = i * 11
    const idx = i - pad
    const v = idx >= 0 ? (list[idx] ?? 0) : -1
    const swing = wave === undefined ? 0 : Math.sin(wave * 0.5 - i * 0.75)
    if (v < 0) {
      const dot = Math.round(3 + (wave === undefined ? 0 : (swing + 1) * 2.5))
      out += `<rect x="${x}" y="${H - dot}" width="6" height="${dot}" rx="2" fill="rgba(${GREY},0.22)"/>`
      continue
    }
    const base = v <= 0 ? 3 : Math.max(4, Math.round((v / max) * H))
    const h = wave === undefined ? base : Math.max(3, Math.min(H, Math.round(base + swing * 4)))
    const isCurrent = idx === list.length - 1
    const fill = isCurrent ? ACCENT : `rgba(${GREY},0.5)`
    out += `<rect x="${x}" y="${H - h}" width="6" height="${h}" rx="2" fill="${fill}"/>`
  }
  return out + '</svg>'
}

const limitSvg = (id: string, used: number, elapsed: number | undefined, color: string, flow?: number) => {
  const W = 150
  const H = 10
  const u = (Math.max(0, Math.min(100, used)) / 100) * W
  const t = elapsed === undefined ? u : (Math.max(0, Math.min(100, elapsed)) / 100) * W
  const isFast = u > t
  const fillW = Math.min(u, t)
  const gapFrom = fillW
  const gapW = Math.abs(u - t)
  const hatch = isFast ? color : `rgba(${GREY},0.7)`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="16" viewBox="0 0 ${W} 16">` +
    `<defs><clipPath id="c${id}"><rect x="0" y="3" width="${W}" height="${H}" rx="5"/></clipPath>` +
    `<pattern id="h${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="5" fill="${hatch}"/></pattern></defs>` +
    (flow === undefined || fillW < 2
      ? ''
      : `<defs><clipPath id="f${id}"><rect x="0" y="3" width="${fillW.toFixed(1)}" height="${H}"/></clipPath>` +
        `<linearGradient id="s${id}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`) +
    `<rect x="0" y="3" width="${W}" height="${H}" rx="5" fill="rgba(${GREY},0.2)"/>` +
    `<g clip-path="url(#c${id})">` +
    `<rect x="${gapFrom.toFixed(1)}" y="3" width="${gapW.toFixed(1)}" height="${H}" fill="url(#h${id})"/>` +
    `<rect x="0" y="3" width="${fillW.toFixed(1)}" height="${H}" fill="${color}"/>` +
    (flow === undefined || fillW < 2
      ? ''
      : `<g clip-path="url(#c${id})"><g clip-path="url(#f${id})"><rect x="${((flow * 5) % (fillW + 60) - 40).toFixed(1)}" y="3" width="40" height="${H}" fill="url(#s${id})"/></g></g>`) +
    `</g>` +
    (elapsed === undefined
      ? ''
      : `<rect x="${Math.max(0, t - 1).toFixed(1)}" y="0" width="2" height="16" rx="1" fill="rgba(${GREY},0.9)"/>`) +
    `</svg>`
  )
}

const toSnapshot = (u: {
  context: { percent?: number; tokens?: number; window: number }
  rateLimits: Limit[]
  cost?: { usd: number }
}): Snapshot => ({
  percent: u.context.percent,
  tokens: u.context.tokens,
  window: u.context.window,
  ...(u.cost ? { cost: u.cost.usd } : {}),
  limits: u.rateLimits.map(l => ({
    kind: l.kind,
    percentUsed: l.percentUsed,
    ...(l.resetsAt ? { resetsAt: l.resetsAt } : {}),
  })),
})


const lastSegments = (path: string) => path.split('/').filter(Boolean).slice(-2).join('/')

const topRows = (rows: DetailRow[], n: number) =>
  rows
    .slice()
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, n)

async function loadDetail($: EngineInterface) {
  const u = await $.session.usage({ breakdown: 'full' })
  const b = u.context.breakdown
  if (!b) return
  const byServer = new Map<string, number>()
  for (const t of b.mcpTools) {
    byServer.set(t.serverName, (byServer.get(t.serverName) ?? 0) + t.tokens)
  }
  const api = b.apiUsage
  const input = api ? api.input_tokens + api.cache_read_input_tokens + api.cache_creation_input_tokens : 0
  const next: Detail = {
    model: b.model,
    total: b.totalTokens,
    max: b.rawMaxTokens,
    percent: b.percentage,
    isAutoCompact: b.isAutoCompactEnabled,
    ...(b.autoCompactThreshold !== undefined ? { autoCompactAt: b.autoCompactThreshold } : {}),
    categories: b.categories.map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
    mcp: [...byServer].map(([name, tokens]) => ({ name, tokens })),
    memory: b.memoryFiles.map(m => ({ name: lastSegments(m.path), tokens: m.tokens })),
    ...(b.skills
      ? { skills: { tokens: b.skills.tokens, included: b.skills.includedSkills, total: b.skills.totalSkills } }
      : {}),
    agentsTokens: b.agents.reduce((n, a) => n + a.tokens, 0),
    commandsTokens: b.slashCommands?.tokens ?? 0,
    ...(api && input > 0 ? { cacheHit: Math.round((api.cache_read_input_tokens / input) * 100) } : {}),
  }
  await update($, detail, () => next)
}

async function openDetail($: EngineInterface) {
  await loadDetail($)
  await $.ui.open({ id: PANE, title: 'Context' })
}

async function addTokens($: EngineInterface, tokens: number | undefined) {
  if (tokens === undefined) return
  const base = (await read($, baseline)) ?? 0
  const added = Math.max(0, tokens - base)
  const list = await update($, turns, prev => {
    const next = prev.slice()
    if (next.length === 0) next.push(added)
    else next[next.length - 1] = added
    return next
  })
  await $.store.set('turns', list)
}

export const register: Register = on => {
  let isBusy = false

  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('turns')
    if (Array.isArray(saved)) {
      await update($, turns, () => saved.filter((n): n is number => typeof n === 'number').slice(-MAX_TURNS))
    }
    await $.command.register({ name: 'context-detail', description: 'Show where the context window goes' })
    const u = await $.session.usage()
    await update($, snapshot, () => toSnapshot(u))
    await update($, baseline, () => u.context.tokens ?? 0)
    $.clock.every(140, () => {
      if (isBusy) void update($, phase, n => (n + 1) % 100000)
    })
    $.clock.every(60_000, () => {
      void update($, tick, n => n + 1)
    })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    isBusy = true
    const u = await $.session.usage()
    await update($, baseline, () => u.context.tokens ?? 0)
    await update($, turns, list => [...list, 0].slice(-MAX_TURNS))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, snapshot, () =>
      toSnapshot({ context: e.context, rateLimits: e.rateLimits, cost: e.cost }),
    )
    await addTokens($, e.context.tokens)
    return next(e)
  })

  on('command.run', { command: 'context-detail' }, async $ => {
    await openDetail($)
    return { text: 'Context detail opened.' }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) isBusy = false
    if (e.agentId === undefined) {
      if ((await $.ui.panes()).some(p => p.id === PANE)) await loadDetail($)
      const u = await $.session.usage()
      await update($, snapshot, () => toSnapshot(u))
      await addTokens($, u.context.tokens)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || snap === null) return next(e)
    await read($, tick)
    const list = await read($, turns)
    const now = await $.clock.now()

    const flow = e.props.isWorking ? await read($, phase) : undefined
    const pct = snap.percent
    const used = turnUsage(list)
    const tokens = `${snap.tokens === undefined ? '–' : fmtTokens(snap.tokens)} / ${fmtTokens(snap.window)}`
    const limits = ['five_hour', 'seven_day'].flatMap(kind => {
      const l = snap.limits.find(x => x.kind === kind)
      const w = WINDOWS[kind]
      if (!l || !w) return []
      const used = Math.min(100, l.percentUsed)
      const reset = l.resetsAt ? new Date(l.resetsAt) : undefined
      const elapsed = reset
        ? Math.max(0, Math.min(100, ((now - (reset.getTime() - w.ms)) / w.ms) * 100))
        : 0
      return [
        {
          kind,
          label: w.label,
          used,
          elapsed,
          color: paceColor(used, elapsed),
          left: reset ? fmtLeft(reset.getTime() - now) : '',
          at: reset ? fmtReset(reset, kind === 'seven_day') : '',
        },
      ]
    })

    if (e.surface === 'desktop' || e.surface === 'vscode') {
      const { Box, Text, Svg, Button } = $.ui.resolve(e)
      const ctx = pct === undefined ? 'green' : ctxColor(pct)
      const spacer = (key: string) => (
        <Svg
          key={key}
          source={`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="${PAD_Y}"/>`}
          alt=""
          width={1}
          height={PAD_Y}
        />
      )
      const graphic = (key: string, source: string, alt: string, width: number) => (
        <Svg key={key} source={source} alt={alt} width={width} height={16} />
      )
      const module = (
        key: string,
        label: JSX.Element | null,
        art: JSX.Element,
        values: JSX.Element,
      ) =>
        IS_STACKED ? (
          <Box key={key} flexDirection="column">
            {art}
            <Box flexDirection="row" columnGap={2}>
              {label}
              {values}
            </Box>
          </Box>
        ) : (
          <Box key={key} flexDirection="row" alignItems="center" columnGap={2}>
            {label}
            {art}
            {values}
          </Box>
        )

      const modules: JSX.Element[] = [
        module(
          'ctx',
          <Text bold>{pct === undefined ? '–' : `${pct}%`}</Text>,
          graphic('ctxa', limitSvg('ctx', pct ?? 0, undefined, hex(ctx), flow), `Context ${pct ?? 0}%`, 150),
          <Box flexDirection="row" columnGap={2}>
            <Text dimColor>{tokens}</Text>
            {snap.cost !== undefined && <Text bold>{fmtCost(snap.cost)}</Text>}
          </Box>,
        ),
      ]
      if (list.length > 0) {
        modules.push(
          module(
            'turns',
            <Text dimColor>Turns</Text>,
            graphic('turnsa', turnsSvg(list, flow), 'Tokens added per prompt', 83),
            <Text color={ACCENT} bold>{used}</Text>,
          ),
        )
      }
      for (const l of limits) {
        modules.push(
          module(
            l.kind,
            <Text bold>{l.label}</Text>,
            graphic(`${l.kind}a`, limitSvg(l.label, l.used, l.elapsed, hex(l.color), flow), `${l.label} limit ${Math.round(l.used)}% used`, 150),
            <Box flexDirection="row" columnGap={2}>
              <Text color={hex(l.color)} bold>{`${Math.round(l.used)}%`}</Text>
              <Text dimColor>{l.left ? `${l.left} · ${l.at}` : ''}</Text>
            </Box>,
          ),
        )
      }

      return (
        <Box flexDirection="column" paddingX={1}>
          {spacer('top')}
          <Box flexDirection="row" alignItems="center" columnGap={4}>
            <Box flexDirection="row" flexWrap="wrap" alignItems="flex-start" justifyContent="space-between" columnGap={3} rowGap={1} flexGrow={1}>
              {modules}
            </Box>
            <Button key="detail" label="ⓘ" plain onPress={() => openDetail($)} />
          </Box>
          {spacer('bottom')}
        </Box>
      )
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    const sep = (key: string) => (
      <Text key={key} dimColor>
        │
      </Text>
    )
    const groups: JSX.Element[] = []

    groups.push(
      <Box key="ctx" columnGap={1}>
        <Text color={pct === undefined ? undefined : ctxColor(pct)} bold>
          {pct === undefined ? 'ctx –' : `ctx ${pct}%`}
        </Text>
        <Text dimColor>{tokens}</Text>
        {snap.cost !== undefined && <Text>{fmtCost(snap.cost)}</Text>}
      </Box>,
    )

    if (list.length > 0) {
      const max = Math.max(...list, 1)
      groups.push(
        <Box key="turns" columnGap={1}>
          <Text dimColor>turns</Text>
          <Box>
            {list.map((v, i) => {
              const level = v <= 0 ? 0 : Math.max(0, Math.min(7, Math.ceil((v / max) * 8) - 1))
              const isCurrent = i === list.length - 1
              return (
                <Text key={`t${i}`} color={isCurrent ? 'cyan' : undefined} dimColor={!isCurrent}>
                  {BARS[level]}
                </Text>
              )
            })}
          </Box>
          {used && <Text color="cyan">{used}</Text>}
        </Box>,
      )
    }

    for (const l of limits) {
      const usedCells = Math.round((l.used / 100) * CELLS)
      const elapsedCells = Math.round((l.elapsed / 100) * CELLS)
      const solid = Math.min(usedCells, elapsedCells)
      const gap = Math.abs(usedCells - elapsedCells)
      const isFast = usedCells > elapsedCells
      groups.push(
        <Box key={l.kind} columnGap={1}>
          <Text dimColor>{l.label}</Text>
          <Box>
            <Text color={l.color}>{'█'.repeat(solid)}</Text>
            <Text color={isFast ? l.color : 'gray'}>{'▒'.repeat(gap)}</Text>
            <Text dimColor>{'·'.repeat(CELLS - solid - gap)}</Text>
          </Box>
          <Text color={l.color} bold>{`${Math.round(l.used)}%`}</Text>
          <Text dimColor>{l.left ? `${l.left} → ${l.at}` : ''}</Text>
        </Box>,
      )
    }

    const row: JSX.Element[] = []
    groups.forEach((g, i) => {
      if (i > 0) row.push(sep(`s${i}`))
      row.push(g)
    })

    return (
      <Box columnGap={1} justifyContent="space-between">
        <Box flexWrap="wrap" columnGap={1} flexGrow={1}>
          {row}
        </Box>
        <Button key="detail" label="ⓘ" plain onPress={() => openDetail($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const d = await read($, detail)
    const { Box, Text } = $.ui.resolve(e)
    if (d === null) return <Text dimColor>Loading…</Text>
    const Svg = e.surface === 'desktop' || e.surface === 'vscode' ? $.ui.resolve(e).Svg : undefined

    const bar = (id: string, tokens: number, color: string, cells: string) => {
      const share = d.max > 0 ? Math.min(100, (tokens / d.max) * 100) : 0
      if (Svg) {
        return <Svg source={limitSvg(id, share, undefined, color)} alt={`${share.toFixed(1)}% of window`} width={150} height={16} />
      }
      const n = Math.max(tokens > 0 ? 1 : 0, Math.round((share / 100) * 20))
      return <Text color={cells}>{'█'.repeat(n)}</Text>
    }
    const row = (key: string, name: string, tokens: number, color: string, cells: string, isDim = false) => (
      <Box key={key} flexDirection="row" alignItems="center" columnGap={2}>
        <Box width={22}>
          <Text dimColor={isDim} wrap="truncate">{name}</Text>
        </Box>
        <Box width={8} justifyContent="flex-end">
          <Text dimColor={isDim}>{fmtTokens(tokens)}</Text>
        </Box>
        {bar(key, tokens, color, cells)}
      </Box>
    )
    const heading = (t: string) => (
      <Box key={`h${t}`} marginTop={1}>
        <Text bold>{t}</Text>
      </Box>
    )

    const rows: JSX.Element[] = []
    const left = d.autoCompactAt === undefined ? undefined : Math.max(0, d.autoCompactAt - d.total)
    rows.push(
      <Box key="top" flexDirection="column">
        <Text>
          <Text bold>{`${Math.round(d.percent)}%`}</Text>
          <Text dimColor>{`  ${fmtTokens(d.total)} / ${fmtTokens(d.max)}  ·  ${d.model}`}</Text>
        </Text>
        <Text dimColor>
          {!d.isAutoCompact
            ? 'Auto-compact off'
            : left === undefined
              ? 'Auto-compact on'
              : `Auto-compact at ${fmtTokens(d.autoCompactAt ?? 0)} · ${fmtTokens(left)} left`}
          {d.cacheHit === undefined ? '' : `  ·  cache hit ${d.cacheHit}%`}
        </Text>
      </Box>,
    )

    rows.push(heading('Breakdown'))
    for (const [i, c] of d.categories.entries()) {
      const isFree = c.kind === 'free' || c.kind === 'buffer'
      rows.push(
        row(
          `cat${i}`,
          c.name,
          c.tokens,
          isFree ? `rgba(${GREY},0.45)` : ACCENT,
          isFree ? 'gray' : 'cyan',
          isFree,
        ),
      )
    }

    const mcp = topRows(d.mcp, 5)
    if (mcp.length > 0) {
      rows.push(heading('MCP servers'))
      mcp.forEach((m, i) => rows.push(row(`mcp${i}`, m.name, m.tokens, YELLOW, 'yellow')))
    }
    const memory = topRows(d.memory, 5)
    if (memory.length > 0) {
      rows.push(heading('Memory files'))
      memory.forEach((m, i) => rows.push(row(`mem${i}`, m.name, m.tokens, GREEN, 'green')))
    }
    const extras: [string, number][] = []
    if (d.skills) extras.push([`Skills ${d.skills.included}/${d.skills.total}`, d.skills.tokens])
    if (d.agentsTokens > 0) extras.push(['Agents', d.agentsTokens])
    if (d.commandsTokens > 0) extras.push(['Slash commands', d.commandsTokens])
    if (extras.length > 0) {
      rows.push(heading('Listings'))
      extras.forEach(([n, t], i) => rows.push(row(`ext${i}`, n, t, ACCENT, 'cyan')))
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        {rows}
      </Box>
    )
  })
}
