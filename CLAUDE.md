# CLAUDE.md - AI Assistant Context

## Package Overview

`@inference-net/otel-cf-workers` is an OpenTelemetry instrumentation library for **Cloudflare Workers**. This is a fork maintained by `@context-labs` (published as `@inference-net`), originally from `evanderkoogh/otel-cf-workers`.

**Current Version**: `1.0.0-rc.52`
**License**: BSD-3-Clause
**Repository**: https://github.com/context-labs/otel-cf-workers

## What This Library Does

1. **Auto-instrumentation** - Automatically traces Cloudflare Workers handlers and bindings without manual span creation
2. **Distributed Tracing** - Propagates W3C Trace Context headers across service boundaries
3. **OTLP Export** - Sends traces to OpenTelemetry-compatible backends (Honeycomb, Datadog, Grafana, etc.)
4. **Smart Sampling** - Head and tail sampling strategies to control trace volume and costs
5. **Context Propagation** - Maintains trace context across async boundaries in the Workers runtime

## Architecture

### Why Custom Implementation?

This library uses **custom tracer and span processor implementations** rather than the standard OpenTelemetry SDK because:

- **No Node.js Runtime**: Workers lack Node.js APIs that standard OTel SDK depends on
- **Unique Execution Model**: Workers have no persistent process; each request is isolated
- **Timing Constraints**: Workers don't expose accurate timing (Spectre protection)
- **Trace-Based Batching**: Exports complete traces at once rather than time-based batching

### Key Components

```
src/
├── sdk.ts              # Main instrument() and instrumentDO() functions
├── provider.ts         # WorkerTracerProvider (custom provider)
├── tracer.ts           # WorkerTracer (custom tracer implementation)
├── spanprocessor.ts    # BatchTraceSpanProcessor (trace-based batching)
├── exporter.ts         # OTLPExporter (OTLP/HTTP JSON)
├── config.ts           # Configuration parsing and management
├── sampling.ts         # Head and tail sampling logic
├── instrumentation/
│   ├── fetch.ts        # Global fetch + HTTP handler instrumentation
│   ├── kv.ts          # KV namespace operations
│   ├── d1.ts          # D1 database queries
│   ├── do.ts          # Durable Objects (fetch, alarm, storage)
│   ├── queue.ts       # Queue bindings
│   ├── cache.ts       # Cache API
│   ├── env.ts         # Binding detection and wrapping
│   └── ...
```

### Span Processing Flow

```
1. Handler invoked (fetch, scheduled, queue, etc.)
2. WorkerTracer creates spans
3. BatchTraceSpanProcessor groups spans by traceId
4. When all spans in trace complete → tail sampling decision
5. If sampled → export via OTLPExporter
6. Flush happens in ctx.waitUntil() to avoid blocking response
```

## OpenTelemetry Spec Coverage

### ✅ Implemented

#### Core APIs

- **Tracing API**: Full support (custom provider/tracer/span implementation)
- **Context Propagation**: W3C Trace Context (configurable propagators)
- **Semantic Conventions**: HTTP, Database, FaaS attributes
- **Span Processors**: Custom trace-based batch processor
- **Exporters**: OTLP/HTTP (JSON format)

#### Sampling

- **Head Sampling**: AlwaysOn, Ratio-based, custom Sampler support
- **Tail Sampling**: Function-based sampling at trace completion (unique feature)

#### Triggers (Entry Points)

- ✅ `handler.fetch` - HTTP requests
- ✅ `handler.scheduled` - Cron triggers
- ✅ `handler.queue` - Queue consumers
- ✅ `handler.email` - Email handlers
- ✅ Durable Object `fetch` method
- ✅ Durable Object `alarm` method
- ✅ `ctx.waitUntil` - Promise tracking

#### Globals/Built-ins

- ✅ Global `fetch()` - Outbound HTTP calls
- ✅ Cache API (`caches`) - Cache operations

#### Cloudflare Bindings

