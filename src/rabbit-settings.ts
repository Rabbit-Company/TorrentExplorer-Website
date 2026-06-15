/**
 * Rabbit Encoder settings-code decoder (display-only).
 *
 * Older releases store `RABBIT_ENCODER/SETTINGS` as already-human text, e.g.
 *   "Denoise auto, Quality low, Speed slower"
 * Newer releases store a compact, machine-readable code, e.g.
 *   "RE1|c~q=l,sp=sr,dd=1|al~v=jpn+eng"
 */

export interface DecodedSetting {
	label: string;
	value: string;
	/** Render the value as monospace flag chips (e.g. raw encoder CLI flags). */
	mono?: boolean;
}

export interface DecodedSettings {
	/** Format version parsed from the `RE<n>` prefix. */
	version: number;
	/** True when the version is newer than this build understands. */
	newerFormat: boolean;
	/** Flat, display-ready overrides (defaults are omitted by the encoder). */
	items: DecodedSetting[];
}

/** Highest format version this decoder was written against. */
const KNOWN_FORMAT = 1;

const PREFIX_RE = /^RE(\d+)(?:\||$)/;

export function looksLikeSettingsCode(value: string): boolean {
	return PREFIX_RE.test(value.trim());
}

const QUALITY: Record<string, string> = { l: "Low", m: "Medium", h: "High" };
const SPEED: Record<string, string> = { sr: "Slower", s: "Slow", m: "Medium", f: "Fast", fr: "Faster" };
const LEVEL: Record<string, string> = { o: "Off", l: "Light", m: "Medium", h: "Heavy", a: "Auto" };
const VIDEO: Record<string, string> = { av1: "AV1", off: "Off (copy)" };
const AUDIO: Record<string, string> = { opus: "Opus", copy: "Copy (passthrough)" };
const SUBS: Record<string, string> = { full: "Full", copy: "Copy" };

const BITRATE_CHANNELS: { code: string; label: string }[] = [
	{ code: "mo", label: "Mono" },
	{ code: "so", label: "Stereo" },
	{ code: "c21", label: "2.1" },
	{ code: "c51", label: "5.1" },
	{ code: "c61", label: "6.1" },
	{ code: "c71", label: "7.1" },
	{ code: "c714", label: "7.1.4" },
];

function unesc(s: string): string {
	return s.replace(/%(7C|7E|2C|3D|2B|25)/gi, (_, h: string) => {
		switch (h.toUpperCase()) {
			case "7C":
				return "|";
			case "7E":
				return "~";
			case "2C":
				return ",";
			case "3D":
				return "=";
			case "2B":
				return "+";
			case "25":
				return "%";
			default:
				return _;
		}
	});
}

function parsePayload(payload: string): Record<string, string> {
	const out: Record<string, string> = {};
	if (!payload) return out;
	for (const pair of payload.split(",")) {
		if (!pair) continue;
		const eq = pair.indexOf("=");
		if (eq < 0) continue;
		out[pair.slice(0, eq)] = pair.slice(eq + 1);
	}
	return out;
}

function splitList(v: string | undefined): string[] {
	if (!v) return [];
	return v
		.split("+")
		.map((x) => unesc(x).trim())
		.filter((x) => x.length > 0);
}

function bool(v: string | undefined): string | null {
	if (v === undefined) return null;
	return v === "1" ? "Yes" : "No";
}

/** Join a sparse set of "k v" fragments, skipping the ones not present. */
function joinTuning(pairs: [string, string | undefined][]): string {
	const parts: string[] = [];
	for (const [k, v] of pairs) if (v !== undefined) parts.push(`${k} ${v}`);
	return parts.join(" · ");
}

/**
 * Decode a settings code into display-ready pairs, or `null` when the input
 * is not a recognisable code (caller should then show the raw string).
 */
