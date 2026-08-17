import { ExportResult, ExportResultCode } from '@opentelemetry/core'
import { OTLPExporterError } from '@opentelemetry/otlp-exporter-base'
import { JsonTraceSerializer } from '@opentelemetry/otlp-transformer'
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { Effect } from 'effect'
import { unwrap } from './wrap'
import { DEFAULT_OTLP_HEADERS } from './constants'
import { TraceExportError } from './errors'

export interface OTLPExporterConfig {
	url: string
	headers?: Record<string, string>
	fetch?: typeof globalThis.fetch
}

export class OTLPExporter implements SpanExporter {
	private headers: Record<string, string>
	private url: string
	private fetch: typeof globalThis.fetch
	constructor(config: OTLPExporterConfig) {
		this.url = config.url
		this.headers = Object.assign({}, DEFAULT_OTLP_HEADERS, config.headers)
		this.fetch = config.fetch ?? unwrap(globalThis.fetch)
	}

	export(items: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		void Effect.runPromise(this.exportEffect(items))
			.then(() => {
				resultCallback({ code: ExportResultCode.SUCCESS })
			})
			.catch((error) => {
				resultCallback({ code: ExportResultCode.FAILED, error })
			})
	}

	private exportEffect = Effect.fn('OTLPExporter.export')(function* (this: OTLPExporter, items: ReadableSpan[]) {
		return yield* Effect.tryPromise({
			try: async (signal) => {
				const exportMessage = JsonTraceSerializer.serializeRequest(items)
				const response = await this.fetch(this.url, {
					method: 'POST',
					headers: this.headers,
					body: new TextDecoder().decode(exportMessage),
					signal,
				})
				try {
					if (!response.ok) {
						throw new OTLPExporterError(`Exporter received a statusCode: ${response.status}`)
					}
				} finally {
					await response.body?.cancel()
				}
			},
			catch: (cause) => new TraceExportError({ operation: 'OTLPExporter.export', cause }),
		})
	})

	async shutdown(): Promise<void> {}
}
