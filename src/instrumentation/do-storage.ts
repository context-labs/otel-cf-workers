import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { wrap } from '../wrap.js'
import { Overloads } from './common.js'
import {
	ATTR_DB_SYSTEM_NAME,
	ATTR_DB_OPERATION_NAME,
	ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS,
	ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS_COUNT,
	ATTR_CLOUDFLARE_DO_KV_QUERY_START,
	ATTR_CLOUDFLARE_DO_KV_QUERY_START_AFTER,
	ATTR_CLOUDFLARE_DO_KV_QUERY_END,
	ATTR_CLOUDFLARE_DO_KV_QUERY_PREFIX,
	ATTR_CLOUDFLARE_DO_KV_QUERY_REVERSE,
	ATTR_CLOUDFLARE_DO_KV_QUERY_LIMIT,
	ATTR_CLOUDFLARE_DO_KV_RESPONSE_DELETED_COUNT,
	ATTR_CLOUDFLARE_DO_ALLOW_CONCURRENCY,
	ATTR_CLOUDFLARE_DO_ALLOW_UNCONFIRMED,
	ATTR_CLOUDFLARE_DO_NO_CACHE,
	ATTR_CLOUDFLARE_DO_SQL_QUERY_BINDINGS,
	ATTR_CLOUDFLARE_DO_SQL_RESPONSE_ROWS_READ,
	ATTR_CLOUDFLARE_DO_SQL_RESPONSE_ROWS_WRITTEN,
	ATTR_DB_QUERY_TEXT,
	ATTR_DB_OPERATION_BATCH_SIZE,
} from '../constants.js'

type ExtraAttributeFn = (argArray: any[], result: any) => Attributes

const dbSystem = 'Cloudflare DO'

type DurableObjectCommonOptions = Pick<DurableObjectPutOptions, 'allowConcurrency' | 'allowUnconfirmed' | 'noCache'>
function isDurableObjectCommonOptions(options: any): options is DurableObjectCommonOptions {
	return (
		typeof options === 'object' &&
		('allowConcurrency' in options || 'allowUnconfirmed' in options || 'noCache' in options)
	)
}

/** Applies attributes for common Durable Objects options:
 * `allowConcurrency`, `allowUnconfirmed`, and `noCache`
 */
function applyOptionsAttributes(attrs: Attributes, options: DurableObjectCommonOptions) {
	if ('allowConcurrency' in options) {
		attrs[ATTR_CLOUDFLARE_DO_ALLOW_CONCURRENCY] = options.allowConcurrency
	}
	if ('allowUnconfirmed' in options) {
		attrs[ATTR_CLOUDFLARE_DO_ALLOW_UNCONFIRMED] = options.allowUnconfirmed
	}
	if ('noCache' in options) {
		attrs[ATTR_CLOUDFLARE_DO_NO_CACHE] = options.noCache
	}
}

const StorageAttributes: Record<string | symbol, ExtraAttributeFn> = {
	delete(argArray, result: Awaited<ReturnType<Overloads<DurableObjectStorage['delete']>>>) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['delete']>>
		let attrs: Attributes = {}
		if (Array.isArray(args[0])) {
			const keys = args[0]
			attrs = {
				[ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS]: keys[0],
				[ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS_COUNT]: keys.length,
				[ATTR_CLOUDFLARE_DO_KV_RESPONSE_DELETED_COUNT]: result,
			}
		} else {
			attrs = {
				[ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS]: args[0],
			}
		}
		if (args[1]) {
			applyOptionsAttributes(attrs, args[1])
		}
		return attrs
	},
	deleteAll(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['deleteAll']>>
		let attrs: Attributes = {}
		if (args[0]) {
			applyOptionsAttributes(attrs, args[0])
		}
		return attrs
	},
	get(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['get']>>
		let attrs: Attributes = {}
		if (Array.isArray(args[0])) {
			const keys = args[0]
			attrs = {
				[ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS]: keys[0],
				[ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS_COUNT]: keys.length,
			}
		} else {
			attrs = {
				[ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS]: args[0],
			}
		}
		if (args[1]) {
			applyOptionsAttributes(attrs, args[1])
		}
		return attrs
	},
	list(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['list']>>
		const attrs: Attributes = {}
		if (args[0]) {
			const options = args[0]
			applyOptionsAttributes(attrs, options)
			if ('start' in options) {
				attrs[ATTR_CLOUDFLARE_DO_KV_QUERY_START] = options.start
			}
			if ('startAfter' in options) {
				attrs[ATTR_CLOUDFLARE_DO_KV_QUERY_START_AFTER] = options.startAfter
			}
			if ('end' in options) {
				attrs[ATTR_CLOUDFLARE_DO_KV_QUERY_END] = options.end
			}
			if ('prefix' in options) {
				attrs[ATTR_CLOUDFLARE_DO_KV_QUERY_PREFIX] = options.prefix
			}
			if ('reverse' in options) {
				attrs[ATTR_CLOUDFLARE_DO_KV_QUERY_REVERSE] = options.reverse
			}
			if ('limit' in options) {
				attrs[ATTR_CLOUDFLARE_DO_KV_QUERY_LIMIT] = options.limit
			}
		}
		return attrs
	},
	put(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['put']>>
		const attrs: Attributes = {}
		if (typeof args[0] === 'string') {
			attrs[ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS] = args[0]
			if (args[2]) {
				applyOptionsAttributes(attrs, args[2])
			}
		} else {
			const keys = Object.keys(args[0])
			attrs[ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS] = keys[0]
			attrs[ATTR_CLOUDFLARE_DO_KV_QUERY_KEYS_COUNT] = keys.length
			if (isDurableObjectCommonOptions(args[1])) {
				applyOptionsAttributes(attrs, args[1])
			}
		}
		return attrs
	},
	getAlarm(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['getAlarm']>>
		const attrs: Attributes = {}
		if (args[0]) {
			applyOptionsAttributes(attrs, args[0])
		}
		return attrs
	},
	setAlarm(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['setAlarm']>>
		const attrs: Attributes = {}
		if (args[0] instanceof Date) {
			attrs['db.cf.do.alarm_time'] = args[0].getTime()
		} else {
			attrs['db.cf.do.alarm_time'] = args[0]
		}
		if (args[1]) {
			applyOptionsAttributes(attrs, args[1])
		}
		return attrs
	},
	deleteAlarm(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['deleteAlarm']>>
		const attrs: Attributes = {}
		if (args[0]) {
			applyOptionsAttributes(attrs, args[0])
		}
		return attrs
	},
}

