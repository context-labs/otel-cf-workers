import { Resource } from '@opentelemetry/resources'
import { Logger, LoggerOptions, LoggerProvider, LogRecordProcessor } from './types.js'
import { WorkerLogger } from './logger.js'

// Global logger provider singleton
let globalLoggerProvider: LoggerProvider | undefined

export function setGlobalLoggerProvider(provider: LoggerProvider): void {
	globalLoggerProvider = provider
}

export function getGlobalLoggerProvider(): LoggerProvider {
	return globalLoggerProvider || new NoopLoggerProvider()
}

export class WorkerLoggerProvider implements LoggerProvider {
	private loggers: Map<string, Logger> = new Map()
	private processors: LogRecordProcessor[]
	private resource: Resource
	private minLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

	constructor(
		processors: LogRecordProcessor[],
		resource: Resource,
		minLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info',
	) {
		this.processors = processors
		this.resource = resource
		this.minLevel = minLevel
	}

	getLogger(name: string, version?: string, options?: LoggerOptions): Logger {
		const key = `${name}@${version || ''}:${options?.schemaUrl || ''}`
		if (!this.loggers.has(key)) {
			this.loggers.set(key, new WorkerLogger(name, this.processors, this.resource, version, undefined, this.minLevel))
		}
		return this.loggers.get(key)!
	}

	register(): void {
		setGlobalLoggerProvider(this)
	}

	async shutdown(): Promise<void> {
		await Promise.allSettled(this.processors.map((p) => p.shutdown()))
	}
}

// Noop implementations for when logs are not configured
class NoopLogger implements Logger {
	emit(): void {}
	trace(): void {}
	debug(): void {}
	info(): void {}
	warn(): void {}
	error(): void {}
	fatal(): void {}
	async forceFlush(): Promise<void> {}
	child(): Logger {
		return this
	}
}

class NoopLoggerProvider implements LoggerProvider {
	private logger = new NoopLogger()

	getLogger(): Logger {
		return this.logger
	}

	register(): void {}

	async shutdown(): Promise<void> {}
}

// Convenience function to get a logger from the global provider
export function getLogger(name: string, version?: string, options?: LoggerOptions): Logger {
	return getGlobalLoggerProvider().getLogger(name, version, options)
}
