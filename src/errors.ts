import { Schema } from 'effect'

export class TraceExportError extends Schema.TaggedError<TraceExportError>()('TraceExportError', {
	operation: Schema.String,
	cause: Schema.Defect(),
}) {}
