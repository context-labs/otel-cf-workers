import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { ExportResult, ExportResultCode } from '@opentelemetry/core'
import { Effect } from 'effect'
import { TraceExportError } from './errors'

const exportWith = (exporter: SpanExporter, items: ReadonlyArray<ReadableSpan>) =>
	Effect.tryPromise({
		try: () =>
			new Promise<void>((resolve, reject) => {
				exporter.export([...items], (result) => {
					if (result.code === ExportResultCode.SUCCESS) {
						resolve()
					} else {
						reject(result.error ?? new Error('Span exporter failed without an error'))
					}
				})
			}),
		catch: (cause) => new TraceExportError({ operation: 'MultiSpanExporter.export', cause }),
	})

export class MultiSpanExporter implements SpanExporter {
	private exporters: ReadonlyArray<SpanExporter>
	constructor(exporters: ReadonlyArray<SpanExporter>) {
		this.exporters = exporters
	}

	export(items: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		void Effect.runPromise(
			Effect.all(
				this.exporters.map((exporter) => exportWith(exporter, items)),
				{ discard: true },
			),
		)
			.then(() => resultCallback({ code: ExportResultCode.SUCCESS }))
			.catch((error) => resultCallback({ code: ExportResultCode.FAILED, error }))
	}

	shutdown(): Promise<void> {
		return Effect.runPromise(
			Effect.all(
				this.exporters.map((exporter) => Effect.tryPromise(() => exporter.shutdown())),
				{ discard: true },
			),
		)
	}
}

export class MultiSpanExporterAsync implements SpanExporter {
	private readonly delegate: MultiSpanExporter

	constructor(exporters: ReadonlyArray<SpanExporter>) {
		this.delegate = new MultiSpanExporter(exporters)
	}

	export(items: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		this.delegate.export(items, resultCallback)
	}

	shutdown(): Promise<void> {
		return this.delegate.shutdown()
	}
}
