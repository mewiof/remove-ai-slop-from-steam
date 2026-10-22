import {
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const dist = join(root, "dist");
const base = JSON.parse(readFileSync(join(src, "manifest.json"), "utf8"));

// icon source (not needed at runtime)
const SKIP = [/\.svg$/];

const GECKO = {
	gecko: {
		id: "remove-ai-slop-from-steam@mewiof",
		strict_min_version: "140.0",
		data_collection_permissions: { required: ["none"] },
	},
	gecko_android: { strict_min_version: "142.0" },
};

const targets = {
	chrome: (m) => m,
	// Firefox has no extension workers
	firefox: (m) => {
		const out = {};
		for (const [k, v] of Object.entries(m)) {
			if (k === "minimum_chrome_version") continue;
			out[k] =
				k === "background"
					? { scripts: ["lib/steam.js", "background.js"] }
					: v;
		}
		out.browser_specific_settings = GECKO;
		return out;
	},
};

function walk(dir) {
	const out = [];
	for (const name of readdirSync(dir).sort()) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...walk(p));
		else out.push(p);
	}
	return out;
}

function zip(files) {
	const DOS_TIME = 0;
	const DOS_DATE = (0 << 9) | (1 << 5) | 1;
	const parts = [];
	const central = [];
	let offset = 0;
	for (const { name, data } of files) {
		const fname = Buffer.from(name, "utf8");
		const packed = deflateRawSync(data, { level: 9 });
		const deflate = packed.length < data.length;
		const body = deflate ? packed : data;
		const crc = crc32(data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6);
		local.writeUInt16LE(deflate ? 8 : 0, 8);
		local.writeUInt16LE(DOS_TIME, 10);
		local.writeUInt16LE(DOS_DATE, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(body.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(fname.length, 26);
		local.writeUInt16LE(0, 28);
		parts.push(local, fname, body);

		const entry = Buffer.alloc(46);
		entry.writeUInt32LE(0x02014b50, 0);
		entry.writeUInt16LE(20, 4);
		entry.writeUInt16LE(20, 6);
		entry.writeUInt16LE(0x0800, 8);
		entry.writeUInt16LE(deflate ? 8 : 0, 10);
		entry.writeUInt16LE(DOS_TIME, 12);
		entry.writeUInt16LE(DOS_DATE, 14);
		entry.writeUInt32LE(crc, 16);
		entry.writeUInt32LE(body.length, 20);
		entry.writeUInt32LE(data.length, 24);
		entry.writeUInt16LE(fname.length, 28);
		entry.writeUInt32LE(offset, 42);
		central.push(entry, fname);

		offset += local.length + fname.length + body.length;
	}
	const dir = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(dir.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...parts, dir, end]);
}

// Chrome Web Store limit
if (base.description.length > 132)
	throw new Error(
		`description is ${base.description.length} chars (max 132)`,
	);

rmSync(dist, { recursive: true, force: true });
const files = walk(src)
	.map((p) => relative(src, p).split(sep).join("/"))
	.filter(
		(name) => name !== "manifest.json" && !SKIP.some((re) => re.test(name)),
	);

for (const [target, shape] of Object.entries(targets)) {
	const out = join(dist, target);
	const manifest = Buffer.from(
		JSON.stringify(shape(structuredClone(base)), null, "\t") + "\n",
	);
	// MIT
	const entries = [
		{ name: "manifest.json", data: manifest },
		{ name: "LICENSE", data: readFileSync(join(root, "LICENSE")) },
	];
	for (const name of files)
		entries.push({ name, data: readFileSync(join(src, name)) });
	for (const { name, data } of entries) {
		mkdirSync(dirname(join(out, name)), { recursive: true });
		writeFileSync(join(out, name), data);
	}
	const zipName = `remove-ai-slop-from-steam-${base.version}-${target}.zip`;
	writeFileSync(join(dist, zipName), zip(entries));
	console.log(`dist/${zipName} (${entries.length} files)`);
}
