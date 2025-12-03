// Structured logging utilities for meeting pipeline

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export type LogContext = {
  meetingId?: string
  userId?: string
  googleEventId?: string
  botId?: string
  operation?: string
  [key: string]: unknown
}

export type StateTransitionLog = {
  meetingId: string
  oldState: string | null
  newState: string
  timestamp: string
  context: LogContext
}

export type ErrorLog = {
  meetingId?: string
  error: {
    type: string
    message: string
    stack?: string
  }
  context: LogContext
  severity: 'low' | 'medium' | 'high' | 'critical'
  timestamp: string
}

export type BotOperationLog = {
  operation: 'create' | 'delete' | 'update'
  botId: string
  meetingId: string
  result: 'success' | 'failure'
  error?: string
  timestamp: string
  context: LogContext
}

// Generate correlation ID for request tracing
let correlationCounter = 0
export function generateCorrelationId(): string {
  const timestamp = Date.now()
  const counter = (correlationCounter++ % 10000).toString().padStart(4, '0')
  return `req-${timestamp}-${counter}`
}

/**
 * Logs a state transition with full context
 */
export function logStateTransition(
  meetingId: string,
  oldState: string | null,
  newState: string,
  context: LogContext = {}
): void {
  const log: StateTransitionLog = {
    meetingId,
    oldState,
    newState,
    timestamp: new Date().toISOString(),
    context: {
      ...context,
      correlationId: context.correlationId || generateCorrelationId()
    }
  }

  console.log(JSON.stringify({
    type: 'state_transition',
    ...log
  }))
}

/**
 * Logs an error with structured context
 */
export function logError(
  meetingId: string | undefined,
  error: Error | unknown,
  context: LogContext = {},
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): void {
  const errorObj = error instanceof Error 
    ? {
        type: error.constructor.name,
        message: error.message,
        stack: error.stack
      }
    : {
        type: typeof error,
        message: String(error)
      }

  const log: ErrorLog = {
    meetingId,
    error: errorObj,
    context: {
      ...context,
      correlationId: context.correlationId || generateCorrelationId()
    },
    severity,
    timestamp: new Date().toISOString()
  }

  const logLevel = severity === 'critical' || severity === 'high' ? 'error' : 'warn'
  console[logLevel](JSON.stringify({
    type: 'error',
    ...log
  }))
}

/**
 * Logs a bot operation with result
 */
export function logBotOperation(
  operation: 'create' | 'delete' | 'update',
  botId: string,
  meetingId: string,
  result: 'success' | 'failure',
  context: LogContext = {},
  error?: string
): void {
  const log: BotOperationLog = {
    operation,
    botId,
    meetingId,
    result,
    error,
    timestamp: new Date().toISOString(),
    context: {
      ...context,
      correlationId: context.correlationId || generateCorrelationId()
    }
  }

  const logLevel = result === 'success' ? 'info' : 'error'
  console[logLevel](JSON.stringify({
    type: 'bot_operation',
    ...log
  }))
}

/**
 * Logs a general meeting event with structured format
 */
export function logMeetingEvent(
  level: LogLevel,
  event: string,
  context: LogContext = {}
): void {
  const log = {
    type: 'meeting_event',
    level,
    event,
    timestamp: new Date().toISOString(),
    context: {
      ...context,
      correlationId: context.correlationId || generateCorrelationId()
    }
  }

  console[level](JSON.stringify(log))
}

/**
 * Creates a timing context for performance monitoring
 */
export function createTimingContext(): { start: number; end: () => number; elapsed: () => number } {
  const start = Date.now()
  return {
    start,
    end: () => Date.now(),
    elapsed: () => Date.now() - start
  }
}

