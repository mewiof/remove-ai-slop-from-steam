if (typeof importScripts === "function" && !globalThis.AiSlopSteam)
	importScripts("lib/steam.js");

const ext = globalThis.browser || globalThis.chrome;
const Steam = globalThis.AiSlopSteam;

const BATCH = 100;
const PARALLEL = 2;

// appid -> { resolve, cc } waiting for a request
const queue = new Map();
// appid -> promise of notes
const inflight = new Map();
let running = 0;
let timer = null;
// wait before asking again after 429/5xx
let pauseUntil = 0;

function schedule() {
	if (timer || !queue.size) return;
	timer = setTimeout(() => {
		timer = null;
		pump();
	}, 40);
}

function pump() {
	while (running < PARALLEL && queue.size) {
		const batch = [...queue.entries()].slice(0, BATCH);
		for (const [id] of batch) queue.delete(id);
		running++;
		run(batch).finally(() => {
			running--;
			pump();
		});
	}
}

async function run(batch) {
	const ids = batch.map(([id]) => id);
	let items = {};
	if (Date.now() >= pauseUntil) {
		try {
			items = await Steam.fetchAll(ids, batch[0][1].cc);
			await Steam.writeCache(items);
		} catch (e) {
			pauseUntil = Date.now() + 60000;
			items = {};
		}
	}
	for (const [id, waiter] of batch)
		waiter.resolve(id in items ? items[id] : undefined);
}

function fetchOne(id, cc) {
	let p = inflight.get(id);
	if (!p) {
		p = new Promise((resolve) => queue.set(id, { resolve, cc })).finally(
			() => inflight.delete(id),
		);
		inflight.set(id, p);
	}
	return p;
}

async function lookup(ids, cc) {
	const out = await Steam.readCache(ids);
	const missing = ids.filter((id) => !(id in out));
	const pending = missing.map((id) => fetchOne(id, cc));
	schedule();
	const got = await Promise.all(pending);
	missing.forEach((id, i) => {
		if (got[i] !== undefined) out[id] = got[i];
	});
	return out;
}

ext.runtime.onMessage.addListener((msg, sender, reply) => {
	if (!msg || msg.type !== "lookup" || !Array.isArray(msg.ids)) return false;
	const ids = [
		...new Set(msg.ids.map(String).filter((id) => /^\d{1,9}$/.test(id))),
	].slice(0, 2000);
	const cc = /^[A-Z]{2}$/.test(msg.cc) ? msg.cc : "US";
	lookup(ids, cc).then(
		(items) => reply({ ok: true, items }),
		(e) => reply({ ok: false, error: String(e) }),
	);
	return true;
});

// once a day at most
async function prune() {
	const { pruned = 0 } = await ext.storage.local.get("pruned");
	if (Date.now() - pruned < 86400000) return;
	await ext.storage.local.set({ pruned: Date.now() });
	await Steam.pruneCache();
}

ext.runtime.onStartup.addListener(() => {
	prune().catch(() => {});
});
ext.runtime.onInstalled.addListener(() => {
	prune().catch(() => {});
});