- ✅ **KV** - get, put, delete, list, getWithMetadata
- ✅ **Queue** - Producer send operations (send, sendBatch)
- ✅ **Durable Objects** - Stub fetch calls AND RPC method calls (fully instrumented)
- ✅ **D1** - prepare, exec, batch, all, run, first, raw
- ✅ **Service Bindings** - Worker-to-worker RPC calls
- ✅ **Analytics Engine** - writeDataPoint
- ✅ **R2** - head, get, put, delete, list, createMultipartUpload, resumeMultipartUpload
- ✅ **Images** - get, list, delete (basic implementation)
- ✅ **Rate Limiting** - limit operation
- ✅ **Durable Object Storage (KV API)** - get, put, delete, list, getAlarm, setAlarm, deleteAlarm
- ✅ **Durable Object Storage (SQL API)** - sql.exec() with cursor instrumentation

### ❌ Not Implemented

#### OpenTelemetry APIs

- ✅ **Logs API** - IMPLEMENTED! Structured logging with OTLP export and console instrumentation
- ❌ **Metrics API** - Only tracing and logging are supported
- ❌ **Baggage API** - Can be added via custom propagators

#### Triggers

- ❌ `handler.tail` - Tail consumers
- ❌ Durable Objects hibernated WebSocket handlers

#### Cloudflare Modules

- ❌ `cloudflare:email` module (handler is instrumented, but not the module)
- ❌ `cloudflare:sockets` module

#### Bindings

- ❌ **Browser Rendering** - Puppeteer API
- ❌ **Workers AI** - AI model inference
- ❌ **Email Sending** - Outbound email (receiving via handler.email IS instrumented)
- ❌ **mTLS** - Mutual TLS bindings
- ❌ **Vectorize** - Vector database
- ❌ **Hyperdrive** - Database connection pooling
- ❌ **Workers for Platforms Dispatch** - Multi-tenant dispatch

#### Durable Object SQL Storage (Partial)

- ❌ **sql.prepare()** - SQL prepared statements not instrumented (returns `SqlStorageStatement`)
- ❌ **sql.ingest()** - Bulk data ingest not instrumented (returns `SqlStorageIngestResult`)
- ❌ **sql.databaseSize** - Database size getter property not instrumented
- ✅ **sql.exec()** - FULLY instrumented with automatic cursor handling
- ℹ️ **transactionSync()** - Transaction wrapper not separately instrumented, but operations inside transactions ARE instrumented

## Important Limitations

### 1. Timing Accuracy ⚠️

**CRITICAL**: The Cloudflare Workers runtime does NOT expose accurate timing information to protect against Spectre/Meltdown side-channel attacks.

```typescript
// CPU-bound work will appear to take 0ms
const start = Date.now()
for (let i = 0; i < 1000000; i++) {
	/* heavy computation */
}
const duration = Date.now() - start // Often returns 0!
```

The clock only updates on I/O operations (fetch, KV reads, etc.). This is a **runtime limitation**, not a bug in this library.

**Impact**: Spans measuring pure CPU work will show inaccurate/zero duration.

### 2. RPC-Style Durable Object Calls

**✅ FULLY INSTRUMENTED** - RPC-style Durable Object method calls are fully instrumented with automatic trace context propagation.

```typescript
// ✅ Instrumented (RPC style with trace propagation)
const result = await stub.someMethod(arg1, arg2)

// ✅ Instrumented (fetch style)
const response = await stub.fetch(request)
```

Both RPC method calls and classic `fetch()` calls are instrumented. The library automatically injects trace context as the first argument and the DO handler extracts it server-side.

### 3. Build Requirements

- **ESM Only**: CommonJS support removed in v1.0.0-rc.52
- **Requires `nodejs_compat`**: Must add to `wrangler.toml`:
  ```toml
  compatibility_flags = ["nodejs_compat"]
  ```

### 4. Version Metadata

The library automatically detects Worker version metadata from the environment:

```typescript
// Automatically added to resource attributes:
'cf.worker.version.id': env.versionMetadata.id
'cf.worker.version.tag': env.versionMetadata.tag
'cf.worker.version.timestamp': env.versionMetadata.timestamp
```

## Usage Patterns

### Installation

```bash
yarn add @inference-net/otel-cf-workers @opentelemetry/api
```

### Basic Worker Instrumentation

```typescript
import { instrument, ResolveConfigFn } from '@inference-net/otel-cf-workers'
import { trace } from '@opentelemetry/api'

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Auto-instrumented: fetch handler span created automatically

		// Manual attributes on active span
		trace.getActiveSpan()?.setAttribute('custom.attribute', 'value')

		// Auto-instrumented: fetch calls traced automatically
		const response = await fetch('https://api.example.com')

		return new Response('OK')
	},
}

const config: ResolveConfigFn = (env: Env) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env.HONEYCOMB_API_KEY },
		},
		service: { name: 'my-worker' },
	}
}

export default instrument(handler, config)
```

