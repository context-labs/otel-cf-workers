import { getLogger } from './provider'
import { SEVERITY_NUMBERS } from '../constants'

const severityMap = {
	debug: SEVERITY_NUMBERS.DEBUG,
	log: SEVERITY_NUMBERS.INFO,
	info: SEVERITY_NUMBERS.INFO,
	warn: SEVERITY_NUMBERS.WARN,
	error: SEVERITY_NUMBERS.ERROR,
} as const

type ConsoleMethod = keyof typeof severityMap

/**
 * Instrument console methods to emit OpenTelemetry log records
 * This is OPT-IN and must be explicitly enabled in configuration
 */
export function instrumentConsole() {
	const logger = getLogger('console')

	for (const [method, severityNumber] of Object.entries(severityMap)) {
		const consoleMethod = method as ConsoleMethod
		const original = console[consoleMethod]

		if (typeof original !== 'function') {
			continue
		}

		// Replace console method with instrumented version
		;(console as any)[consoleMethod] = function (...args: any[]) {
			try {
				// Emit log record
				logger.emit({
					severityNumber,
					severityText: method.toUpperCase(),
					body: args.length === 1 ? String(args[0]) : args.map(String).join(' '),
					attributes: {
						'log.source': 'console',
						'log.method': method,
						'log.args_count': args.length,
					},
				})
			} catch (error) {
				// Don't break console if logging fails - but can't use console.error here!
			}

			// Always call original console method
			return original.apply(console, args)
		}
	}
}
