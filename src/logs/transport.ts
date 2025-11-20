import { ExportResultCode } from '@opentelemetry/core'
import { OTLPExporterError } from '@opentelemetry/otlp-exporter-base'
import {
	LogTransport,
	ReadableLogRecord,
	ExportResultCallback,
	OTLPTransportConfig,
	ConsoleTransportConfig,
} from './types'
import { unwrap } from '../wrap'
import { DEFAULT_OTLP_HEADERS } from '../constants'

/**
 * OTLP HTTP/JSON Transport for Logs
 * Sends logs to an OpenTelemetry-compatible backend using OTLP/HTTP protocol
 */
export class OTLPTransport implements LogTransport {
	readonly name = 'otlp'
	private headers: Record<string, string>
	private url: string

	constructor(config: OTLPTransportConfig) {
		this.url = config.url
		this.headers = Object.assign({}, DEFAULT_OTLP_HEADERS, config.headers)
	}

	export(logs: ReadableLogRecord[], callback: ExportResultCallback): void {
		this._export(logs)
			.then(() => {
				callback({ code: ExportResultCode.SUCCESS })
			})
			.catch((error) => {
				callback({ code: ExportResultCode.FAILED, error })
			})
	}

	private async _export(logs: ReadableLogRecord[]): Promise<void> {
		try {
			await this.send(logs)
		} catch (e) {
			throw e
		}
	}

	private async send(logs: ReadableLogRecord[]): Promise<void> {
		// Transform to OTLP JSON format
		const otlpLogs = this.transformToOTLP(logs)
		const body = JSON.stringify(otlpLogs)

		const params: RequestInit = {
			method: 'POST',
			headers: this.headers,
			body,
		}

		const response = await unwrap(fetch)(this.url, params)

		if (!response.ok) {
			throw new OTLPExporterError(`Exporter received a statusCode: ${response.status}`)
		}
	}

	private transformToOTLP(logs: ReadableLogRecord[]): any {
		// Group logs by resource and scope
		const resourceLogsMap = new Map<string, Map<string, ReadableLogRecord[]>>()

		for (const log of logs) {
			const resourceKey = JSON.stringify(log.resource.attributes)
			const scopeKey = JSON.stringify(log.instrumentationScope)

			if (!resourceLogsMap.has(resourceKey)) {
				resourceLogsMap.set(resourceKey, new Map())
			}

			const scopeLogsMap = resourceLogsMap.get(resourceKey)!
			if (!scopeLogsMap.has(scopeKey)) {
				scopeLogsMap.set(scopeKey, [])
			}

			scopeLogsMap.get(scopeKey)!.push(log)
		}

		// Build OTLP structure
		const resourceLogs: any[] = []

		for (const [resourceKey, scopeLogsMap] of resourceLogsMap) {
			const resource = logs.find((l) => JSON.stringify(l.resource.attributes) === resourceKey)!.resource

			const scopeLogs: any[] = []
			for (const [_scopeKey, scopeRecords] of scopeLogsMap) {
				const scope = scopeRecords[0]!.instrumentationScope

				scopeLogs.push({
					scope: {
						name: scope.name,
						version: scope.version,
					},
					logRecords: scopeRecords.map((log) => this.transformLogRecord(log)),
				})
			}

			resourceLogs.push({
				resource: {
					attributes: this.transformAttributes(resource.attributes),
				},
				scopeLogs,
			})
		}

		return { resourceLogs }
	}

	private transformLogRecord(log: ReadableLogRecord): any {
		const record: any = {
			timeUnixNano: this.hrTimeToString(log.timeUnixNano),
			observedTimeUnixNano: this.hrTimeToString(log.observedTimeUnixNano),
			severityNumber: log.severityNumber,
			severityText: log.severityText,
			body: this.transformBody(log.body),
			attributes: this.transformAttributes(log.attributes),
			droppedAttributesCount: log.droppedAttributesCount || 0,
		}

		if (log.traceId) {
			record.traceId = log.traceId
		}
		if (log.spanId) {
			record.spanId = log.spanId
		}
		if (log.traceFlags !== undefined) {
			record.flags = log.traceFlags
		}

		return record
	}

	private transformBody(body: any): any {
		if (body === undefined || body === null) {
			return undefined
		}
		if (typeof body === 'string') {
			return { stringValue: body }
		}
		// For objects, JSON stringify
		return { stringValue: JSON.stringify(body) }
	}