### Durable Object Instrumentation

```typescript
import { instrumentDO, ResolveConfigFn } from '@inference-net/otel-cf-workers'

class MyDurableObject implements DurableObject {
	async fetch(request: Request): Promise<Response> {
		// Auto-instrumented
		return new Response('Hello from DO!')
	}

	async alarm(): Promise<void> {
		// Auto-instrumented
	}
}

const config: ResolveConfigFn = (env, trigger) => ({
	exporter: { url: env.OTEL_ENDPOINT },
	service: { name: 'my-durable-object' },
})

export const MyDO = instrumentDO(MyDurableObject, config)
```

### Advanced Configuration

```typescript
const config: ResolveConfigFn = (env, trigger) => {
	return {
		exporter: {
			url: env.OTEL_ENDPOINT,
			headers: { Authorization: `Bearer ${env.API_KEY}` },
		},
		service: {
			name: 'my-service',
			version: '1.2.3',
			namespace: 'production',
		},

		// Head sampling: sample 10% of traces at start
		sampling: {
			headSampler: {
				ratio: 0.1,
				acceptRemote: true, // Accept parent trace decisions
			},
			// Tail sampling: always keep errors even if not head-sampled
			tailSampler: (trace) => {
				const rootSpan = trace.localRootSpan
				return (
					rootSpan.status.code === SpanStatusCode.ERROR ||
					(rootSpan.spanContext().traceFlags & TraceFlags.SAMPLED) !== 0
				)
			},
		},

		// Control trace context propagation
		fetch: {
			includeTraceContext: (request) => {
				// Only propagate to same-origin requests
				return new URL(request.url).hostname === 'api.example.com'
			},
		},

		handlers: {
			fetch: {
				acceptTraceContext: (request) => {
					// Accept trace context from trusted origins
					return request.headers.get('x-trusted') === 'true'
				},
			},
		},

		// Redact sensitive data before export
		postProcessor: (spans) => {
			return spans.map((span) => {
				if (span.attributes['http.url']) {
					span.attributes['http.url'] = redactUrl(span.attributes['http.url'])
				}
				return span
			})
		},

		// Custom propagator
		propagator: new MyCustomPropagator(),

		// Disable global instrumentation if needed
		instrumentation: {
			instrumentGlobalFetch: true,
			instrumentGlobalCache: true,
		},
	}
}
```

## Configuration Types

### Service Config

```typescript
interface ServiceConfig {
	name: string // Required: service name
	version?: string // Optional: version (semver, git hash, etc.)
	namespace?: string // Optional: group services together
}
```

### Exporter Config

```typescript
// Simple OTLP config
interface OTLPExporterConfig {
	url: string
	headers?: Record<string, string>
}

// Or bring your own exporter
class CustomExporter implements SpanExporter {
	export(spans, callback) {
		/* ... */
	}
	shutdown() {
		/* ... */
	}
}
```

### Sampling Config

```typescript
interface SamplingConfig {
	headSampler?:
		| Sampler
		| {
				ratio: number // 0.0 to 1.0
				acceptRemote?: boolean // Accept parent trace decisions (default: true)
		  }
	tailSampler?: (trace: LocalTrace) => boolean
}
```

**Default Sampling Strategy**:

```typescript
// Head: Sample everything (ratio: 1.0)
// Tail: Keep head-sampled traces OR traces with errors
tailSampler: multiTailSampler([isHeadSampled, isRootErrorSpan])
```

## Logging Support

This library includes **full structured logging support** with OTLP export and console instrumentation.

### Basic Logging Usage

```typescript
import { instrument, ResolveConfigFn } from '@inference-net/otel-cf-workers'
import { logs } from '@opentelemetry/api-logs'

const config: ResolveConfigFn = (env: Env) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/logs', // Logs endpoint
			headers: { 'x-honeycomb-team': env.HONEYCOMB_API_KEY },
		},
		service: { name: 'my-worker' },
		logs: {
			level: 'info', // trace, debug, info, warn, error
			instrumentation: {
				instrumentConsole: true, // Automatically capture console.log/warn/error
			},
		},
	}
}

// Use the logger
const logger = logs.getLogger('my-component')
logger.emit({
	severityText: 'INFO',
	body: 'User logged in',
	attributes: {
		userId: '123',
		email: 'user@example.com',
	},
})

// Or use console (if instrumentConsole: true)
console.log('User logged in', { userId: '123' })
console.warn('Rate limit approaching')
console.error('Failed to process payment', { error: err.message })
```

