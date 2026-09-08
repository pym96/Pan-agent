/** Stop waiting on a source that ignores abort; request its cleanup without waiting for normal EOF. */
export async function* abortableBody(body: AsyncIterable<Uint8Array>, signal: AbortSignal): AsyncIterable<Uint8Array> {
	const iterator = body[Symbol.asyncIterator]();
	let rejectAbort!: (reason: unknown) => void;
	const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
	const abort = () => rejectAbort(new DOMException("Operation aborted", "AbortError"));
	signal.addEventListener("abort", abort, { once: true });
	try {
		if (signal.aborted) throw new DOMException("Operation aborted", "AbortError");
		while (true) {
			const item = await Promise.race([iterator.next(), aborted]);
			if (signal.aborted) throw new DOMException("Operation aborted", "AbortError");
			if (item.done) return;
			yield item.value;
		}
	} finally {
		signal.removeEventListener("abort", abort);
		// Async generators may defer return until a pending next completes. Never let that delay Run cancellation.
		try { void Promise.resolve(iterator.return?.()).catch(() => {}); } catch { /* Best-effort source cleanup. */ }
	}
}