function instrumentStorageFn(fn: Function, operation: string) {
	const tracer = trace.getTracer('do_storage')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			const attributes = {
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: operation,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`Durable Object Storage ${operation}`, options, async (span) => {
				const result = await Reflect.apply(target, thisArg, argArray)
				const extraAttrsFn = StorageAttributes[operation]
				const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {}
				span.setAttributes(extraAttrs)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, fnHandler)
}

export function instrumentStorage(storage: DurableObjectStorage): DurableObjectStorage {
	const storageHandler: ProxyHandler<DurableObjectStorage> = {
		get: (target, prop, receiver) => {
			const operation = String(prop)
			const fn = Reflect.get(target, prop, receiver)

			// Check if this is the sql property (DurableObjectStorage.sql)
			if (prop === 'sql' && typeof fn === 'object' && fn !== null) {
				return instrumentSQLStorage(fn as SqlStorage)
			}

			return instrumentStorageFn(fn, operation)
		},
	}
	return wrap(storage, storageHandler)
}

// SQL Storage API Instrumentation
type SQLStorageExecResult = {
	rowsRead: number
	rowsWritten: number
}

function instrumentSQLStorageExec(fn: SqlStorage['exec'], operation: string): SqlStorage['exec'] {
	const tracer = trace.getTracer('do_sql_storage')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			const query = argArray[0] as string
			const bindings = argArray[1] as unknown[] | undefined

			const attributes: Attributes = {
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: operation,
				[ATTR_DB_QUERY_TEXT]: query,
			}

			if (bindings && bindings.length > 0) {
				attributes[ATTR_CLOUDFLARE_DO_SQL_QUERY_BINDINGS] = bindings.length
			}

			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`Durable Object SQL ${operation}`, options, async (span) => {
				const result = (await Reflect.apply(target, thisArg, argArray)) as SQLStorageExecResult

				if (result && typeof result === 'object') {
					if ('rowsRead' in result) {
						span.setAttribute(ATTR_CLOUDFLARE_DO_SQL_RESPONSE_ROWS_READ, result.rowsRead)
					}
					if ('rowsWritten' in result) {
						span.setAttribute(ATTR_CLOUDFLARE_DO_SQL_RESPONSE_ROWS_WRITTEN, result.rowsWritten)
					}
				}

				span.end()
				return result
			})
		},
	}
	return wrap(fn, fnHandler)
}

function instrumentSQLStorageExecBatch(fn: SqlStorage['exec'], operation: string): SqlStorage['exec'] {
	const tracer = trace.getTracer('do_sql_storage')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			const statements = argArray[0] as Array<{ query: string; bindings?: unknown[] }>

			const attributes: Attributes = {
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: operation,
				[ATTR_DB_OPERATION_BATCH_SIZE]: statements.length,
			}

			// Use first query as representative
			if (statements.length > 0 && statements[0]) {
				attributes[ATTR_DB_QUERY_TEXT] = statements[0].query
			}

			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`Durable Object SQL ${operation}`, options, async (span) => {
				const results = (await Reflect.apply(target, thisArg, argArray)) as SQLStorageExecResult[]

				// Aggregate results
				let totalRowsRead = 0
				let totalRowsWritten = 0

				for (const result of results) {
					if (result && typeof result === 'object') {
						if ('rowsRead' in result) {
							totalRowsRead += result.rowsRead
						}
						if ('rowsWritten' in result) {
							totalRowsWritten += result.rowsWritten
						}
					}
				}

				span.setAttribute(ATTR_CLOUDFLARE_DO_SQL_RESPONSE_ROWS_READ, totalRowsRead)
				span.setAttribute(ATTR_CLOUDFLARE_DO_SQL_RESPONSE_ROWS_WRITTEN, totalRowsWritten)
				span.end()
				return results
			})
		},
	}
	return wrap(fn, fnHandler)
}

function instrumentSQLStorage(sql: SqlStorage): SqlStorage {
	const sqlHandler: ProxyHandler<SqlStorage> = {
		get: (target, prop, receiver) => {
			const fn = Reflect.get(target, prop, receiver)

			if (typeof fn !== 'function') {
				return fn
			}

			switch (prop) {
				case 'exec':
					return instrumentSQLStorageExec(fn, 'exec')
				case 'execBatch':
					return instrumentSQLStorageExecBatch(fn, 'execBatch')
				default:
					return fn
			}
		},
	}
	return wrap(sql, sqlHandler)
}
