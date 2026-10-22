(function () {
	"use strict";

	const ext = globalThis.browser || globalThis.chrome;
	const Settings = globalThis.AiSlopSettings;
	const Steam = globalThis.AiSlopSteam;
	const ORIGINS = [
		"https://store.steampowered.com/*",
		"https://api.steampowered.com/*",
	];
	// the "one step below" tag for each level
	const LOWER = {
		3: "Tag games with some AI content",
		2: "Tag games that used AI only for tools/store art",
	};
	const $ = (id) => document.getElementById(id);

	async function show() {
		const s = await Settings.load();
		$("enabled").checked = s.enabled;
		document.body.classList.toggle("off", !s.enabled);
		for (const r of document.querySelectorAll("input[name=level]"))
			r.checked = Number(r.value) === s.level;
		for (const r of document.querySelectorAll("input[name=action]"))
			r.checked = r.value === s.action;
		$("labelLower").checked = s.labelLower;
		$("lower-row").hidden = !LOWER[s.level];
		$("lower-text").textContent = LOWER[s.level] || "";
		$("counter").checked = s.counter;
		$("counter-row").hidden = s.action !== "hide";
		showAllow(s.allow);
	}

	function showAllow(allow) {
		const list = $("allow");
		list.textContent = "";
		const entries = Object.entries(allow).sort((a, b) =>
			a[1].localeCompare(b[1]),
		);
		$("allow-empty").hidden = entries.length > 0;
		for (const [appid, name] of entries) {
			const li = document.createElement("li");
			const a = document.createElement("a");
			a.href =
				"https://store.steampowered.com/app/" +
				encodeURIComponent(appid) +
				"/";
			a.target = "_blank";
			a.rel = "noopener";
			a.textContent = name;
			a.title = name;
			const rm = document.createElement("button");
			rm.type = "button";
			rm.textContent = "Remove";
			rm.addEventListener("click", () =>
				Settings.disallow(appid).then(show),
			);
			li.append(a, rm);
			list.appendChild(li);
		}
	}

	async function showStats() {
		const s = await Steam.cacheStats();
		const have = s.disclosed === 1 ? "1 has" : s.disclosed + " have";
		$("stats").textContent = s.games
			? `Checked ${s.games} games. ${have} a disclosure.`
			: "No games checked yet.";
	}

	async function checkAccess() {
		if (!ext.permissions || !ext.permissions.contains) return;
		const ok = await ext.permissions.contains({ origins: ORIGINS });
		$("perm").hidden = ok;
	}

	$("enabled").addEventListener("change", (e) =>
		Settings.save({ enabled: e.target.checked }).then(show),
	);
	$("labelLower").addEventListener("change", (e) =>
		Settings.save({ labelLower: e.target.checked }),
	);
	$("counter").addEventListener("change", (e) =>
		Settings.save({ counter: e.target.checked }),
	);
	for (const r of document.querySelectorAll("input[name=level]")) {
		r.addEventListener("change", () =>
			Settings.save({ level: Number(r.value) }).then(show),
		);
	}
	for (const r of document.querySelectorAll("input[name=action]")) {
		r.addEventListener("change", () =>
			Settings.save({ action: r.value }).then(show),
		);
	}
	$("clear").addEventListener("click", () =>
		Steam.clearCache().then(showStats),
	);
	$("grant").addEventListener("click", () => {
		ext.permissions
			.request({ origins: ORIGINS })
			.then(checkAccess, checkAccess);
	});

	show();
	showStats();
	checkAccess().catch(() => {});
})();