### Log Configuration

```typescript
interface LogsConfig {
	level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' // Minimum log level (default: 'info')
	instrumentation?: {
		instrumentConsole?: boolean // Capture console.log/warn/error (default: false)
	}
}
```

### Console Instrumentation

When `instrumentConsole: true`, the library automatically:

- Captures `console.log()` → INFO level
- Captures `console.warn()` → WARN level
- Captures `console.error()` → ERROR level
- Preserves original console behavior (logs still appear in console)
- Attaches trace context (traceId, spanId) to log records
- Exports logs to the same OTLP endpoint as traces

### Trace-Log Correlation

Logs emitted within an active span automatically include trace context:

```typescript
const tracer = trace.getTracer('my-tracer')
const logger = logs.getLogger('my-component')

await tracer.startActiveSpan('process-order', async (span) => {
	logger.emit({
		severityText: 'INFO',
		body: 'Processing order',
		attributes: { orderId: '456' },
	})
	// Log record will include traceId and spanId from the active span
	span.end()
})
```

## Instrumentation Details

### KV Operations

```typescript
// All operations auto-traced with attributes:
await env.MY_KV.get(key) // db.cf.kv.type, db.cf.kv.cache_ttl
await env.MY_KV.put(key, value) // db.cf.kv.expiration, db.cf.kv.metadata
await env.MY_KV.delete(key)
await env.MY_KV.list() // db.cf.kv.list_complete, db.cf.kv.cursor
await env.MY_KV.getWithMetadata() // db.cf.kv.cache_status
```

### D1 Queries

```typescript
// All operations traced with SQL statements:
const stmt = env.DB.prepare('SELECT * FROM users WHERE id = ?')
await stmt.bind(123).first() // db.statement, db.cf.d1.rows_read
await stmt.all() // db.cf.d1.duration, db.cf.d1.changes

// Batch queries create sub-spans:
await env.DB.batch([stmt1, stmt2, stmt3]) // Parent + 3 child spans
```

### Durable Object Storage

```typescript
// Inside a Durable Object:
await this.ctx.storage.get(key)
await this.ctx.storage.put(key, value)
await this.ctx.storage.delete(key)
await this.ctx.storage.list()
await this.ctx.storage.setAlarm(Date.now() + 60000)
```

## Attribute Alignment with Cloudflare Official Telemetry

As of v2.0.0, all instrumentation attributes are aligned with [Cloudflare's official Workers observability specification](https://developers.cloudflare.com/workers/observability/). This ensures compatibility and consistency with Cloudflare's native telemetry.

### Universal Attributes (All Spans)

```typescript
'cloud.provider': 'cloudflare'
'cloud.platform': 'cloudflare.workers'
'telemetry.sdk.name': '@inference-net/otel-cf-workers'
'telemetry.sdk.language': 'javascript'
'cloudflare.script_name': '<worker-name>'
```

### Root Span Attributes

```typescript
'cloudflare.ray_id': '<cf-ray-id>'           // Unique request ID
'cloudflare.colo': '<airport-code>'           // Data center location
'cloudflare.handler_type': 'fetch' | 'scheduled' | 'queue' | 'email' | 'alarm'
'cloudflare.execution_model': 'stateless' | 'stateful'
```

### Attribute Naming Conventions

All Cloudflare-specific attributes follow the pattern:

- `cloudflare.<service>.<type>.<attribute>` for service-specific attributes
- `cloudflare.<attribute>` for general platform attributes

Examples:

- `cloudflare.d1.response.rows_read` - D1 database rows read
- `cloudflare.kv.query.keys` - KV key being accessed
- `cloudflare.queue.batch_size` - Number of messages in queue batch

### Comparison: Our Attributes vs. Cloudflare Official

All instrumented services now use Cloudflare's official attribute keys. Key changes from previous versions:

| Service    | Old Attribute       | New Attribute                             |
| ---------- | ------------------- | ----------------------------------------- |
| All        | `binding_type`      | `cloudflare.binding.type`                 |
| D1         | `db.cf.d1.duration` | `cloudflare.d1.response.sql_duration_ms`  |
| KV         | `db.cf.kv.key`      | `cloudflare.kv.query.keys`                |
| Queue      | `queue.name`        | `cloudflare.queue.name`                   |
| DO Storage | `db.cf.do.key`      | `cloudflare.durable_object.kv.query.keys` |

### Manual Span Creation

```typescript
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('my-tracer')

await tracer.startActiveSpan('operation-name', async (span) => {
	span.setAttribute('custom.key', 'value')

	try {
		const result = await doWork()
		span.setStatus({ code: SpanStatusCode.OK })
		return result
	} catch (error) {
		span.recordException(error)
		span.setStatus({ code: SpanStatusCode.ERROR })
		throw error
	} finally {
		span.end()
	}
})
```

## Common Issues & Solutions

### Issue: Spans not exported

**Cause**: Export happens in `ctx.waitUntil()`. If the execution context ends before export completes, spans are lost.

**Solution**: The library handles this automatically, but ensure you're not manually ending the execution context prematurely.

### Issue: Duplicate spans

**Cause**: Both global fetch instrumentation and manual instrumentation active.

**Solution**: Disable global instrumentation if manually instrumenting:

```typescript
instrumentation: {
	instrumentGlobalFetch: false
}
```

### Issue: SQL exec() spans for DDL statements

**No action needed!** DDL statements (CREATE, DROP, ALTER) and multi-statement queries are automatically handled:

```typescript
// ✅ Works automatically - span ends immediately
this.ctx.storage.sql.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY);
  CREATE INDEX IF NOT EXISTS idx_id ON users(id);
`)

