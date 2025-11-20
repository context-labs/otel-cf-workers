import { Context } from '@opentelemetry/api'
import { ExportResultCode } from '@opentelemetry/core'
import { LogRecordProcessor, LogTransport, ReadableLogRecord, BatchConfig } from './types'

/**
 * Immediate Log Record Processor
 * Exports each log record immediately without batching
 */
export class ImmediateLogRecordProcessor implements LogRecordProcessor {
	private transport: LogTransport
	private exportPromises: Promise<void>[] = []

	constructor(transport: LogTransport) {
		this.transport = transport
	}

	onEmit(logRecord: ReadableLogRecord, _context: Context): void {
		this.exportPromises.push(this.exportLog(logRecord))
	}

	private async exportLog(logRecord: ReadableLogRecord): Promise<void> {
		await scheduler.wait(1)

		return new Promise<void>((resolve, reject) => {
			this.transport.export([logRecord], (result) => {
				if (result.code === ExportResultCode.SUCCESS) {
					resolve()
				} else {
					console.error('Failed to export log:', result.error)
					reject(result.error)
				}
			})
		})
	}

	async forceFlush(): Promise<void> {
		if (this.exportPromises.length > 0) {
			await Promise.allSettled(this.exportPromises)
			this.exportPromises = []
		}
	}

	async shutdown(): Promise<void> {
		await this.forceFlush()
		await this.transport.shutdown()
	}
}

/**
 * Batch Size Log Record Processor
 * Batches log records up to a maximum queue size before exporting
 */
export class BatchSizeLogRecordProcessor implements LogRecordProcessor {
	private transport: LogTransport
	private logRecords: ReadableLogRecord[] = []
	private exportPromises: Promise<void>[] = []
	private maxQueueSize: number
	private maxExportBatchSize: number

	constructor(transport: LogTransport, config?: BatchConfig) {
		this.transport = transport
		this.maxQueueSize = config?.maxQueueSize ?? 512
		this.maxExportBatchSize = config?.maxExportBatchSize ?? this.maxQueueSize
	}

	onEmit(logRecord: ReadableLogRecord, _context: Context): void {
		this.logRecords.push(logRecord)

		// Auto-flush if queue is full
		if (this.logRecords.length >= this.maxQueueSize) {
			this.exportPromises.push(this.export())
		}
	}

	async forceFlush(): Promise<void> {
		if (this.logRecords.length > 0) {
			this.exportPromises.push(this.export())
		}

		if (this.exportPromises.length > 0) {
			await Promise.allSettled(this.exportPromises)
			this.exportPromises = []
		}
	}

	private async export(): Promise<void> {
		// Take up to maxExportBatchSize records
		const batch = this.logRecords.splice(0, this.maxExportBatchSize)

		if (batch.length === 0) {
			return
		}

		await scheduler.wait(1)

		return new Promise<void>((resolve, reject) => {
			this.transport.export(batch, (result) => {
				if (result.code === ExportResultCode.SUCCESS) {
					resolve()
				} else {
					console.error('Failed to export logs:', result.error)
					reject(result.error)
				}
			})
		})
	}

	async shutdown(): Promise<void> {
		await this.forceFlush()
		await this.transport.shutdown()
	}
}

/**
 * Multi-Transport Log Record Processor
 * Sends log records to multiple transports in parallel
 */
export class MultiTransportLogRecordProcessor implements LogRecordProcessor {
	private processors: LogRecordProcessor[]

	constructor(transports: LogTransport[], config?: BatchConfig) {
		// Create a processor for each transport
		this.processors = transports.map((transport) => {
			return createLogProcessor(transport, config)
		})
	}

	onEmit(logRecord: ReadableLogRecord, context: Context): void {
		// Send to all processors
		this.processors.forEach((p) => p.onEmit(logRecord, context))
	}

	async forceFlush(): Promise<void> {
		await Promise.allSettled(this.processors.map((p) => p.forceFlush()))
	}

	async shutdown(): Promise<void> {
		await Promise.allSettled(this.processors.map((p) => p.shutdown()))
	}
}

/**
 * Factory function to create a log processor based on strategy
 */
export function createLogProcessor(transport: LogTransport, config?: BatchConfig): LogRecordProcessor {
	const strategy = config?.strategy ?? 'size'

	switch (strategy) {
		case 'immediate':
			return new ImmediateLogRecordProcessor(transport)
		case 'size':
			return new BatchSizeLogRecordProcessor(transport, config)
		default:
			throw new Error(`Unknown batch strategy: ${strategy}`)
	}
}
