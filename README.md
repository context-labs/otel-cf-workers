# otel-cf-workers

OpenTelemetry instrumentation for Cloudflare Workers with automatic tracing for handlers, bindings, and distributed traces.

## Installation

```bash
yarn add @inference-net/otel-cf-workers @opentelemetry/api
```

## Requirements

Add the `nodejs_compat` compatibility flag to your `wrangler.toml`:

```toml
compatibility_flags = ["nodejs_compat"]
```

## Quick Start

```typescript
import { trace } from '@opentelemetry/api'
import { instrument, ResolveConfigFn } from '@inference-net/otel-cf-workers'

export interface Env {
	SIGNOZ_ENDPOINT: string
	SIGNOZ_ACCESS_TOKEN: string
	MY_KV: KVNamespace
	MY_D1: D1Database
}

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Auto-instrumented: HTTP handler
		await fetch('https://api.example.com') // Auto-instrumented: outbound fetch

		await env.MY_KV.get('key') // Auto-instrumented: KV operations
		await env.MY_D1.prepare('SELECT * FROM users').all() // Auto-instrumented: D1 queries

		// Manual instrumentation: add custom attributes
		trace.getActiveSpan()?.setAttribute('user.id', '123')

		return new Response('Hello World!')
	},
}

const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		exporter: {
			url: env.SIGNOZ_ENDPOINT,
			headers: { 'signoz-access-token': env.SIGNOZ_ACCESS_TOKEN },
		},
		service: { name: 'my-worker' },
	}
}

export default instrument(handler, config)
```

### Durable Objects

```typescript
import { instrumentDO, ResolveConfigFn } from '@inference-net/otel-cf-workers'

class MyDurableObject implements DurableObject {
	async fetch(request: Request): Promise<Response> {
		// Auto-instrumented: DO fetch handler
		await this.ctx.storage.get('key') // Auto-instrumented: DO storage
		await this.ctx.storage.sql.exec('SELECT * FROM data') // Auto-instrumented: DO SQL
		return new Response('Hello from DO!')
	}

	async alarm(): Promise<void> {
		// Auto-instrumented: DO alarm handler
	}
}

const config: ResolveConfigFn = (env, _trigger) => ({
	exporter: { url: env.OTEL_ENDPOINT },
	service: { name: 'my-durable-object' },
})

export const MyDO = instrumentDO(MyDurableObject, config)
```

## OpenTelemetry Features

### ✅ Fully Supported

- **Distributed Tracing**: Automatic W3C Trace Context propagation across services
- **Semantic Conventions**: Full support for OpenTelemetry semantic conventions (v1.28.0+)
  - `db.query.text` - Database queries and keys
  - `db.system.name` - Database system identification
  - `db.operation.name` - Operation types
  - `db.operation.batch.size` - Batch operation tracking
  - `http.*` - HTTP request/response attributes
  - `faas.*` - FaaS trigger and execution attributes
- **Custom Spans**: Create manual spans with `trace.getTracer()`
- **Span Attributes**: Set custom attributes on active spans
- **Context Propagation**: Async context management across Workers runtime
- **Sampling**: Both head and tail sampling strategies
- **Exporters**: OTLP/HTTP (JSON) format
- **Span Processors**: Custom trace-based batch processing

### Cloudflare-Specific Attributes

In addition to OpenTelemetry standard attributes, we capture Cloudflare-specific metadata:

- `cloudflare.*` - Platform-specific attributes (ray ID, colo, script version)
- `geo.*` - Request geolocation data
- Response metadata (TTL, cache status, rows read/written)
- Binding-specific attributes (KV keys, D1 query stats, R2 checksums)

## Cloudflare Platform Support

### Triggers & Handlers

| Feature                         | Status | Notes                                              |
| ------------------------------- | ------ | -------------------------------------------------- |
| HTTP Handler (`fetch`)          | ✅     | Full support with geo, headers, user-agent parsing |
| Scheduled Handler (`scheduled`) | ✅     | Cron trigger instrumentation                       |
| Queue Consumer (`queue`)        | ✅     | Message batch processing with ack/retry tracking   |
| Email Handler (`email`)         | ✅     | Incoming email processing                          |
| Durable Object `fetch`          | ✅     | DO HTTP requests                                   |
| Durable Object `alarm`          | ✅     | DO alarm triggers                                  |
| `ctx.waitUntil`                 | ✅     | Background promise tracking                        |
| Tail Handler (`tail`)           | ❌     | Not yet supported                                  |
| DO Hibernated WebSocket         | ❌     | Not yet supported                                  |

### Bindings

| Binding               | Status | Operations Instrumented                                                                  |
| --------------------- | ------ | ---------------------------------------------------------------------------------------- |
| **KV Namespace**      | ✅     | `get`, `put`, `delete`, `list`, `getWithMetadata`                                        |
| **R2 Bucket**         | ✅     | `head`, `get`, `put`, `delete`, `list`, `createMultipartUpload`, `resumeMultipartUpload` |
| **D1 Database**       | ✅     | `prepare`, `exec`, `batch`, `all`, `run`, `first`, `raw`                                 |
| **Durable Objects**   | ✅     | Stub `fetch` calls                                                                       |
| **DO Storage (KV)**   | ✅     | `get`, `put`, `delete`, `list`, `getAlarm`, `setAlarm`, `deleteAlarm`                    |
| **DO Storage (SQL)**  | ✅     | `exec`, `execBatch`                                                                      |
| **Queue Producer**    | ✅     | `send`, `sendBatch`                                                                      |
| **Service Bindings**  | ✅     | Worker-to-worker calls                                                                   |
| **Analytics Engine**  | ✅     | `writeDataPoint`                                                                         |
| **Images**            | ✅     | `get`, `list`, `delete`                                                                  |
| **Rate Limiting**     | ✅     | `limit`                                                                                  |
| **Workers AI**        | ❌     | Not yet supported                                                                        |
| **Vectorize**         | ❌     | Not yet supported                                                                        |
| **Hyperdrive**        | ❌     | Not yet supported                                                                        |
| **Browser Rendering** | ❌     | Not yet supported                                                                        |
| **Email Sending**     | ❌     | Not yet supported                                                                        |
| **mTLS**              | ❌     | Not yet supported                                                                        |

