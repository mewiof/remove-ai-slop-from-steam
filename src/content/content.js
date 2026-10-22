(function () {
	"use strict";

	const ext = globalThis.browser || globalThis.chrome;
	const { classify } = globalThis.AiSlopClassify;
	const Settings = globalThis.AiSlopSettings;
	const Steam = globalThis.AiSlopSteam;

	const REF = "a[href*='/app/'], [data-ds-appid], img[src*='/steam/apps/']";
	const IMG_APP = /\/steam\/apps\/(\d+)\//;
	const HREF_APP = /^\/(?:agecheck\/)?app\/(\d+)/;
	// trailer thumbnails sit under /steam/apps/<movie id>/ (movie ids are above appids)
	const MAX_APPID = 1e8;
	const STOP =
		"body, main, header, footer, nav, section, [role=main], [role=dialog], #global_header, #store_header, " +
		"#responsive_page_template_content, .page_content_ctn, .page_content, .home_page_body_ctn";
	// a sale section can be one item of a longer list (Next Fest)
	const SECTION = "[class*=SaleSection]";
	// carousels page by index
	const COVER =
		".carousel__slide, .store_main_capsule, .home_page_takeover_link";
	const MEDIA = "img, video, picture, [style*='background-image']";
	const OWN_PAGE = /^\/(?:wishlist|cart|checkout|account)\b/;

	const LABEL = { 3: "Mostly AI", 2: "Some AI", 1: "AI tools" };
	const LEVEL_TEXT = {
		3: "Mostly AI-generated",
		2: "Has some AI-generated content",
		1: "AI used for tools/store art/translation",
	};
	const COVER_TEXT = {
		3: "Hidden: mostly AI-generated",
		2: "Hidden: has AI-generated content",
		1: "Hidden: has an AI disclosure",
	};
	const KIND_TEXT = {
		live: "AI at runtime",
		art: "art",
		music: "music/sound",
		voice: "voices",
		story: "story/dialogue",
		text: "text",
		design: "levels",
		ui: "UI/icons",
		content: "assets",
		marketing: "store art",
		concept: "concepts",
		translation: "translation",
		code: "code",
	};

	let settings = Settings.DEFAULTS;
	let ready = false;
	let dead = false;
	let cc = "US";
	let pageApp = null;
	let pageShown = false;
	let revealAll = false;

	const verdicts = new Map(); // appid -> { level, kinds, notes } (level 0 when no disclosure)
	const asked = new Set();
	const refApp = new WeakMap(); // element -> [source string, appid]
	const byApp = new Map(); // appid
	const capCache = new WeakMap(); // element -> capsule found for it
	const applied = new Map(); // container -> { appid, mode, extra }
	const revealed = new Set(); // appids shown with "Show"

	function isDead(e) {
		return /context invalidated|Extension context/i.test(
			String(e && e.message),
		);
	}

	function appOf(el) {
		let src;
		if (el.hasAttribute("data-ds-appid"))
			src = "ds:" + el.getAttribute("data-ds-appid");
		else if (el.tagName === "IMG") src = el.getAttribute("src") || "";
		else src = el.getAttribute("href") || "";
		const known = refApp.get(el);
		if (known && known[0] === src) return known[1];
		let id = null;
		if (src.startsWith("ds:")) {
			if (/^ds:\d+$/.test(src)) id = src.slice(3);
		} else if (el.tagName === "IMG") {
			const m = IMG_APP.exec(src);
			if (m) id = m[1];
		} else {
			try {
				const u = new URL(src, location.href);
				const m =
					u.hostname === "store.steampowered.com" &&
					HREF_APP.exec(u.pathname);
				if (m) id = m[1];
			} catch (e) {
				id = null;
			}
		}
		if (id && Number(id) >= MAX_APPID) id = null;
		refApp.set(el, [src, id]);
		return id;
	}

	function hasOther(parent, appid) {
		const links =
			"a[href*='/app/']:not([href*='/app/" +
			appid +
			"/']):not([href*='/app/" +
			appid +
			"?'])" +
			":not([href$='/app/" +
			appid +
			"']):not([href*='/app/" +
			appid +
			"#']), [data-ds-appid]:not([data-ds-appid='" +
			appid +
			"'])";
		for (const el of parent.querySelectorAll(links)) {
			const id = appOf(el);
			if (id && id !== appid) return true;
		}
		for (const el of parent.querySelectorAll(
			"img[src*='/steam/apps/']:not([src*='/apps/" + appid + "/'])",
		)) {
			const id = appOf(el);
			if (id && id !== appid) return true;
		}
		return false;
	}

	// list = a row/grid cell among other games (safe to hide)
	function capsule(el, appid) {
		const cached = capCache.get(el);
		// may get neighbours when the list loads more
		const fresh = cached && (cached.list || Date.now() - cached.at < 2000);
		if (
			fresh &&
			cached.appid === appid &&
			cached.node.isConnected &&
			cached.node.contains(el)
		)
			return cached.ok ? cached : null;
		let node = el;
		let list = false;
		for (let depth = 0; depth < 16; depth++) {
			const parent = node.parentElement;
			if (!parent) break;
			if (hasOther(parent, appid)) {
				list = true;
				break;
			}
			if (parent.matches(STOP)) break;
			if (parent.matches(SECTION)) {
				// barely bigger than the game box = just the wrapper
				const above = parent.parentElement;
				const a = node.getBoundingClientRect();
				const b = parent.getBoundingClientRect();
				const wrapper =
					a.width * a.height >= 0.7 * b.width * b.height &&
					b.width * b.height > 0;
				if (
					wrapper &&
					above &&
					!above.matches(STOP) &&
					hasOther(above, appid)
				) {
					node = parent;
					list = true;
				}
				break;
			}
			node = parent;
		}
		if (!list) node = commonAncestor(node, appid) || node;
		if (node.tagName === "IMG" && node.parentElement)
			node = node.parentElement;
		// breadcrumbs/a game from a news post
		const ok =
			el.hasAttribute("data-ds-appid") ||
			node.matches(MEDIA) ||
			node.querySelector(MEDIA);
		const res = { appid, node, list, ok, at: Date.now() };
		capCache.set(el, res);
		return ok ? res : null;
	}

	function commonAncestor(root, appid) {
		const els = [...(byApp.get(appid) || [])].filter((e) =>
			root.contains(e),
		);
		if (!els.length) return null;
		let anc = els[0];
		while (anc && anc !== root && !els.every((e) => anc.contains(e)))
			anc = anc.parentElement;
		return anc;
	}

	function modeFor(appid) {
		const v = verdicts.get(appid);
		if (!v || !v.level || !settings.enabled || settings.allow[appid])
			return null;
		if (v.level >= settings.level) {
			if (revealAll || revealed.has(appid)) return "label";
			if (settings.action === "hide" && OWN_PAGE.test(location.pathname))
				return "label";
			return settings.action;
		}
		if (settings.labelLower && v.level === settings.level - 1) return "tag";
		return null;
	}

	function describe(v) {
		const head = v.kinds.includes("live")
			? "Generates content with AI while you play"
			: LEVEL_TEXT[v.level];
		const kinds = v.kinds.map((k) => KIND_TEXT[k]).filter(Boolean);
		return {
			head,
			kinds: kinds.length ? "AI used for: " + kinds.join("/") : "",
		};
	}

	function tooltip(v) {
		const d = describe(v);
		const notes =
			v.notes.length > 600 ? v.notes.slice(0, 600) + "..." : v.notes;
		return (
			d.head +
			(d.kinds ? ". " + d.kinds : "") +
			"\n\nDeveloper's AI disclosure:\n" +
			notes
		);
	}

	function badgeText(v) {
		return v.kinds.includes("live") && v.level === 3
			? "Runtime AI"
			: LABEL[v.level];
	}

	function makeBadge(v) {
		const b = document.createElement("span");
		b.className = "aislop-badge";
		b.textContent = badgeText(v);
		b.title = tooltip(v);
		return b;
	}

	// Steam's own corner flags (stream LIVE/IN LIBRARY) sit there too. Go below them
	function placeBadge(node, badge) {
		const box = node.getBoundingClientRect();
		let top = 4;
		for (const el of node.querySelectorAll("*")) {
			if (badge.contains(el)) continue;
			const r = el.getBoundingClientRect();
			if (!r.height || r.height > 40 || r.width > 200) continue;
			if (r.top - box.top > 40 || r.left - box.left > 40) continue;
			if (getComputedStyle(el).position !== "absolute") continue;
			top = Math.max(top, Math.round(r.bottom - box.top) + 4);
		}
		badge.style.top = top + "px";
	}

	function makeCover(appid, v) {
		const c = document.createElement("div");
		c.className = "aislop-cover";
		c.title = tooltip(v);
		const t = document.createElement("span");
		t.className = "aislop-cover-title";
		t.textContent = COVER_TEXT[v.level];
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "aislop-cover-show";
		btn.textContent = "Show";
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			revealed.add(appid);
			render();
		});
		c.addEventListener("click", (e) => {
			if (e.target === btn) return;
			e.preventDefault();
			e.stopPropagation();
		});
		c.append(t, btn);
		return c;
	}

	function mark(node, want) {
		const v = verdicts.get(want.appid);
		const st = { appid: want.appid, mode: want.mode, extra: [] };
		node.setAttribute("data-aislop", want.mode);
		node.setAttribute("data-aislop-level", String(v.level));
		if (want.mode !== "hide") {
			if (getComputedStyle(node).position === "static")
				node.setAttribute("data-aislop-pos", "");
			const extra =
				want.mode === "cover" ? makeCover(want.appid, v) : makeBadge(v);
			node.appendChild(extra);
			st.extra.push(extra);
			if (want.mode !== "cover") {
				st.badge = extra;
				placeBadge(node, extra);
				st.count = node.getElementsByTagName("*").length;
			}
		}
		applied.set(node, st);
	}

	function unmark(node, st) {
		node.removeAttribute("data-aislop");
		node.removeAttribute("data-aislop-level");
		node.removeAttribute("data-aislop-pos");
		for (const e of st.extra) e.remove();
		applied.delete(node);
	}

	function render() {
		if (!ready || dead) return;
		const want = new Map();
		for (const [appid, els] of byApp) {
			const mode = modeFor(appid);
			if (!mode) continue;
			for (const el of els) {
				const cap = capsule(el, appid);
				if (!cap) continue;
				let m = mode;
				if (m === "hide" && (!cap.list || cap.node.matches(COVER)))
					m = "cover";
				want.set(cap.node, { appid, mode: m });
			}
		}
		// drop boxes inside a bigger box (same game)
		for (const [node, w] of want) {
			for (let p = node.parentElement; p; p = p.parentElement) {
				const outer = want.get(p);
				if (outer && outer.appid === w.appid) {
					want.delete(node);
					break;
				}
			}
		}
		for (const [node, st] of [...applied]) {
			const w = want.get(node);
			if (
				!node.isConnected ||
				!w ||
				w.mode !== st.mode ||
				w.appid !== st.appid
			)
				unmark(node, st);
		}
		for (const [node, w] of want) if (!applied.has(node)) mark(node, w);
		// Steam can add its LIVE flag later
		for (const [node, st] of applied) {
			if (!st.badge) continue;
			const count = node.getElementsByTagName("*").length;
			if (count === st.count) continue;
			st.count = count;
			placeBadge(node, st.badge);
		}
		renderPage();
		renderCounter();
	}

	function setVerdict(id, notes) {
		if (notes === null || notes === undefined) {
			verdicts.set(id, { level: 0, kinds: [], notes: "" });
			return;
		}
		const r = classify(notes);
		verdicts.set(id, {
			level: r.level,
			kinds: r.kinds,
			notes: notes.trim(),
		});
	}

	async function ask(ids) {
		try {
			const res = await ext.runtime.sendMessage({
				type: "lookup",
				ids,
				cc,
			});
			if (res && res.ok) return res.items;
		} catch (e) {
			if (isDead(e)) throw e;
		}
		// no background answered (Extendium can run without)
		const items = await Steam.fetchAll(ids, cc);
		Steam.writeCache(items).catch(() => {});
		return items;
	}

	function retryLater(ids) {
		if (!ids.length) return;
		setTimeout(() => {
			for (const id of ids) asked.delete(id);
			schedule();
		}, 60000);
	}

	async function lookup(ids) {
		for (const id of ids) asked.add(id);
		try {
			const items = await Steam.readCache(ids);
			const missing = ids.filter((id) => !(id in items));
			if (missing.length) Object.assign(items, await ask(missing));
			for (const [id, notes] of Object.entries(items))
				setVerdict(id, notes);
			retryLater(ids.filter((id) => !(id in items)));
		} catch (e) {
			if (isDead(e)) return stop();
			retryLater(ids);
		}
		schedule();
	}

	function scan() {
		checkPage();
		for (const el of document.querySelectorAll(REF)) {
			const id = appOf(el);
			if (!id || id === pageApp) continue;
			let set = byApp.get(id);
			if (!set) byApp.set(id, (set = new Set()));
			set.add(el);
		}
		for (const [id, set] of byApp) {
			for (const el of set)
				if (!el.isConnected || appOf(el) !== id) set.delete(el);
			if (!set.size) byApp.delete(id);
		}
		const need = [...byApp.keys()].filter((id) => !asked.has(id));
		if (pageApp && !asked.has(pageApp)) need.unshift(pageApp);
		for (let i = 0; i < need.length; i += 300)
			lookup(need.slice(i, i + 300));
		render();
	}

	let timer = null;
	function schedule() {
		if (timer || dead) return;
		timer = setTimeout(() => {
			timer = null;
			if (ready) scan();
		}, 150);
	}

	// game page is a banner on top/gate over the whole page

	let pageUi = null;

	function checkPage() {
		const m = HREF_APP.exec(location.pathname);
		const id = m ? m[1] : null;
		if (id === pageApp) return;
		pageApp = id;
		pageShown = false;
	}

	function gameName() {
		const el = document.querySelector("#appHubAppName, .apphub_AppName");
		if (el && el.textContent.trim()) return el.textContent.trim();
		return (
			document.title
				.replace(/\s+on Steam\s*$/i, "")
				.replace(/^Save \d+% on\s+/i, "")
				.trim() || "This game"
		);
	}

	function shadowHost(tag) {
		const host = document.createElement(tag);
		host.className = "aislop-host";
		const root = host.attachShadow({ mode: "open" });
		const style = document.createElement("style");
		style.textContent = UI_CSS;
		root.appendChild(style);
		return { host, root };
	}

	function button(text, cls, onClick) {
		const b = document.createElement("button");
		b.type = "button";
		b.textContent = text;
		if (cls) b.className = cls;
		b.addEventListener("click", onClick);
		return b;
	}

	function renderPage() {
		const appid = pageApp;
		const v = appid && verdicts.get(appid);
		const mode = v ? modeFor(appid) : null;
		const kind = !mode
			? null
			: mode === "hide" && !pageShown
				? "gate"
				: "banner";
		const key = kind && appid + ":" + kind + ":" + mode + ":" + v.level;
		if (pageUi && pageUi.key === key && pageUi.host.isConnected) {
			// gate can go up before the page has title
			if (pageUi.name) pageUi.name.textContent = gameName();
			return;
		}
		if (pageUi) {
			pageUi.host.remove();
			document.documentElement.removeAttribute("data-aislop-gate");
			document.documentElement.removeAttribute("data-aislop-page");
			pageUi = null;
		}
		if (!kind) return;
		// banner needs the parsed page to find title
		if (
			kind === "banner" &&
			(!document.body || document.readyState === "loading")
		)
			return;
		pageUi =
			kind === "gate" ? makeGate(appid, v) : makeBanner(appid, v, mode);
		pageUi.key = key;
	}

	function disclosureBlock(v) {
		const box = document.createElement("div");
		box.className = "notes";
		const h = document.createElement("div");
		h.className = "notes-head";
		h.textContent = "The developer's AI disclosure on Steam:";
		const q = document.createElement("blockquote");
		q.textContent = v.notes;
		box.append(h, q);
		return box;
	}

	function makeGate(appid, v) {
		const { host, root } = shadowHost("aislop-gate");
		const d = describe(v);
		const wrap = document.createElement("div");
		wrap.className = "gate level-" + v.level;
		const card = document.createElement("div");
		card.className = "card";
		const title = document.createElement("h1");
		title.textContent = d.head;
		const name = document.createElement("p");
		name.className = "name";
		name.textContent = gameName();
		const kinds = document.createElement("p");
		kinds.className = "kinds";
		kinds.textContent = d.kinds;
		const row = document.createElement("div");
		row.className = "row";
		row.append(
			button("Show the page", "primary", () => {
				pageShown = true;
				renderPage();
			}),
			button("Always show this game", "", () => {
				Settings.allow(appid, gameName()).catch(() => {});
			}),
			button("Go back", "", () => {
				if (history.length > 1) history.back();
				else location.href = "https://store.steampowered.com/";
			}),
		);
		const foot = document.createElement("p");
		foot.className = "foot";
		foot.textContent =
			"Hidden by Remove AI Slop from Steam. Change this in the extension's settings.";
		card.append(title, name, kinds, disclosureBlock(v), row, foot);
		wrap.appendChild(card);
		root.appendChild(wrap);
		document.documentElement.setAttribute("data-aislop-gate", "");
		document.documentElement.appendChild(host);
		// keep Steam's keyboard shortcuts out
		host.addEventListener("keydown", (e) => e.stopPropagation());
		return { host, name };
	}

	function makeBanner(appid, v, mode) {
		const { host, root } = shadowHost("aislop-banner");
		const d = describe(v);
		const bar = document.createElement("div");
		bar.className =
			"banner level-" + v.level + (mode === "tag" ? " light" : "");
		const text = document.createElement("div");
		text.className = "text";
		const strong = document.createElement("strong");
		strong.textContent = d.head;
		const small = document.createElement("span");
		small.textContent = d.kinds ? " " + d.kinds : "";
		text.append(strong, small);
		const details = document.createElement("details");
		const sum = document.createElement("summary");
		sum.textContent = "Read the disclosure";
		details.append(sum, disclosureBlock(v));
		const actions = document.createElement("div");
		actions.className = "row";
		actions.appendChild(
			button("Always show this game", "", () =>
				Settings.allow(appid, gameName()).catch(() => {}),
			),
		);
		bar.append(text, actions, details);
		root.appendChild(bar);
		// above the breadcrumbs
		const anchor = [
			".game_title_area",
			".page_title_area",
			".page_content_ctn",
		]
			.map((s) => document.querySelector(s))
			.find(Boolean);
		if (anchor) anchor.insertBefore(host, anchor.firstChild);
		else document.body.insertBefore(host, document.body.firstChild);
		if (mode === "blur")
			document.documentElement.setAttribute("data-aislop-page", "blur");
		return { host };
	}

	// "N hidden" button in the corner

	let counter = null;

	function renderCounter() {
		const hidden = new Set();
		for (const st of applied.values())
			if (st.mode === "hide" || st.mode === "cover") hidden.add(st.appid);
		const shownByUser = revealAll;
		const n = hidden.size;
		const show =
			settings.enabled &&
			settings.counter &&
			(n > 0 || shownByUser) &&
			document.body;
		if (!show) {
			if (counter) counter.host.remove();
			counter = null;
			return;
		}
		if (!counter) {
			const { host, root } = shadowHost("aislop-counter");
			const box = document.createElement("div");
			box.className = "counter";
			const label = document.createElement("span");
			const btn = button("", "", () => {
				revealAll = !revealAll;
				render();
			});
			box.append(label, btn);
			root.appendChild(box);
			document.body.appendChild(host);
			counter = { host, label, btn };
		}
		if (!counter.host.isConnected) document.body.appendChild(counter.host);
		if (revealAll) {
			counter.label.textContent = "Showing hidden AI games";
			counter.btn.textContent = "Hide again";
		} else {
			counter.label.textContent =
				n === 1 ? "1 AI game hidden" : n + " AI games hidden";
			counter.btn.textContent = "Show";
		}
	}

	const UI_CSS = `
:host { all: initial; display: block; }
* { box-sizing: border-box; }
button { font: 600 13px/1 "Motiva Sans", Arial, sans-serif; color: #fff; background: #3d4450; border: 0; border-radius: 2px; padding: 9px 14px; cursor: pointer; }
button:hover { background: #4b5463; }
button.primary { background: linear-gradient(90deg, #06bfff, #2d73ff); }
button.primary:hover { filter: brightness(1.1); }
.gate { position: fixed; inset: 0; z-index: 2147483600; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(12, 15, 20, 0.97); font: 14px/1.5 "Motiva Sans", Arial, sans-serif; color: #c7d5e0; overflow: auto; }
.card { max-width: 640px; width: 100%; background: #1b2838; border-top: 4px solid #e5484d; border-radius: 4px; padding: 24px; box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6); }
.level-2 .card { border-top-color: #f5a524; }
.level-1 .card { border-top-color: #8b949e; }
h1 { margin: 0 0 4px; font-size: 24px; line-height: 1.2; color: #fff; font-weight: 700; }
.name { margin: 0 0 4px; font-size: 16px; color: #66c0f4; }
.kinds { margin: 0 0 16px; color: #8f98a0; }
.notes { margin: 0 0 20px; }
.notes-head { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #8f98a0; margin-bottom: 6px; }
blockquote { margin: 0; padding: 10px 12px; max-height: 240px; overflow: auto; white-space: pre-wrap; background: rgba(0, 0, 0, 0.25); border-left: 3px solid #3d4450; color: #c7d5e0; }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
.foot { margin: 16px 0 0; font-size: 12px; color: #67707b; }
.banner { display: grid; grid-template-columns: 1fr auto; gap: 8px 16px; align-items: center; margin: 12px 0; padding: 10px 14px; background: #1b2838; border-left: 4px solid #e5484d; border-radius: 3px; font: 14px/1.4 "Motiva Sans", Arial, sans-serif; color: #c7d5e0; }
.banner.level-2 { border-left-color: #f5a524; }
.banner.level-1 { border-left-color: #8b949e; }
.banner.light { background: #16202d; }
.banner strong { color: #fff; }
.banner span { color: #8f98a0; }
.banner details { grid-column: 1 / -1; }
.banner summary { cursor: pointer; color: #66c0f4; font-size: 13px; }
.banner .notes { margin: 8px 0 0; }
.banner button { padding: 7px 10px; font-size: 12px; }
.counter { position: fixed; left: 12px; bottom: 12px; z-index: 2147483500; display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 12px; background: rgba(23, 26, 33, 0.96); border-left: 3px solid #e5484d; border-radius: 3px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6); font: 13px/1 "Motiva Sans", Arial, sans-serif; color: #c7d5e0; }
.counter button { padding: 6px 10px; font-size: 12px; }
@media (max-width: 600px) { .banner { grid-template-columns: 1fr; } .card { padding: 16px; } h1 { font-size: 20px; } }
`;

	function stop() {
		dead = true;
		observer.disconnect();
	}

	const observer = new MutationObserver(schedule);

	// some games only exist in some regions
	function readCountry() {
		try {
			const info = document.querySelector("#application_config");
			const user =
				info && JSON.parse(info.getAttribute("data-userinfo") || "{}");
			if (user && /^[A-Z]{2}$/.test(user.country_code))
				cc = user.country_code;
		} catch (e) {
			// last known country
		}
	}

	async function start() {
		try {
			settings = await Settings.load();
		} catch (e) {
			if (isDead(e)) return;
		}
		readCountry();
		ready = true;
		scan();
	}

	ext.storage.onChanged.addListener((changes, area) => {
		if (
			area !== "local" ||
			dead ||
			!("settings" in changes || "allow" in changes)
		)
			return;
		Settings.load().then(
			(s) => {
				settings = s;
				if (!settings.enabled) revealAll = false;
				render();
			},
			() => {},
		);
	});

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ["href", "src", "data-ds-appid"],
	});
	document.addEventListener("DOMContentLoaded", () => {
		readCountry();
		schedule();
	});
	window.addEventListener("popstate", schedule);
	start();
})();