	private transformAttributes(attrs: Record<string, any>): any[] {
		return Object.entries(attrs).map(([key, value]) => ({
			key,
			value: this.transformAttributeValue(value),
		}))
	}

	private transformAttributeValue(value: any): any {
		if (typeof value === 'string') {
			return { stringValue: value }
		} else if (typeof value === 'number') {
			if (Number.isInteger(value)) {
				return { intValue: value.toString() }
			}
			return { doubleValue: value }
		} else if (typeof value === 'boolean') {
			return { boolValue: value }
		} else if (Array.isArray(value)) {
			return {
				arrayValue: {
					values: value.map((v) => this.transformAttributeValue(v)),
				},
			}
		}
		// Fallback to string
		return { stringValue: String(value) }
	}

	private hrTimeToString(hrTime: [number, number]): string {
		// Convert [seconds, nanoseconds] to nanoseconds string
		const nanos = BigInt(hrTime[0]) * BigInt(1_000_000_000) + BigInt(hrTime[1])
		return nanos.toString()
	}

	async shutdown(): Promise<void> {
		// No cleanup needed
	}
}

/**
 * Console Transport for Logs
 * Pretty-prints logs to the console for development
 */
export class ConsoleTransport implements LogTransport {
	readonly name = 'console'
	private options: ConsoleTransportConfig

	constructor(options: ConsoleTransportConfig = {}) {
		this.options = {
			pretty: options.pretty ?? true,
			colors: options.colors ?? false,
			includeTimestamp: options.includeTimestamp ?? true,
			transformLog: options.transformLog ?? ((l) => l),
		}
	}

	export(logs: ReadableLogRecord[], callback: ExportResultCallback): void {
		try {
			for (const log of logs) {
				this.printLog(this.options.transformLog ? this.options.transformLog(log) : log)
			}
			callback({ code: ExportResultCode.SUCCESS })
		} catch (error) {
			callback({ code: ExportResultCode.FAILED, error: error as Error })
		}
	}

	private printLog(log: ReadableLogRecord): void {
		if (this.options.pretty) {
			this.prettyPrint(log)
		} else {
			console.log(JSON.stringify(this.serializeLog(log)))
		}
	}

	private prettyPrint(log: ReadableLogRecord): void {
		const parts: string[] = []

		// Timestamp
		if (this.options.includeTimestamp) {
			const timestamp = new Date(log.timeUnixNano[0] * 1000).toISOString()
			parts.push(`[${timestamp}]`)
		}

		// Severity
		const severity = log.severityText || this.getSeverityText(log.severityNumber)
		parts.push(severity.padEnd(5))

		// Trace context
		if (log.traceId) {
			parts.push(`[trace: ${log.traceId.substring(0, 16)}...]`)
		}

		// Body
		const body = typeof log.body === 'string' ? log.body : JSON.stringify(log.body)
		parts.push(body)

		// Log the message
		const message = parts.join(' ')

		// Route to appropriate console method
		switch (severity) {
			case 'TRACE':
			case 'DEBUG':
				console.debug(message, log.attributes)
				break
			case 'INFO':
				console.info(message, log.attributes)
				break
			case 'WARN':
				console.warn(message, log.attributes)
				break
			case 'ERROR':
			case 'FATAL':
				console.error(message, log.attributes)
				break
			default:
				console.log(message, log.attributes)
		}
	}

	private serializeLog(log: ReadableLogRecord): any {
		return {
			timestamp: new Date(log.timeUnixNano[0] * 1000).toISOString(),
			severity: log.severityText || this.getSeverityText(log.severityNumber),
			body: log.body,
			attributes: log.attributes,
			traceId: log.traceId,
			spanId: log.spanId,
			resource: log.resource.attributes,
			scope: log.instrumentationScope,
		}
	}

	private getSeverityText(severityNumber?: number): string {
		if (!severityNumber) return 'INFO'
		if (severityNumber <= 4) return 'TRACE'
		if (severityNumber <= 8) return 'DEBUG'
		if (severityNumber <= 12) return 'INFO'
		if (severityNumber <= 16) return 'WARN'
		if (severityNumber <= 20) return 'ERROR'
		return 'FATAL'
	}

	async shutdown(): Promise<void> {
		// No cleanup needed
	}
}
