# usage-inspector

English | [繁體中文](README_ZH.md)

A Claude Code plugin that pins a one-line usage band above the prompt. Context usage, cost, tokens added per prompt, and 5-hour / 7-day limit pace stay in view without running `/context` or `/usage`. Works in the terminal, the desktop app, and VS Code.

## Features

**Usage band**

- **Context**: percent used, `tokens / window`, and session cost. Green below 60%, yellow from 60% to 84%, red at 85% and above.
- **Turns**: tokens added by each of the last 8 prompts. The latest bar is blue and labelled, e.g. `+12k`. It grows live while Claude is responding.
- **5h / 7d**: percent of each limit used, next to a marker for time elapsed in the window, plus time left and reset time. When usage runs ahead of time, the gap is hatched. Within 15 points it turns yellow; beyond that, or at 90% used, it turns red.

**Context pane**

Click `ⓘ` at the end of the band, or run `/context-detail`, to open a pane with:

- Model, auto-compact threshold and remaining headroom, cache hit rate
- Tokens per category
- Top 5 MCP servers and memory files by tokens
- Tokens used by skills, agents, and slash commands

While the pane is open it refreshes after every turn.

Turn history is kept in the plugin store, so the last 8 turns come back in a new session.

## Install

```
/plugin marketplace add purplecofe/usage-inspector
/plugin install usage-inspector@usage-inspector
```


## Layout

```
.claude-plugin/
  plugin.json        plugin metadata
  marketplace.json   marketplace entry
hooks/
  hooks.json         registers register.tsx
  register.tsx       usage band, context pane, /context-detail command
  register.test.tsx  render tests for the band and the pane
types/index.d.ts     plugin state types
promo/               15-second promo animation (Canvas, no dependencies)
```
