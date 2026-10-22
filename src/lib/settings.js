(function (root) {
	"use strict";

	const ext = root.browser || root.chrome;

	const DEFAULTS = {
		enabled: true,
		// act on games at this level and up
		level: 3,
		// "hide" | "blur" | "label"
		action: "hide",
		labelLower: true,
		counter: true,
	};

	async function load() {
		const got = await ext.storage.local.get({ settings: {}, allow: {} });
		return { ...DEFAULTS, ...got.settings, allow: got.allow || {} };
	}

	async function save(patch) {
		const got = await ext.storage.local.get({ settings: {} });
		await ext.storage.local.set({
			settings: { ...got.settings, ...patch },
		});
	}

	async function allow(appid, name) {
		const got = await ext.storage.local.get({ allow: {} });
		got.allow[appid] = name || String(appid);
		await ext.storage.local.set({ allow: got.allow });
	}

	async function disallow(appid) {
		const got = await ext.storage.local.get({ allow: {} });
		delete got.allow[appid];
		await ext.storage.local.set({ allow: got.allow });
	}

	root.AiSlopSettings = { DEFAULTS, load, save, allow, disallow };
})(globalThis);
