import { Attributes, SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { wrap } from '../wrap'
import { Overloads } from './common'
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
} from '../constants'

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
type SQLStorageCursor = {
	rowsRead: number
	rowsWritten: number
	[Symbol.iterator](): IterableIterator<any>
	toArray(): any[]
	one(): any
	next(): { done?: boolean; value?: any }
}

function instrumentSQLStorageExec(fn: SqlStorage['exec'], operation: string): SqlStorage['exec'] {
	const tracer = trace.getTracer('do_sql_storage')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			const query = argArray[0] as string
			const bindings = argArray.slice(1) as unknown[]

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
			return tracer.startActiveSpan(`Durable Object SQL ${operation}`, options, (span) => {
				const cursor = Reflect.apply(target, thisArg, argArray) as SQLStorageCursor
				let spanEnded = false

				const endSpanWithMetrics = () => {
					if (spanEnded) return
					spanEnded = true

					// Capture metrics from cursor
					if (typeof cursor.rowsRead === 'number') {
						span.setAttribute(ATTR_CLOUDFLARE_DO_SQL_RESPONSE_ROWS_READ, cursor.rowsRead)
					}
					if (typeof cursor.rowsWritten === 'number') {
						span.setAttribute(ATTR_CLOUDFLARE_DO_SQL_RESPONSE_ROWS_WRITTEN, cursor.rowsWritten)
					}
					span.end()
				}

				// For DDL statements (CREATE, DROP, ALTER) and multi-statement queries that aren't typically iterated,
				// end the span immediately after capturing available metrics
				// This handles cases like: ctx.storage.sql.exec('CREATE TABLE ...')
				// We use a microtask to allow synchronous property access to complete first
				Promise.resolve().then(() => {
					if (!spanEnded) {
						endSpanWithMetrics()
					}
				})

				// Wrap the cursor to intercept iteration methods
				const wrappedCursor = new Proxy(cursor, {
					get(target, prop, receiver) {
						const value = Reflect.get(target, prop, receiver)

						// Intercept methods that consume the cursor
						if (prop === 'toArray') {
							return function (this: any, ...args: any[]) {
								const result = typeof value === 'function' ? value.apply(target, args) : value
								endSpanWithMetrics()
								return result
							}
						}

						if (prop === 'one') {
							return function (this: any, ...args: any[]) {
								const result = typeof value === 'function' ? value.apply(target, args) : value
								endSpanWithMetrics()
								return result
							}
						}

						// Intercept Symbol.iterator (used by spread operator and for-of)
						if (prop === Symbol.iterator) {
							return function (this: any) {
								const iterator = (typeof value === 'function' ? value.apply(target) : value) as Iterator<any>
								let iterationComplete = false

								// Wrap the iterator to detect when iteration completes
								return {
									next() {
										const result = iterator.next()
										if (result.done && !iterationComplete) {
											iterationComplete = true
											endSpanWithMetrics()
										}
										return result
									},
									[Symbol.iterator]() {
										return this
									},
								}
							}
						}

						// Intercept next() for manual iteration
						if (prop === 'next') {
							return function (this: any, ...args: any[]) {
								const result = typeof value === 'function' ? value.apply(target, args) : value
								if (result && result.done) {
									endSpanWithMetrics()
								}
								return result
							}
						}

						return typeof value === 'function' ? value.bind(target) : value
					},
				})

				return wrappedCursor
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
				default:
					return fn
			}
		},
	}
	return wrap(sql, sqlHandler)
}