### Global APIs

| API       | Status | Notes                                           |
| --------- | ------ | ----------------------------------------------- |
| `fetch()` | ✅     | Global fetch calls with trace context injection |
| `caches`  | ✅     | Cache API operations                            |

### Cloudflare Modules

| Module               | Status |
| -------------------- | ------ |
| `cloudflare:email`   | ❌     |
| `cloudflare:sockets` | ❌     |

## Configuration

### Basic Configuration

```typescript
const config: ResolveConfigFn = (env: Env, trigger) => ({
	exporter: {
		url: env.SIGNOZ_ENDPOINT,
		headers: { 'signoz-access-token': env.SIGNOZ_ACCESS_TOKEN },
	},
	service: {
		name: 'my-service',
		version: '1.0.0', // Optional
		namespace: 'production', // Optional
	},
})
```

### Sampling

```typescript
const config: ResolveConfigFn = (env, trigger) => ({
	// ... exporter config
	sampling: {
		// Head sampling: sample 10% of requests at start
		headSampler: {
			ratio: 0.1,
			acceptRemote: true, // Accept parent trace decisions
		},
		// Tail sampling: always keep errors even if not head-sampled
		tailSampler: (trace) => {
			const rootSpan = trace.localRootSpan
			return (
				rootSpan.status.code === SpanStatusCode.ERROR || (rootSpan.spanContext().traceFlags & TraceFlags.SAMPLED) !== 0
			)
		},
	},
})
```

### Trace Context Propagation

```typescript
const config: ResolveConfigFn = (env, trigger) => ({
	// ... exporter config

	// Control outbound trace context
	fetch: {
		includeTraceContext: (request) => {
			// Only propagate to same-origin requests
			return new URL(request.url).hostname === 'api.example.com'
		},
	},

	// Control inbound trace context
	handlers: {
		fetch: {
			acceptTraceContext: (request) => {
				// Accept trace context from trusted origins
				return request.headers.get('x-trusted') === 'true'
			},
		},
	},
})
```

### Post-Processing

Redact sensitive data before export:

```typescript
const config: ResolveConfigFn = (env, trigger) => ({
	// ... exporter config
	postProcessor: (spans) => {
		return spans.map((span) => {
			// Redact URLs with tokens
			if (span.attributes['http.url']) {
				span.attributes['http.url'] = span.attributes['http.url'].replace(/token=[^&]+/, 'token=REDACTED')
			}
			// Remove sensitive headers
			delete span.attributes['http.request.header.authorization']
			return span
		})
	},
})
```

### Custom Propagator

```typescript
const config: ResolveConfigFn = (env, trigger) => ({
	// ... exporter config
	propagator: new MyCustomPropagator(),
})
```

## Manual Instrumentation

### Adding Attributes

```typescript
import { trace } from '@opentelemetry/api'

const handler = {
	async fetch(request: Request, env: Env) {
		const span = trace.getActiveSpan()
		if (span) {
			span.setAttribute('user.id', '123')
			span.setAttribute('user.role', 'admin')
		}
		return new Response('OK')
	},
}
```

### Creating Custom Spans

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api'

const handler = {
	async fetch(request: Request, env: Env) {
		const tracer = trace.getTracer('my-app')

		return await tracer.startActiveSpan('process-request', async (span) => {
			span.setAttribute('request.id', crypto.randomUUID())

			try {
				const result = await doWork()
				span.setStatus({ code: SpanStatusCode.OK })
				return new Response(result)
			} catch (error) {
				span.recordException(error)
				span.setStatus({ code: SpanStatusCode.ERROR })
				throw error
			} finally {
				span.end()
			}
		})
	},
}
```

## Limitations

- **Timing Accuracy**: The Workers runtime does not expose accurate timing information to protect against Spectre attacks. CPU-bound work may show 0ms duration. The clock only updates on I/O operations.
- **RPC-Style DO Calls**: Direct RPC method calls to Durable Objects (e.g., `await stub.myMethod()`) are not auto-instrumented. Use fetch-style calls (`await stub.fetch(request)`) for automatic tracing.

## Examples

See the [examples directory](./examples) for complete working examples:

- [Basic Worker](./examples/worker) - HTTP handler with KV and D1
- [Quickstart Guide](./examples/quickstart/QUICKSTART_GUIDE.md) - Step-by-step tutorial

## Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)

## License

BSD-3-Clause

## Contributing

Contributions welcome! This is a fork maintained by [@context-labs](https://github.com/context-labs), originally from [evanderkoogh/otel-cf-workers](https://github.com/evanderkoogh/otel-cf-workers).
