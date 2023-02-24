import { EventEmitterLite, Functions } from "./utils/util"
import type { Workspace } from "obsidian"
import { around } from "monkey-around"
import { correctType } from "./utils/types"
import { noop } from "ts-essentials"

export interface Log {
	readonly logger: EventEmitterLite<readonly [Log.Event]>
	readonly history: Log.Event[]
}
export namespace Log {
	export type Event = { readonly type: Event.Type } & (
		{
			readonly type: "debug" | "error" | "info" | "warn"
			readonly data: readonly unknown[]
		} | {
			readonly type: "unhandledRejection"
			readonly data: PromiseRejectionEvent
		} | {
			readonly type: "windowError"
			readonly data: ErrorEvent
		}
	)
	export namespace Event {
		export const TYPES = Object.freeze([
			"info",
			"error",
			"warn",
			"debug",
			"windowError",
			"unhandledRejection",
		] as const)
		export type Type = typeof TYPES[number]
		export type Typed<T extends Type> = Event & { readonly type: T }
	}
}

function newLog(): Log {
	const ret: Log = Object.freeze({
		history: [],
		logger: new EventEmitterLite<readonly [Log.Event]>(),
	})
	ret.logger.listen(event => ret.history.push(event))
	return ret
}

function patchConsole(console: Console, log: Log): () => void {
	const consolePatch = (
		type: "debug" | "error" | "info" | "warn",
		proto: (...data: unknown[]) => void,
	) => function fn(this: Console, ...data: unknown[]): void {
		proto.apply(this, data)
		log.logger.emit({ data, type }).catch(noop)
	}
	return around(console, {
		debug(proto) { return consolePatch("debug", proto) },
		error(proto) { return consolePatch("error", proto) },
		log(proto) { return consolePatch("info", proto) },
		warn(proto) { return consolePatch("warn", proto) },
	})
}

function patchWindow(self: Window, log: Log): () => void {
	const
		onWindowError = (error: ErrorEvent): void => {
			log.logger.emit({
				data: error,
				type: "windowError",
			}).catch(noop)
		},
		onUnhandledRejection = (error: PromiseRejectionEvent): void => {
			log.logger.emit({
				data: error,
				type: "unhandledRejection",
			}).catch(noop)
		},
		ret = new Functions(
			{ async: false, settled: true },
			() => {
				self.removeEventListener("error", onWindowError, { capture: true })
			},
			() => {
				self.removeEventListener(
					"unhandledrejection",
					onUnhandledRejection,
					{ capture: true },
				)
			},
		)
	try {
		self.addEventListener("error", onWindowError, {
			capture: true,
			passive: true,
		})
		self.addEventListener("unhandledrejection", onUnhandledRejection, {
			capture: true,
			passive: true,
		})
		return () => { ret.call() }
	} catch (error) {
		ret.call()
		throw error
	}
}

export function patch(workspace: Workspace): readonly [() => void, Log] {
	const unpatchers = new Functions({ async: false, settled: true })
	try {
		const log = newLog(),
			windowConsolePatch = workspace.on("window-open", window => {
				const unpatch = patchConsole(correctType(window.win).console, log),
					off = workspace.on("window-close", window0 => {
						if (window !== window0) { return }
						try {
							unpatch()
						} finally { workspace.offref(off) }
					})
			})
		unpatchers.push(() => { workspace.offref(windowConsolePatch) })
		unpatchers.push(patchConsole(console, log))

		const windowWindowPatch = workspace.on("window-open", window => {
			const unpatch = patchWindow(window.win, log),
				off = workspace.on("window-close", window0 => {
					if (window !== window0) { return }
					try {
						unpatch()
					} finally { workspace.offref(off) }
				})
		})
		unpatchers.push(() => { workspace.offref(windowWindowPatch) })
		unpatchers.push(patchWindow(window, log))
		return Object.freeze([(): void => { unpatchers.call() }, log])
	} catch (error) {
		unpatchers.call()
		throw error
	}
}
