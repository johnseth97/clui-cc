// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { normalize } from './event-normalizer'
import type {
  InitEvent,
  StreamEvent,
  AssistantEvent,
  ResultEvent,
  RateLimitEvent,
  PermissionEvent,
} from '../../shared/types'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeInit(overrides: Partial<InitEvent> = {}): InitEvent {
  return {
    type: 'system',
    subtype: 'init',
    cwd: '/home/user',
    session_id: 'sess-123',
    tools: ['Bash', 'Read', 'Write'],
    mcp_servers: [],
    model: 'claude-sonnet-4-6',
    permissionMode: 'default',
    agents: [],
    skills: [],
    plugins: [],
    claude_code_version: '1.2.3',
    fast_mode_state: 'disabled',
    uuid: 'uuid-1',
    ...overrides,
  }
}

function makeStreamEvent(subEvent: StreamEvent['event']): StreamEvent {
  return {
    type: 'stream_event',
    event: subEvent,
    session_id: 'sess-123',
    parent_tool_use_id: null,
    uuid: 'uuid-2',
  }
}

function makeResult(overrides: Partial<ResultEvent> = {}): ResultEvent {
  return {
    type: 'result',
    subtype: 'success',
    session_id: 'sess-123',
    result: 'Done.',
    is_error: false,
    duration_ms: 1234,
    total_cost_usd: 0.001,
    num_turns: 2,
    usage: { input_tokens: 100, output_tokens: 50 },
    uuid: 'uuid-3',
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('normalize — system/init', () => {
  it('produces session_init from a valid init event', () => {
    const events = normalize(makeInit())
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'session_init',
      sessionId: 'sess-123',
      model: 'claude-sonnet-4-6',
      tools: ['Bash', 'Read', 'Write'],
      version: '1.2.3',
    })
  })

  it('returns [] for non-init system subtypes', () => {
    const event = makeInit({ subtype: 'other' as 'init' })
    expect(normalize(event)).toHaveLength(0)
  })

  it('falls back gracefully on missing optional fields', () => {
    const events = normalize(makeInit({ tools: undefined as any, model: undefined as any, claude_code_version: undefined as any }))
    expect(events[0]).toMatchObject({
      type: 'session_init',
      tools: [],
      model: 'unknown',
      version: 'unknown',
    })
  })
})

describe('normalize — stream_event: text', () => {
  it('emits text_chunk for text_delta', () => {
    const ev = makeStreamEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Hello world' },
    })
    const events = normalize(ev)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'text_chunk', text: 'Hello world' })
  })

  it('emits nothing for message_start/message_delta/message_stop', () => {
    for (const subtype of ['message_start', 'message_delta', 'message_stop'] as const) {
      const ev = makeStreamEvent({ type: subtype } as any)
      expect(normalize(ev)).toHaveLength(0)
    }
  })
})

describe('normalize — stream_event: tool calls', () => {
  it('emits tool_call for tool_use content_block_start', () => {
    const ev = makeStreamEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'tool-id-1', name: 'Bash' },
    })
    const events = normalize(ev)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'tool_call', toolName: 'Bash', toolId: 'tool-id-1', index: 0 })
  })

  it('emits nothing for text content_block_start', () => {
    const ev = makeStreamEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text' },
    })
    expect(normalize(ev)).toHaveLength(0)
  })

  it('emits tool_call_update for input_json_delta', () => {
    const ev = makeStreamEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"cmd":' },
    })
    const events = normalize(ev)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'tool_call_update', partialInput: '{"cmd":' })
  })

  it('emits tool_call_complete for content_block_stop', () => {
    const ev = makeStreamEvent({ type: 'content_block_stop', index: 2 })
    const events = normalize(ev)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'tool_call_complete', index: 2 })
  })
})

describe('normalize — assistant', () => {
  it('emits task_update with the message payload', () => {
    const message = { id: 'msg-1', role: 'assistant' as const, content: [], model: 'claude-sonnet-4-6' }
    const ev: AssistantEvent = {
      type: 'assistant',
      message,
      parent_tool_use_id: null,
      session_id: 'sess-123',
      uuid: 'uuid-4',
    }
    const events = normalize(ev)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'task_update', message })
  })
})

describe('normalize — result', () => {
  it('emits task_complete for a successful result', () => {
    const events = normalize(makeResult())
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'task_complete',
      result: 'Done.',
      costUsd: 0.001,
      durationMs: 1234,
      numTurns: 2,
      sessionId: 'sess-123',
    })
  })

  it('emits error for is_error=true', () => {
    const events = normalize(makeResult({ is_error: true, result: 'Something went wrong' }))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'error', message: 'Something went wrong', isError: true })
  })

  it('emits error for subtype=error', () => {
    const events = normalize(makeResult({ subtype: 'error', result: 'Oops' }))
    expect(events[0]).toMatchObject({ type: 'error', message: 'Oops' })
  })

  it('includes permissionDenials when present', () => {
    const raw = {
      ...makeResult(),
      permission_denials: [{ tool_name: 'Bash', tool_use_id: 'tid-1' }],
    }
    const events = normalize(raw as any)
    expect(events[0]).toMatchObject({
      type: 'task_complete',
      permissionDenials: [{ toolName: 'Bash', toolUseId: 'tid-1' }],
    })
  })

  it('omits permissionDenials when array is empty', () => {
    const raw = { ...makeResult(), permission_denials: [] }
    const events = normalize(raw as any)
    expect((events[0] as any).permissionDenials).toBeUndefined()
  })
})

describe('normalize — rate_limit', () => {
  it('emits rate_limit event', () => {
    const ev: RateLimitEvent = {
      type: 'rate_limit_event',
      uuid: 'uuid-5',
      rate_limit_info: {
        status: 'blocked',
        resetsAt: '2026-01-01T00:00:00Z',
        rateLimitType: 'output_tokens',
      },
    }
    const events = normalize(ev)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'rate_limit',
      status: 'blocked',
      rateLimitType: 'output_tokens',
    })
  })

  it('returns [] when rate_limit_info is missing', () => {
    const ev = { type: 'rate_limit_event', uuid: 'uuid-6' } as any
    expect(normalize(ev)).toHaveLength(0)
  })
})

describe('normalize — permission_request', () => {
  it('emits permission_request with mapped options', () => {
    const ev: PermissionEvent = {
      type: 'permission_request',
      question_id: 'q-1',
      tool: { name: 'Bash', description: 'Run shell commands', input: { command: 'ls' } },
      options: [
        { id: 'allow', label: 'Allow', kind: 'allow' },
        { id: 'deny', label: 'Deny', kind: 'deny' },
      ],
      uuid: 'uuid-7',
    }
    const events = normalize(ev)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'permission_request',
      questionId: 'q-1',
      toolName: 'Bash',
      options: [
        { id: 'allow', label: 'Allow', kind: 'allow' },
        { id: 'deny', label: 'Deny', kind: 'deny' },
      ],
    })
  })
})

describe('normalize — unknown types', () => {
  it('returns [] for unknown event types', () => {
    expect(normalize({ type: 'totally_unknown' } as any)).toHaveLength(0)
  })
})
