import { expect, mock, test } from 'claude-code/testing'

test('band shows context, turns and limits on every surface', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on, { turns: [10, 40, 20] })
  const resetsAt = new Date(clock.now() + 3600_000).toISOString()
  on('session.usage', async () => ({ value: {
    startedAt: 0,
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 50, resetsAt },
      { kind: 'seven_day', percentUsed: 10 },
    ],
  } }))
  on('command.register', async () => ({ value: { name: 'context-detail' } }) as never)
  on('session.start', async () => ({ cwd: '/' }) as never)

  await $.session.start({ cwd: '/' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'usage-inspector',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 120 },
    } as never)
    expect(await ui.find({ type: 'Text', text: /84k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5h/ })).toBeDefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    else expect(await ui.find({ type: 'Text', text: /ctx 42%/ })).toBeDefined()
    await ui.unmount()
  }
})

test('detail pane lists breakdown rows on every surface', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('command.register', async () => ({ value: { name: 'context-detail' } }) as never)
  on('session.start', async () => ({ cwd: '/' }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('ui.panes', async () => ({ value: [] }) as never)
  on('session.usage', async () => ({
    value: {
      startedAt: 0,
      context: {
        tokens: 84000,
        window: 200000,
        percent: 42,
        breakdown: {
          categories: [
            { name: 'System prompt', tokens: 8000, color: 'x', isDeferred: false, kind: 'used' },
            { name: 'Free space', tokens: 100000, color: 'x', isDeferred: false, kind: 'free' },
          ],
          totalTokens: 84000,
          maxTokens: 200000,
          rawMaxTokens: 200000,
          autocompactSource: 'env',
          percentage: 42,
          gridRows: [],
          model: 'test-model',
          memoryFiles: [{ path: '/a/b/CLAUDE.md', type: 'User', tokens: 900 }],
          mcpTools: [{ name: 't', serverName: 'srv', tokens: 1200, isLoaded: true }],
          agents: [],
          autoCompactThreshold: 160000,
          isAutoCompactEnabled: true,
          apiUsage: null,
        },
      },
      rateLimits: [],
    },
  }))

  await $.session.start({ cwd: '/' } as never)
  await $.command.run({ command: 'context-detail' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'usage-inspector',
      surface,
      component: 'Pane',
      requestId: 'usage-detail',
      props: { title: 'Context', isFocused: false, bodyColumns: 100, placement: 'dock' },
    } as never)
    expect(await ui.find({ type: 'Text', text: /System prompt/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /srv/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Auto-compact at 160k/ })).toBeDefined()
    await ui.unmount()
  }
})
