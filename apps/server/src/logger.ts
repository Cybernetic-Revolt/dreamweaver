/**
 * Structured logger.
 *
 * Emits one JSON line per event, matching the inline logging convention used
 * elsewhere in the server (`console.log(JSON.stringify({ level, msg, ...ctx }))`).
 * info/warn go to stdout, error to stderr. No dependencies.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

function emit(level: LogLevel, msg: string, ctx: LogContext = {}): void {
  const line = JSON.stringify({ level, msg, ts: Date.now(), ...ctx });
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
};
