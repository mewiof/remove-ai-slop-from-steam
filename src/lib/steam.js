(function (root) {
	"use strict";

	const ext = root.browser || root.chrome;
	const ENDPOINT =
		"https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
	const BATCH = 100;
	const DAY = 86400;

	const TTL = { found: 14 * DAY, none: 3 * DAY, unknown: DAY };

	const now = () => Math.floor(Date.now() / 1000);
	const key = (appid) => "a" + appid;

	// disclosure text per appid ("" when none, null when Steam does not know the app here)
	async function fetchBatch(ids, cc) {
		const input = {
			ids: ids.map((appid) => ({ appid: Number(appid) })),
			context: { language: "english", country_code: cc || "US" },
			data_request: { include_extra_details: true },
		};
		const url =
			ENDPOINT +
			"?input_json=" +
			encodeURIComponent(JSON.stringify(input));
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), 20000);
		try {
			const res = await fetch(url, {
				credentials: "omit",
				signal: ctl.signal,
			});
			if (!res.ok) throw new Error("GetItems HTTP " + res.status);
			const json = await res.json();
			const out = {};
			for (const id of ids) out[id] = null;
			for (const item of (json.response && json.response.store_items) ||
				[]) {
				if (item.success !== 1 || !(item.id in out)) continue;
				const notes =
					item.extra_details &&
					item.extra_details.content_survey_ai_notes;
				out[item.id] = typeof notes === "string" ? notes : "";
			}
			return out;
		} finally {
			clearTimeout(timer);
		}
	}

	async function fetchAll(ids, cc) {
		const out = {};
		for (let i = 0; i < ids.length; i += BATCH)
			Object.assign(out, await fetchBatch(ids.slice(i, i + BATCH), cc));
		return out;
	}

	// [unix time, notes] (expired ones count as missing)
	async function readCache(ids) {
		const got = await ext.storage.local.get(ids.map(key));
		const t = now();
		const out = {};
		for (const id of ids) {
			const e = got[key(id)];
			if (!Array.isArray(e)) continue;
			const ttl =
				e[1] === null ? TTL.unknown : e[1] ? TTL.found : TTL.none;
			if (t - e[0] < ttl) out[id] = e[1];
		}
		return out;
	}

	async function writeCache(items) {
		const t = now();
		const put = {};
		for (const [id, notes] of Object.entries(items))
			put[key(id)] = [t, notes];
		if (Object.keys(put).length) await ext.storage.local.set(put);
	}

	async function cacheKeys() {
		const all = await ext.storage.local.get(null);
		return Object.entries(all).filter(([k]) => /^a\d+$/.test(k));
	}

	async function pruneCache() {
		const t = now();
		const drop = (await cacheKeys())
			.filter(([, e]) => !Array.isArray(e) || t - e[0] > TTL.found)
			.map(([k]) => k);
		if (drop.length) await ext.storage.local.remove(drop);
		return drop.length;
	}

	async function clearCache() {
		const drop = (await cacheKeys()).map(([k]) => k);
		if (drop.length) await ext.storage.local.remove(drop);
		return drop.length;
	}

	async function cacheStats() {
		const entries = await cacheKeys();
		return {
			games: entries.length,
			disclosed: entries.filter(([, e]) => Array.isArray(e) && e[1])
				.length,
		};
	}

	root.AiSlopSteam = {
		fetchAll,
		readCache,
		writeCache,
		pruneCache,
		clearCache,
		cacheStats,
	};
})(globalThis);
