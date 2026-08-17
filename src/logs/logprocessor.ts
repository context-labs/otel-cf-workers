import { Context } from '@opentelemetry/api'
import { ExportResultCode } from '@opentelemetry/core'
import { Effect } from 'effect'
import { BatchConfig, LogRecordProcessor, LogTransport, ReadableLogRecord } from './types'

const exportLogs = (transport: LogTransport, logs: ReadonlyArray<ReadableLogRecord>): Promise<void> =>
	Effect.runPromise(
		Effect.tryPromise({
			try: () =>
				new Promise<void>((resolve, reject) => {
					transport.export([...logs], (result) => {
						if (result.code === ExportResultCode.SUCCESS) {
							resolve()
						} else {
							reject(result.error ?? new Error('Log transport failed without an error'))
						}
					})
				}),
			catch: (cause) => cause,
		}),
	)

const track = (pending: Set<Promise<void>>, promise: Promise<void>): void => {
	pending.add(promise)
	void promise.then(
		() => pending.delete(promise),
		() => pending.delete(promise),
	)
}

export class ImmediateLogRecordProcessor implements LogRecordProcessor {
	private readonly pending = new Set<Promise<void>>()

	constructor(private readonly transport: LogTransport) {}

	onEmit(logRecord: ReadableLogRecord, _context: Context): void {
		const pending = exportLogs(this.transport, [logRecord])
		track(this.pending, pending)
		void pending.catch((error) => console.error('Failed to export log:', error))
	}

	async forceFlush(): Promise<void> {
		await Promise.all(this.pending)
	}

	async shutdown(): Promise<void> {
		await this.forceFlush()
		await this.transport.shutdown()
	}
}

export class BatchSizeLogRecordProcessor implements LogRecordProcessor {
	private readonly logRecords: ReadableLogRecord[] = []
	private readonly pending = new Set<Promise<void>>()
	private draining: Promise<void> | undefined
	private closed = false

	constructor(
		private readonly transport: LogTransport,
		private readonly config: BatchConfig = {},
	) {}

	onEmit(logRecord: ReadableLogRecord, _context: Context): void {
		if (this.closed) return
		if (this.logRecords.length >= this.maxQueueSize) {
			console.warn('Dropping log record because the export queue is full')
			return
		}
		this.logRecords.push(logRecord)
		if (this.logRecords.length >= this.maxExportBatchSize) {
			void this.requestDrain().catch((error) => console.error('Failed to export logs:', error))
		}
	}

	async forceFlush(): Promise<void> {
		await this.requestDrain()
		await Promise.all(this.pending)
	}

	async shutdown(): Promise<void> {
		this.closed = true
		await this.forceFlush()
		await this.transport.shutdown()
	}

	private get maxQueueSize(): number {
		return this.config.maxQueueSize ?? 512
	}

	private get maxExportBatchSize(): number {
		return this.config.maxExportBatchSize ?? this.maxQueueSize
	}

	private requestDrain(): Promise<void> {
		if (!this.draining) {
			this.draining = this.drain().finally(() => {
				this.draining = undefined
			})
		}
		return this.draining
	}

	private async drain(): Promise<void> {
		while (this.logRecords.length > 0) {
			const batch = this.logRecords.splice(0, this.maxExportBatchSize)
			const pending = exportLogs(this.transport, batch)
			track(this.pending, pending)
			await pending
		}
	}
}

export class MultiTransportLogRecordProcessor implements LogRecordProcessor {
	private readonly processors: ReadonlyArray<LogRecordProcessor>

	constructor(transports: ReadonlyArray<LogTransport>, config?: BatchConfig) {
		this.processors = transports.map((transport) => createLogProcessor(transport, config))
	}

	onEmit(logRecord: ReadableLogRecord, context: Context): void {
		for (const processor of this.processors) processor.onEmit(logRecord, context)
	}

	async forceFlush(): Promise<void> {
		await Promise.all(this.processors.map((processor) => processor.forceFlush()))
	}

	async shutdown(): Promise<void> {
		await Promise.all(this.processors.map((processor) => processor.shutdown()))
	}
}

export function createLogProcessor(transport: LogTransport, config?: BatchConfig): LogRecordProcessor {
	switch (config?.strategy ?? 'size') {
		case 'immediate':
			return new ImmediateLogRecordProcessor(transport)
		case 'size':
			return new BatchSizeLogRecordProcessor(transport, config)
	}
}