export function decodeRabbitSettings(code: string): DecodedSettings | null {
	const raw = (code ?? "").trim();
	const tokens = raw.split("|");
	const m = (tokens[0] ?? "").match(/^RE(\d+)$/);
	if (!m) return null;

	const version = parseInt(m[1]!, 10);
	const newerFormat = version > KNOWN_FORMAT;
	const items: DecodedSetting[] = [];

	// Collect sections first so we can emit a stable, readable ordering
	// regardless of how they appear in the code.
	let core: Record<string, string> | null = null;
	let denoise: Record<string, string> | null = null;
	let deband: Record<string, string> | null = null;
	let bitrates: Record<string, string> | null = null;
	let audioLangs: string[] = [];
	let subtitleLangs: string[] = [];
	const filters: Record<string, string>[] = [];

	for (let i = 1; i < tokens.length; i++) {
		const sectionRaw = tokens[i]!;
		if (!sectionRaw) continue;
		const t = sectionRaw.indexOf("~");
		if (t < 0) continue;
		const tag = sectionRaw.slice(0, t);
		const kv = parsePayload(sectionRaw.slice(t + 1));

		switch (tag) {
			case "c":
				core = kv;
				break;
			case "dn":
				denoise = kv;
				break;
			case "db":
				deband = kv;
				break;
			case "ab":
				bitrates = kv;
				break;
			case "al":
				audioLangs = splitList(kv.v);
				break;
			case "sl":
				subtitleLangs = splitList(kv.v);
				break;
			case "vs":
				filters.push(kv);
				break;
			default:
				break; // unknown section: ignore for forward-compatibility
		}
	}

	const push = (label: string, value: string | null | undefined, mono = false) => {
		if (value !== null && value !== undefined && value !== "") items.push({ label, value, mono });
	};

	// Core
	if (core) {
		push("Video", core.v ? (VIDEO[core.v] ?? core.v) : null);
		push("Audio", core.a ? (AUDIO[core.a] ?? core.a) : null);
		push("Subtitles", core.su ? (SUBS[core.su] ?? core.su) : null);
		push("Quality", core.q ? (QUALITY[core.q] ?? core.q) : null);
		push("Speed", core.sp ? (SPEED[core.sp] ?? core.sp) : null);
		push("Downscale", bool(core.ds));
		push("Skip boosting", bool(core.sb));
		push("No phase inversion", bool(core.np));
		push("Dedupe subtitles", bool(core.dd));
		push("Highest audio layout only", bool(core.kc));
		push("No commentary audio", bool(core.rc));
	}

	// Denoise
	if (denoise && denoise.m && LEVEL[denoise.m] && LEVEL[denoise.m] !== "Off") {
		const mode = LEVEL[denoise.m]!;
		push("Denoise", mode);
		if (denoise.m === "a") {
			const thr = joinTuning([
				["light", denoise.tl],
				["medium", denoise.tm],
				["heavy", denoise.th],
			]);
			if (thr) push("Denoise thresholds", thr);
			for (const [pfx, name] of [
				["l", "light"],
				["m", "medium"],
				["h", "heavy"],
			] as const) {
				const tuning = joinTuning([
					["s", denoise[`${pfx}s`]],
					["p", denoise[`${pfx}p`]],
					["r", denoise[`${pfx}r`]],
				]);
				if (tuning) push(`Denoise tuning (${name})`, tuning);
			}
		} else {
			const tuning = joinTuning([
				["s", denoise.s],
				["p", denoise.p],
				["r", denoise.r],
			]);
			if (tuning) push("Denoise tuning", tuning);
		}
	}

	// Deband
	if (deband && deband.m && LEVEL[deband.m] && LEVEL[deband.m] !== "Off") {
		push("Deband", LEVEL[deband.m]!);
		const tuning = joinTuning([
			["strength", deband.st],
			["radius", deband.rd],
		]);
		if (tuning) push("Deband tuning", tuning);
	}

	// Audio bitrates
	if (bitrates) {
		for (const { code, label } of BITRATE_CHANNELS) {
			if (bitrates[code] !== undefined) push(`Audio bitrate (${label})`, `${bitrates[code]} kbps`);
		}
	}

	// Languages
	if (audioLangs.length) push("Audio languages", audioLangs.join(", "));
	if (subtitleLangs.length) push("Subtitle languages", subtitleLangs.join(", "));

	if (core) {
		push("Custom parameters", core.cp ? unesc(core.cp) : null, true);
	}

	// VapourSynth filter chain (one row per active filter, in order)
	let n = 0;
	for (const kv of filters) {
		const id = kv.id ? unesc(kv.id) : "";
		const lv = kv.lv ? unesc(kv.lv) : "";
		if (!id || !lv) continue;
		n++;
		const params = Object.keys(kv)
			.filter((k) => k !== "id" && k !== "lv")
			.map((k) => `${k}=${unesc(kv[k]!)}`)
			.join(", ");
		const levelLabel = LEVEL[lv] ?? lv;
		const value = params ? `${levelLabel} · ${params}` : levelLabel;
		push(filters.length > 1 ? `Filter ${n} (${id})` : `Filter (${id})`, value);
	}

	return { version, newerFormat, items };
}