// ✅ For SELECT queries, consume the cursor to capture row counts
const rows = [...this.ctx.storage.sql.exec('SELECT * FROM users')]

// ✅ Also works with toArray()
const rows = this.ctx.storage.sql.exec('SELECT * FROM users').toArray()
```

The library uses a microtask to automatically end spans for cursors that aren't iterated (common for DDL), while still capturing metrics when cursors ARE consumed.

### Issue: Sensitive data in spans

**Cause**: URLs, headers, etc. captured automatically.

**Solution**: Use `postProcessor` to redact:

```typescript
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
}
```

## Version History Highlights

### v1.0.0-rc.52 (Current)

- ❌ **BREAKING**: Removed CommonJS support (ESM only)
- ✅ Proper class-style Durable Objects support
- ✅ Force-end unfinished spans on flush
- ⚠️ RPC-style DO calls still not auto-instrumented

### v1.0.0-rc.50

- Complete internal rework for better predictability

### v1.0.0-rc.48

- Initial D1 support (experimental)

### v1.0.0-rc.15

- Scheduled handler instrumentation
- Analytics Engine binding support
- Updated HTTP semantic conventions

## Testing

The library uses Vitest with `@cloudflare/vitest-pool-workers` for testing:

```bash
yarn test      # Run tests once
yarn test:dev  # Watch mode
```

Tests run in a simulated Workers environment to ensure compatibility.

## Development Commands

```bash
yarn build          # Build library (tsup + version metadata)
yarn clean          # Remove build artifacts
yarn format         # Format code with Prettier
yarn check          # Run all checks (types + format)
yarn check:types    # TypeScript type checking
yarn watch          # Watch mode for development
yarn ci             # Full CI workflow (clean + build + check)
```

## When to Use This Library

### ✅ Good Fit

- Cloudflare Workers applications needing observability
- Distributed tracing across Workers, Durable Objects, and external services
- Debugging performance issues (with timing caveats)
- Monitoring error rates and patterns
- Integration with existing OTel infrastructure

### ❌ Not a Good Fit

- Accurate CPU timing measurement (runtime limitation)
- Metrics collection (only traces and logs are supported)
- Applications using AI, Vectorize, Hyperdrive heavily (not instrumented)
- CommonJS projects (ESM only as of v1.0.0-rc.52)

## Missing Instrumentation vs. Cloudflare Official

Below is a comprehensive comparison of what Cloudflare's official Workers observability supports that this library does NOT yet implement.

### ✅ Recently Implemented Bindings

#### **R2 Object Storage** (✅ FULLY IMPLEMENTED)

**Operations Implemented:**

- ✅ `head` - Object metadata with full response attributes
- ✅ `get` - Object retrieval with range/conditional requests
- ✅ `put` - Object upload with checksums/metadata/storage class
- ✅ `list` - Bucket listing with pagination
- ✅ `delete` - Single/batch deletion
- ✅ `createMultipartUpload` - Multipart upload initiation
- ✅ `resumeMultipartUpload` - Resume multipart upload

**Attributes Captured:**

- Request: key, prefix, limit, delimiter, range (offset/length/suffix), conditional requests (onlyIf)
- Response: size, etag, version, uploaded timestamp, httpMetadata (content-type, cache-control, etc.), customMetadata, checksums (MD5, SHA1, SHA256, SHA384, SHA512), storage class
- List: truncated, object count, delimited prefixes count, cursor

---

#### **Durable Object SQL Storage API** (✅ IMPLEMENTED)

**Operations Implemented:**

- ✅ `sql.exec()` - Execute SQL with automatic cursor instrumentation

**Attributes Captured:**

- `cloudflare.durable_object.query.bindings` - Number of SQL parameter bindings
- `cloudflare.durable_object.response.rows_read` - Rows read (captured after cursor iteration)
- `cloudflare.durable_object.response.rows_written` - Rows written (captured after cursor iteration)
- `db.query.text` - The SQL query string

**How It Works:**
The library wraps `SqlStorageCursor` to intercept iteration methods (`toArray()`, `one()`, `Symbol.iterator`, `next()`). When iteration completes, it captures `rowsRead` and `rowsWritten` from the cursor and ends the span.

**How SQL Cursors Work:**

- The library automatically ends spans for non-iterated cursors (DDL statements like CREATE TABLE)
- For queries that return data, the span ends when you consume the cursor
- Supports multi-statement SQL (separated by semicolons)

**Operations NOT Yet Implemented:**

- ❌ `sql.prepare()` - SQL prepared statements (returns `SqlStorageStatement`)
- ❌ `sql.ingest()` - Bulk data ingest (returns `SqlStorageIngestResult`)
- ❌ `sql.databaseSize` - Database size getter property

---

#### **Images Binding** (✅ BASIC IMPLEMENTATION)

**Operations Implemented:**

- ✅ `get` - Get image metadata
- ✅ `list` - List images
- ✅ `delete` - Delete image

**Attributes Captured:**

- Request: key
- Response: id, filename, uploaded timestamp, metadata keys, variants count, requireSignedURLs

**Note:** This is a basic implementation using duck-typing detection since Images binding isn't in `@cloudflare/workers-types` yet. Transform operations (`output`) are not instrumented.

---

#### **Rate Limiting Binding** (✅ IMPLEMENTED)

**Operations Implemented:**

- ✅ `limit` - Execute rate limit check

**Attributes Captured:**

- `cloudflare.rate_limit.key` - The rate limit key
- `cloudflare.rate_limit.success` - Whether the request succeeded
- `cloudflare.rate_limit.allowed` - Whether the request was allowed

---

### ❌ Missing Bindings (High Priority)

#### **Email Sending Operations** (PARTIALLY IMPLEMENTED)

We instrument the **email handler** (incoming email) but not outbound email operations:

**Operations Missing:**

- `reply_email` - Reply to email
- `forward_email` - Forward email
- `send_email` - Send new email

---

#### **Browser Rendering** (NOT IMPLEMENTED)

**Operations Missing:**

- `browser_rendering_fetch` - Puppeteer API calls

---

### ✅ Implemented Handlers

#### **RPC Handler** (✅ FULLY IMPLEMENTED)

RPC-style Durable Object method calls and Service Binding calls are fully instrumented with automatic trace context propagation:

```typescript
// ✅ FULLY instrumented with trace context:
await stub.myRpcMethod(args)
```

**How It Works:**

- **Client Side**: The library intercepts RPC method calls on stubs and injects trace context as the first argument
- **Server Side**: The DO/Service handler extracts trace context from the first argument and removes it before calling the actual method
- Trace context includes the DO name (if available) for better span naming

**Attributes Captured:**

- `rpc.system` = 'cloudflare_rpc'
- `rpc.service` = namespace or DO name
- `rpc.method` = method name
- `cloudflare.jsrpc.method` = method name
- `do.id` = Durable Object ID
- `do.name` = Durable Object name (if available)

**Span Naming:**

- Client spans: `RPC {service}.{method}`
- Server spans: `{doName}.{method}` or `{doId}.{method}`

---

#### **Tail Handler** (NOT IMPLEMENTED)

**Operations Missing:**

- `handler.tail` - Tail consumer for trace aggregation

**Key Attributes Missing:**

- `cloudflare.trace.count` - Number of traces in tail batch

---

### ⚠️ Partially Implemented Services

#### **Cache API** (BASIC IMPLEMENTATION)

We instrument cache operations but are missing:

**Missing Attributes:**

- `cache_control.expiration` - Cache expiration time
- `cache_control.revalidation` - Revalidation settings

---

#### **Fetch Handler** (MISSING SOME ATTRIBUTES)

We have extensive fetch instrumentation but are missing:

**Missing Attributes:**

- `cloudflare.response.time_to_first_byte_ms` - TTFB metric
- Some detailed `user_agent.*` fields may be incomplete depending on Request.cf availability

---

### 📊 Summary of Instrumentation Coverage

| Service/Handler                   | Status         | Coverage                                     |
| --------------------------------- | -------------- | -------------------------------------------- |
| **Fetch Handler**                 | ✅ Implemented | 95% - Missing TTFB                           |
| **Scheduled Handler**             | ✅ Implemented | 100%                                         |
| **Queue Handler**                 | ✅ Implemented | 100%                                         |
| **Email Handler**                 | ✅ Implemented | 100%                                         |
| **Alarm Handler**                 | ✅ Implemented | 100%                                         |
| **RPC Handler (DO/Service)**      | ✅ Implemented | 100%                                         |
| **Tail Handler**                  | ❌ Missing     | 0%                                           |
| **D1 Database**                   | ✅ Implemented | 90% - Missing bookmark/region attrs          |
| **KV Namespace**                  | ✅ Implemented | 100%                                         |
| **R2 Storage**                    | ✅ Implemented | 95% - Missing uploadPart/abort/complete      |
| **Cache API**                     | ⚠️ Partial     | 85% - Missing cache_control attrs            |
| **Queue Producer**                | ✅ Implemented | 100%                                         |
| **Durable Objects (Fetch/Alarm)** | ✅ Implemented | 100%                                         |
| **DO Storage (Legacy KV)**        | ✅ Implemented | 100%                                         |
| **DO Storage (SQL)**              | ✅ Implemented | 75% - Missing prepare/ingest/getDatabaseSize |
| **Analytics Engine**              | ✅ Implemented | 100%                                         |
| **Images**                        | ✅ Implemented | 60% - Basic get/list/delete only             |
| **Email Sending**                 | ❌ Missing     | 0%                                           |
| **Rate Limiting**                 | ✅ Implemented | 100%                                         |
| **Browser Rendering**             | ❌ Missing     | 0%                                           |
| **Logs (Console + OTLP)**         | ✅ Implemented | 100%                                         |

### Priority for Future Implementation

**High Priority:**

1. **DO SQL Storage API (Complete)** - Add prepare(), ingest(), getDatabaseSize()
2. **R2 Multipart Upload Operations** - uploadPart(), abortMultipartUpload(), completeMultipartUpload()
3. **Cache API Enhancements** - Add cache_control attributes

**Medium Priority:**

4. **Images Transform Operations** - output() method for image transformation
5. **Email Sending Operations** - Complete email support with reply/forward/send
6. **Tail Handler** - For trace aggregation use cases

**Low Priority:**

7. **Browser Rendering** - Puppeteer API (specialized workload)
8. **Fetch Handler TTFB** - Time to first byte metric
9. **D1 Bookmark/Region Attributes** - Additional metadata attributes

## Contributing Guidelines

When adding new instrumentation:

1. **Follow the pattern**: See `src/instrumentation/` for examples
2. **Use `wrap()` utility**: From `src/wrap.ts` for proxying
3. **Use aligned constants**: Import from `src/constants.ts`
4. **Follow Cloudflare conventions**: Match official attribute naming
5. **Handle errors**: Always `recordException()` and set error status
6. **Test in Workers env**: Use vitest-pool-workers

## Additional Resources

- [Main README](./README.md) - User-facing documentation
- [Examples](./examples/) - Working code samples
- [OpenTelemetry JS Docs](https://opentelemetry.io/docs/languages/js/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare Observability Docs](https://developers.cloudflare.com/workers/observability/)
