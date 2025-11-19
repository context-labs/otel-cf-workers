import { SpanKind } from '@opentelemetry/api'
import { HandlerInstrumentation, InitialSpanInfo, OrPromise } from '../types.js'
import {
	ATTR_FAAS_CRON,
	ATTR_FAAS_TIME,
	ATTR_FAAS_TRIGGER,
	FAAS_TRIGGER_VALUE_TIMER,
} from '@opentelemetry/semantic-conventions/incubating'
import { ATTR_CLOUDFLARE_SCHEDULED_TIME } from '../constants.js'

export const scheduledInstrumentation: HandlerInstrumentation<ScheduledController, OrPromise<void>> = {
	getInitialSpanInfo: function (controller: ScheduledController): InitialSpanInfo {
		const scheduledTimeISO = new Date(controller.scheduledTime).toISOString()
		return {
			name: `scheduledHandler ${controller.cron}`,
			options: {
				attributes: {
					[ATTR_FAAS_TRIGGER]: FAAS_TRIGGER_VALUE_TIMER,
					[ATTR_FAAS_CRON]: controller.cron,
					[ATTR_FAAS_TIME]: scheduledTimeISO,
					[ATTR_CLOUDFLARE_SCHEDULED_TIME]: scheduledTimeISO,
				},
				kind: SpanKind.INTERNAL,
			},
		}
	},
}
