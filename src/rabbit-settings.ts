/**
 * Rabbit Encoder settings-code decoder (display-only).
 *
 * Older releases store `RABBIT_ENCODER/SETTINGS` as already-human text, e.g.
 *   "Denoise auto, Quality low, Speed slower"
 * Newer releases store a compact, machine-readable code, e.g.
 *   "RE1|c~q=l,sp=sr,dd=1|al~v=jpn+eng"
 *
 * The code only stores settings that differ from the frozen RE1 baseline, so
 * decoding starts from a copy of that baseline and applies the overrides on
 * top (mirroring Rabbit Encoder's own `decodeSettingsCode`). That lets the
 * site show every setting, not just the ones that were changed.
 */

export interface SettingRow {
	label: string;
	/** Human-readable value used for this encode. */
	value: string;
	/** Human-readable RE1 default. */
	defaultValue: string;
	/** True when the value differs from the RE1 default. */
	changed: boolean;
	/** Long explanation of what the setting does. */
	description: string;
	/** Render the value as monospace flag chips (e.g. raw encoder CLI flags). */
	mono?: boolean;
	/** Why the setting had no effect on this encode (unset when it did). */
	inactive?: string;
	/** Headline setting: always listed in the summary card, even at its default. */
	pinned?: boolean;
}

export interface SettingGroup {
	title: string;
	rows: SettingRow[];
}

export interface DecodedSettings {
	/** Format version parsed from the `RE<n>` prefix. */
	version: number;
	/** True when the version is newer than this build understands. */
	newerFormat: boolean;
	/** The raw code, as stored in the file (importable in Rabbit Encoder). */
	code: string;
	/** Every setting the code format carries, grouped for display. */
	groups: SettingGroup[];
	/** Summary: settings that changed and took effect, plus the pinned headline ones. */
	items: SettingRow[];
}

/** Highest format version this decoder was written against. */
const KNOWN_FORMAT = 1;

const PREFIX_RE = /^RE(\d+)(?:\||$)/;

export function looksLikeSettingsCode(value: string): boolean {
	return PREFIX_RE.test(value.trim());
}

// Settings model

type Level = "light" | "medium" | "heavy";
type Levels<T> = Record<Level, T>;

interface NlmeansParams {
	s: number;
	p: number;
	r: number;
}

interface GradfunParams {
	strength: number;
	radius: number;
}

interface VsFilter {
	id: string;
	level: string;
	params: [string, string][];
}

/**
 * Enum-like fields hold the long-form value (e.g. "medium") or, for codes this
 * build does not recognise, the raw code so it can still be displayed.
 */
interface Settings {
	encoder: string;
	manualCrf: number;
	manualPreset: number;
	customEncoderParams: string;
	videoEncode: string;
	audioEncode: string;
	subtitleProcessing: string;
	quality: string;
	finalSpeed: string;
	crop: string;
	cropLimit: number;
	downscale: boolean;
	skipBoosting: boolean;
	noPhaseInv: boolean;
	denoise: string;
	autoDenoiseMetric: string;
	autoDenoiseThresholds: Levels<number>;
	autoDenoiseBitrateThresholds: Levels<number>;
	nlmeansParams: Levels<NlmeansParams>;
	deband: string;
	gradfunParams: Levels<GradfunParams>;
	audioBitrates: Record<string, number>;
	dedupeSubtitles: boolean;
	keepBestAudioChannelsOnly: boolean;
	removeCommentaryAudio: boolean;
	audioLanguages: string[];
	subtitleLanguages: string[];
	removeDescriptiveAudio: boolean;
	removeKaraokeAudio: boolean;
	dropCompatibilityAudio: boolean;
	audioCodecPriority: string;
	preferUncensoredAudio: boolean;
	dedupeAudio: boolean;
	audioLanguagePriority: string[];
	renameAudioTracks: boolean;
	detectCommentaryAudio: boolean;
	detectDescriptiveAudio: boolean;
	detectKaraokeAudio: boolean;
	subtitleLangDetect: string;
	subtitleLangDetectConfidence: number;
	detectSignsSongs: boolean;
	detectSDH: boolean;
	detectHonorifics: boolean;
	signsSongsStyleRatio: number;
	signsSongsLineRatio: number;
	sdhRatioThreshold: number;
	sdhMinLines: number;
	honorificsMinCount: number;
	honorificsRatio: number;
	assumeMislabeledTracks: boolean;
	subtitleSourcePriority: string;
	subtitleFansubTiebreak: string;
	subtitleFormatPriority: string;
	dropPictureSubtitles: boolean;
	dedupeAcrossFormat: boolean;
	renameSubtitleTracks: boolean;
	compressSubtitles: boolean;
	compressSubtitlesMinSavings: number;
	removeSDHSubtitles: boolean;
	removeCommentarySubtitles: boolean;
	removeForcedSignsSongs: boolean;
	removeStoryboardSubtitles: boolean;
	removeHonorificsSubtitles: boolean;
	subtitleLanguagePriority: string[];
	convertSrtToAss: boolean;
	restyleAssFont: boolean;
	removeUnusedFonts: boolean;
	assRestyleTargets: string[];
	vsFilters: VsFilter[];
}

/**
 * Frozen RE1 baseline, copied from Rabbit Encoder's `settings-code.ts`
 * (machine-local and translation fields are not part of the code).
 */
const BASELINE: Settings = {
	encoder: "svt-av1-essential",
	manualCrf: 24,
	manualPreset: 4,
	customEncoderParams: "",
	videoEncode: "av1",
	audioEncode: "opus",
	subtitleProcessing: "full",
	quality: "medium",
	finalSpeed: "slow",
	crop: "off",
	cropLimit: 0.1,
	downscale: false,
	skipBoosting: false,
	noPhaseInv: false,
	denoise: "off",
	autoDenoiseMetric: "noise",
	autoDenoiseThresholds: { light: 0.5, medium: 0.7, heavy: 0.9 },
	autoDenoiseBitrateThresholds: { light: 1.3, medium: 1.8, heavy: 2.5 },
	nlmeansParams: {
		light: { s: 1.0, p: 3, r: 7 },
		medium: { s: 1.5, p: 3, r: 9 },
		heavy: { s: 2.0, p: 3, r: 11 },
	},
	deband: "off",
	gradfunParams: {
		light: { strength: 0.8, radius: 8 },
		medium: { strength: 1.4, radius: 16 },
		heavy: { strength: 2.8, radius: 24 },
	},
	audioBitrates: {
		mono: 64,
		stereo: 128,
		"2.1": 160,
		"3.0": 160,
		"3.1": 192,
		"4.0": 192,
		"4.1": 224,
		"5.0": 224,
		"5.1": 256,
		"6.0": 256,
		"6.1": 320,
		"7.0": 320,
		"7.1": 384,
		"7.1.4": 512,
	},
	dedupeSubtitles: false,
	keepBestAudioChannelsOnly: false,
	removeCommentaryAudio: false,
	audioLanguages: [],
	subtitleLanguages: [],
	removeDescriptiveAudio: false,
	removeKaraokeAudio: false,
	dropCompatibilityAudio: true,
	audioCodecPriority: "lossless-first",
	preferUncensoredAudio: true,
	dedupeAudio: true,
	audioLanguagePriority: ["jpn", "eng", "*"],
	renameAudioTracks: false,
	detectCommentaryAudio: true,
	detectDescriptiveAudio: true,
	detectKaraokeAudio: true,
	subtitleLangDetect: "enabled",
	subtitleLangDetectConfidence: 0.05,
	detectSignsSongs: true,
	detectSDH: true,
	detectHonorifics: true,
	signsSongsStyleRatio: 0.8,
	signsSongsLineRatio: 0.1,
	sdhRatioThreshold: 0.2,
	sdhMinLines: 10,
	honorificsMinCount: 5,
	honorificsRatio: 3,
	assumeMislabeledTracks: true,
	subtitleSourcePriority: "official-first",
	subtitleFansubTiebreak: "alphabetical",
	subtitleFormatPriority: "text-first",
	dropPictureSubtitles: false,
	dedupeAcrossFormat: true,
	renameSubtitleTracks: true,
	compressSubtitles: false,
	compressSubtitlesMinSavings: 10,
	removeSDHSubtitles: false,
	removeCommentarySubtitles: false,
	removeForcedSignsSongs: false,
	removeStoryboardSubtitles: false,
	removeHonorificsSubtitles: false,
	subtitleLanguagePriority: ["eng", "jpn", "*"],
	convertSrtToAss: false,
	restyleAssFont: false,
	removeUnusedFonts: false,
	assRestyleTargets: ["full", "honorifics", "forced", "sdh", "commentary"],
	vsFilters: [],
};

// Code -> long-form value maps (the inverse of Rabbit Encoder's *_TO_CODE maps)

const CODE_QUALITY: Record<string, string> = { l: "low", m: "medium", h: "high" };
const CODE_SPEED: Record<string, string> = { sr: "slower", s: "slow", m: "medium", f: "fast", fr: "faster" };
const CODE_LEVEL: Record<string, string> = { o: "off", l: "light", m: "medium", h: "heavy", a: "auto" };
const CODE_CROP: Record<string, string> = { o: "off", a: "auto" };
const CODE_AUDIO_CODEC: Record<string, string> = { l: "lossless-first", s: "smallest-first" };
const CODE_LANG_DETECT: Record<string, string> = { e: "enabled", u: "und-only", d: "disabled" };
const CODE_SUB_SOURCE: Record<string, string> = { o: "official-first", f: "fansub-first" };
const CODE_SUB_TIEBREAK: Record<string, string> = { a: "alphabetical", s: "source-order" };
const CODE_SUB_FORMAT: Record<string, string> = { t: "text-first", p: "picture-first" };

// Long-form value -> display label

const QUALITY: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };
const SPEED: Record<string, string> = { slower: "Slower", slow: "Slow", medium: "Medium", fast: "Fast", faster: "Faster" };
const LEVEL: Record<string, string> = { off: "Off", light: "Light", medium: "Medium", heavy: "Heavy", auto: "Auto" };
const VIDEO: Record<string, string> = { av1: "AV1", off: "Off (lossless FFV1)" };
const AUDIO: Record<string, string> = { opus: "Opus", copy: "Copy (passthrough)" };
const SUBS: Record<string, string> = { full: "Full processing", copy: "Copy (passthrough)" };
const ENCODER: Record<string, string> = {
	"svt-av1-essential": "SVT-AV1-Essential",
	"svt-av1-hdr": "SVT-AV1-HDR",
	"svt-av1-5fish": "SVT-AV1-5FISH",
};
const CROP: Record<string, string> = { off: "Off", auto: "Auto" };
const DENOISE_METRIC: Record<string, string> = { noise: "Noise", bitrate: "Bitrate" };
const AUDIO_CODEC: Record<string, string> = { "lossless-first": "Lossless first", "smallest-first": "Smallest first" };
const LANG_DETECT: Record<string, string> = { enabled: "Enabled", "und-only": "Only if language undefined", disabled: "Disabled" };
const SUB_SOURCE: Record<string, string> = { "official-first": "Official first", "fansub-first": "Fansub first" };
const SUB_TIEBREAK: Record<string, string> = { alphabetical: "Alphabetical", "source-order": "Source order" };
const SUB_FORMAT: Record<string, string> = { "text-first": "Text first", "picture-first": "Picture first" };
const TRACK_TYPE: Record<string, string> = {
	full: "Full",
	honorifics: "Honorifics",
	forced: "Forced / Signs & Songs",
	sdh: "SDH",
	commentary: "Commentary",
};

/** Encoders driven by Auto-Boost-Essential (Quality/Speed) rather than a fixed CRF/preset. */
const AUTO_BOOST_ENCODERS = new Set(["svt-av1-essential"]);

const LEVELS: Level[] = ["light", "medium", "heavy"];

const BITRATE_CHANNELS: { key: string; code: string; label: string }[] = [
	{ key: "mono", code: "mo", label: "Mono" },
	{ key: "stereo", code: "so", label: "Stereo" },
	{ key: "2.1", code: "c21", label: "2.1" },
	{ key: "3.0", code: "c30", label: "3.0" },
	{ key: "3.1", code: "c31", label: "3.1" },
	{ key: "4.0", code: "c40", label: "4.0" },
	{ key: "4.1", code: "c41", label: "4.1" },
	{ key: "5.0", code: "c50", label: "5.0" },
	{ key: "5.1", code: "c51", label: "5.1" },
	{ key: "6.0", code: "c60", label: "6.0" },
	{ key: "6.1", code: "c61", label: "6.1" },
	{ key: "7.0", code: "c70", label: "7.0" },
	{ key: "7.1", code: "c71", label: "7.1" },
	{ key: "7.1.4", code: "c714", label: "7.1.4" },
];

// Parsing

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

function numOr(v: string | undefined, fallback: number): number {
	if (v === undefined || v === "") return fallback;
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
}

/** Apply an overrides section onto `out`, field by field. */
type Applier = (out: Settings, kv: Record<string, string>) => void;

/** Map a short code to its long form. Unknown codes are kept as-is for display. */
function enumOr(map: Record<string, string>, code: string | undefined, fallback: string): string {
	if (!code) return fallback;
	return map[code] ?? code;
}

function boolOr(v: string | undefined, fallback: boolean): boolean {
	return v === undefined ? fallback : v === "1";
}

const applyCore: Applier = (out, kv) => {
	if (kv.en) out.encoder = unesc(kv.en);
	out.manualCrf = numOr(kv.cr, out.manualCrf);
	out.manualPreset = numOr(kv.pr, out.manualPreset);
	// The RE1 encoder escapes custom params twice, so unescape twice as well
	// (a no-op for singly-escaped values).
	if (kv.cp !== undefined) out.customEncoderParams = unesc(unesc(kv.cp));
	out.quality = enumOr(CODE_QUALITY, kv.q, out.quality);
	out.finalSpeed = enumOr(CODE_SPEED, kv.sp, out.finalSpeed);
	if (kv.v) out.videoEncode = kv.v;
	if (kv.a) out.audioEncode = kv.a;
	if (kv.su) out.subtitleProcessing = kv.su;
	out.crop = enumOr(CODE_CROP, kv.crp, out.crop);
	out.cropLimit = numOr(kv.cl, out.cropLimit);
	out.downscale = boolOr(kv.ds, out.downscale);
	out.skipBoosting = boolOr(kv.sb, out.skipBoosting);
	out.noPhaseInv = boolOr(kv.np, out.noPhaseInv);
	out.dedupeSubtitles = boolOr(kv.dd, out.dedupeSubtitles);
	out.keepBestAudioChannelsOnly = boolOr(kv.kc, out.keepBestAudioChannelsOnly);
	out.removeCommentaryAudio = boolOr(kv.rc, out.removeCommentaryAudio);
};

const applyDenoise: Applier = (out, kv) => {
	out.denoise = enumOr(CODE_LEVEL, kv.m, "off");
	if (out.denoise === "auto") {
		if (kv.mt) out.autoDenoiseMetric = kv.mt;
		for (const [lvl, t, tb, pfx] of [
			["light", "tl", "tbl", "l"],
			["medium", "tm", "tbm", "m"],
			["heavy", "th", "tbh", "h"],
		] as const) {
			out.autoDenoiseThresholds[lvl] = numOr(kv[t], out.autoDenoiseThresholds[lvl]);
			out.autoDenoiseBitrateThresholds[lvl] = numOr(kv[tb], out.autoDenoiseBitrateThresholds[lvl]);
			out.nlmeansParams[lvl] = readNlmeans(kv, pfx, out.nlmeansParams[lvl]);
		}
	} else if (isLevel(out.denoise)) {
		// Fixed level: only that level's triplet is stored, without a prefix.
		out.nlmeansParams[out.denoise] = readNlmeans(kv, "", out.nlmeansParams[out.denoise]);
	}
};

function readNlmeans(kv: Record<string, string>, prefix: string, fallback: NlmeansParams): NlmeansParams {
	return {
		s: numOr(kv[`${prefix}s`], fallback.s),
		p: numOr(kv[`${prefix}p`], fallback.p),
		r: numOr(kv[`${prefix}r`], fallback.r),
	};
}

const applyDeband: Applier = (out, kv) => {
	out.deband = enumOr(CODE_LEVEL, kv.m, "off");
	if (!isLevel(out.deband)) return;
	const base = out.gradfunParams[out.deband];
	out.gradfunParams[out.deband] = { strength: numOr(kv.st, base.strength), radius: numOr(kv.rd, base.radius) };
};

const applyBitrates: Applier = (out, kv) => {
	for (const { key, code } of BITRATE_CHANNELS) out.audioBitrates[key] = numOr(kv[code], out.audioBitrates[key]!);
};

const applySubtitleDetect: Applier = (out, kv) => {
	out.subtitleLangDetect = enumOr(CODE_LANG_DETECT, kv.ld, out.subtitleLangDetect);
	out.subtitleLangDetectConfidence = numOr(kv.lc, out.subtitleLangDetectConfidence);
	out.detectSignsSongs = boolOr(kv.ss, out.detectSignsSongs);
	out.detectSDH = boolOr(kv.sh, out.detectSDH);
	out.detectHonorifics = boolOr(kv.ho, out.detectHonorifics);
	out.signsSongsStyleRatio = numOr(kv.ssr, out.signsSongsStyleRatio);
	out.signsSongsLineRatio = numOr(kv.slr, out.signsSongsLineRatio);
	out.sdhRatioThreshold = numOr(kv.sdr, out.sdhRatioThreshold);
	out.sdhMinLines = numOr(kv.sdl, out.sdhMinLines);
	out.honorificsMinCount = numOr(kv.hmc, out.honorificsMinCount);
	out.honorificsRatio = numOr(kv.hr, out.honorificsRatio);
	out.assumeMislabeledTracks = boolOr(kv.am, out.assumeMislabeledTracks);
};

const applySubtitleManip: Applier = (out, kv) => {
	out.subtitleSourcePriority = enumOr(CODE_SUB_SOURCE, kv.sp, out.subtitleSourcePriority);
	out.subtitleFansubTiebreak = enumOr(CODE_SUB_TIEBREAK, kv.tb, out.subtitleFansubTiebreak);
	out.subtitleFormatPriority = enumOr(CODE_SUB_FORMAT, kv.fp, out.subtitleFormatPriority);
	out.dropPictureSubtitles = boolOr(kv.dp, out.dropPictureSubtitles);
	out.dedupeAcrossFormat = boolOr(kv.df, out.dedupeAcrossFormat);
	out.renameSubtitleTracks = boolOr(kv.rn, out.renameSubtitleTracks);
	out.compressSubtitles = boolOr(kv.cz, out.compressSubtitles);
	out.compressSubtitlesMinSavings = numOr(kv.zm, out.compressSubtitlesMinSavings);
	out.removeSDHSubtitles = boolOr(kv.rs, out.removeSDHSubtitles);
	out.removeCommentarySubtitles = boolOr(kv.rc, out.removeCommentarySubtitles);
	out.removeForcedSignsSongs = boolOr(kv.rf, out.removeForcedSignsSongs);
	out.removeStoryboardSubtitles = boolOr(kv.rb, out.removeStoryboardSubtitles);
	out.removeHonorificsSubtitles = boolOr(kv.rh, out.removeHonorificsSubtitles);
	if (kv.lp !== undefined) out.subtitleLanguagePriority = splitList(kv.lp);
};

const applySubtitleStyle: Applier = (out, kv) => {
	out.convertSrtToAss = boolOr(kv.cv, out.convertSrtToAss);
	out.restyleAssFont = boolOr(kv.ra, out.restyleAssFont);
	out.removeUnusedFonts = boolOr(kv.ru, out.removeUnusedFonts);
	if (kv.tg !== undefined) out.assRestyleTargets = splitList(kv.tg);
};

const applyAudioManip: Applier = (out, kv) => {
	out.removeDescriptiveAudio = boolOr(kv.rd, out.removeDescriptiveAudio);
	out.removeKaraokeAudio = boolOr(kv.rk, out.removeKaraokeAudio);
	out.dropCompatibilityAudio = boolOr(kv.dc, out.dropCompatibilityAudio);
	out.audioCodecPriority = enumOr(CODE_AUDIO_CODEC, kv.co, out.audioCodecPriority);
	out.preferUncensoredAudio = boolOr(kv.pu, out.preferUncensoredAudio);
	out.dedupeAudio = boolOr(kv.de, out.dedupeAudio);
	out.renameAudioTracks = boolOr(kv.rn, out.renameAudioTracks);
	out.detectCommentaryAudio = boolOr(kv.dco, out.detectCommentaryAudio);
	out.detectDescriptiveAudio = boolOr(kv.dde, out.detectDescriptiveAudio);
	out.detectKaraokeAudio = boolOr(kv.dka, out.detectKaraokeAudio);
	if (kv.lp !== undefined) out.audioLanguagePriority = splitList(kv.lp);
};

function isLevel(v: string): v is Level {
	return v === "light" || v === "medium" || v === "heavy";
}

/**
 * Decode a settings code into display-ready rows, or `null` when the input
 * is not a recognisable code (caller should then show the raw string).
 */
export function decodeRabbitSettings(code: string): DecodedSettings | null {
	const raw = (code ?? "").trim();
	const tokens = raw.split("|");
	const m = (tokens[0] ?? "").match(/^RE(\d+)$/);
	if (!m) return null;

	const version = parseInt(m[1]!, 10);
	const s: Settings = structuredClone(BASELINE);

	for (let i = 1; i < tokens.length; i++) {
		const sectionRaw = tokens[i]!;
		const t = sectionRaw.indexOf("~");
		if (t < 0) continue;
		const tag = sectionRaw.slice(0, t);
		const kv = parsePayload(sectionRaw.slice(t + 1));

		switch (tag) {
			case "c":
				applyCore(s, kv);
				break;
			case "dn":
				applyDenoise(s, kv);
				break;
			case "db":
				applyDeband(s, kv);
				break;
			case "ab":
				applyBitrates(s, kv);
				break;
			case "al":
				s.audioLanguages = splitList(kv.v);
				break;
			case "sl":
				s.subtitleLanguages = splitList(kv.v);
				break;
			case "sd":
				applySubtitleDetect(s, kv);
				break;
			case "sm":
				applySubtitleManip(s, kv);
				break;
			case "st":
				applySubtitleStyle(s, kv);
				break;
			case "am":
				applyAudioManip(s, kv);
				break;
			case "vs": {
				const id = kv.id ? unesc(kv.id) : "";
				const level = kv.lv ? unesc(kv.lv) : "";
				if (!id || !level) break;
				const params = Object.keys(kv)
					.filter((k) => k !== "id" && k !== "lv")
					.map((k): [string, string] => [k, unesc(kv[k]!)]);
				s.vsFilters.push({ id, level, params });
				break;
			}
			default:
				break; // unknown section: ignore for forward-compatibility
		}
	}

	const groups = buildGroups(s);
	const items = groups.flatMap((g) => g.rows).filter((r) => (r.changed || r.pinned) && !r.inactive);

	return { version, newerFormat: version > KNOWN_FORMAT, code: raw, groups, items };
}

// Display formatting

const pick = (map: Record<string, string>, v: string): string => map[v] ?? v;
const yesNo = (b: boolean): string => (b ? "Yes" : "No");
const num = (n: number): string => String(n);

let languageNames: Intl.DisplayNames | null | undefined;

function languageName(code: string): string {
	if (code === "*") return "everything else";
	if (languageNames === undefined) {
		try {
			languageNames = new Intl.DisplayNames(["en"], { type: "language" });
		} catch {
			languageNames = null;
		}
	}
	try {
		const name = languageNames?.of(code);
		return name && name.toLowerCase() !== code.toLowerCase() ? name : code;
	} catch {
		return code;
	}
}

const langList = (codes: string[], empty: string): string => (codes.length ? codes.map(languageName).join(", ") : empty);
const langPriority = (codes: string[]): string => (codes.length ? codes.map(languageName).join(" → ") : "Source order");
const nlmeans = (p: NlmeansParams): string => `strength ${p.s} · patch ${p.p} · research ${p.r}`;
const gradfun = (p: GradfunParams): string => `strength ${p.strength} · radius ${p.radius}`;
const thresholds = (t: Levels<number>, suffix = ""): string => LEVELS.map((l) => `${l} ${t[l]}${suffix}`).join(" · ");

// Grouped rows (with descriptions)

function buildGroups(s: Settings): SettingGroup[] {
	const b = BASELINE;
	const row = (label: string, value: string, defaultValue: string, description: string, extra: Partial<SettingRow> = {}): SettingRow => ({
		label,
		value,
		defaultValue,
		changed: value !== defaultValue,
		description,
		...extra,
	});

	const encoderName = pick(ENCODER, s.encoder);
	const videoOff = s.videoEncode === "off" ? "Video was not encoded to AV1 (Video encoding is off)." : undefined;
	const audioCopied = s.audioEncode === "copy" ? "Audio was copied from the source, not re-encoded to Opus." : undefined;
	const subsCopied = s.subtitleProcessing === "copy" ? "Subtitles were copied from the source untouched (Subtitle processing is Copy)." : undefined;
	const autoBoost = AUTO_BOOST_ENCODERS.has(s.encoder);
	const notAutoBoost = videoOff ?? (autoBoost ? undefined : `Only used by SVT-AV1-Essential. ${encoderName} encodes with a fixed CRF and preset instead.`);
	const notManual = videoOff ?? (autoBoost ? "SVT-AV1-Essential derives its CRF from Quality and its preset from Speed instead." : undefined);

	const denoiseAuto = s.denoise === "auto";
	const notDenoiseAuto = denoiseAuto ? undefined : "Only used when Denoise is set to Auto.";
	const nlmeansInactive = (l: Level): string | undefined =>
		denoiseAuto || s.denoise === l ? undefined : s.denoise === "off" ? "Denoise is off." : `Denoise used the ${pick(LEVEL, s.denoise)} level.`;
	const gradfunInactive = (l: Level): string | undefined =>
		s.deband === l ? undefined : s.deband === "off" ? "Deband is off." : `Deband used the ${pick(LEVEL, s.deband)} level.`;

	const pipeline: SettingGroup = {
		title: "Pipeline",
		rows: [
			row(
				"Video encoding",
				pick(VIDEO, s.videoEncode),
				pick(VIDEO, b.videoEncode),
				'What happens to the video stream. AV1 encodes the (filtered) video with the selected SVT-AV1 encoder. Off skips the AV1 encode and keeps the lossless FFV1 video produced by the prepare/filter pass. The "Prepare" pipeline uses this so the AV1 encode can happen later on another machine.',
			),
			row(
				"Audio encoding",
				pick(AUDIO, s.audioEncode),
				pick(AUDIO, b.audioEncode),
				"Opus re-encodes every kept audio track to Opus, using the bitrate configured for the track's channel layout. Copy passes the source audio through as-is (no re-encode, no quality loss, but no size savings either).",
			),
			row(
				"Subtitle processing",
				pick(SUBS, s.subtitleProcessing),
				pick(SUBS, b.subtitleProcessing),
				"Full runs the whole subtitle pipeline: language and type detection (SDH, Signs & Songs, honorifics and more), filtering, deduplication, ordering, renaming and optional restyling. Copy muxes the source subtitles through exactly as they were, so every subtitle setting is ignored.",
			),
		],
	};

	const video: SettingGroup = {
		title: "Video",
		rows: [
			row(
				"Encoder",
				encoderName,
				pick(ENCODER, b.encoder),
				"Which SVT-AV1 build encoded the video. SVT-AV1-Essential runs through Auto-Boost-Essential, which tunes the CRF per scene automatically from the Quality setting, which makes it the easiest choice. SVT-AV1-HDR (recommended for live action) and SVT-AV1-5FISH (recommended for anime and animation) encode the whole file with one fixed CRF and preset.",
				{ inactive: videoOff },
			),
			row(
				"Quality",
				pick(QUALITY, s.quality),
				pick(QUALITY, b.quality),
				"Target visual quality. It sets the base CRF: Low = 35, Medium = 30, High = 25 (each +5 for sources larger than 1080p). Auto-Boost-Essential then lowers the CRF (spending more bits) on scenes that a fast test encode showed to be weaker than average, so quality stays consistent across the whole file. Higher quality means a bigger file.",
				{ inactive: notAutoBoost, pinned: true },
			),
			row(
				"Speed",
				pick(SPEED, s.finalSpeed),
				pick(SPEED, b.finalSpeed),
				"Encoder speed preset for the final encode (Slower, Slow, Medium, Fast, Faster). Slower presets let SVT-AV1 search harder for efficient ways to compress each frame, giving better quality per bit (a smaller file at the same quality) at the cost of much longer encode times. Faster presets finish sooner but compress less efficiently. Speed doesn't change the target quality, only how efficiently it is reached.",
				{ inactive: notAutoBoost, pinned: true },
			),
			row(
				"Scene boosting",
				s.skipBoosting ? "Skipped" : "On",
				b.skipBoosting ? "Skipped" : "On",
				"Auto-Boost-Essential normally runs a fast test encode, measures the quality of every scene and writes per-scene CRF zones so difficult scenes get extra bits. Skipping boosting goes straight to a single final encode at the base CRF: much faster, but quality can dip in demanding scenes.",
				{ inactive: notAutoBoost },
			),
			row(
				"CRF",
				num(s.manualCrf),
				num(b.manualCrf),
				"Constant Rate Factor (1-70) for SVT-AV1-HDR and SVT-AV1-5FISH, applied to the whole file. Lower values mean higher quality and bigger files, while higher values mean smaller files with more visible compression.",
				{ inactive: notManual, pinned: true },
			),
			row(
				"Preset",
				num(s.manualPreset),
				num(b.manualPreset),
				"SVT-AV1 preset (-1 to 13) for SVT-AV1-HDR and SVT-AV1-5FISH. Lower presets are slower but compress more efficiently (better quality per bit), while higher presets are faster but less efficient.",
				{ inactive: notManual, pinned: true },
			),
			row(
				"Custom encoder parameters",
				s.customEncoderParams || "None",
				b.customEncoderParams || "None",
				"Raw command-line flags appended verbatim to the SVT-AV1 command (for example --film-grain or --tune). They can extend or override the parameters Rabbit Encoder sets itself. With SVT-AV1-Essential they only apply to the final encode, not the test encode.",
				{ mono: !!s.customEncoderParams, inactive: videoOff },
			),
			row(
				"Downscale 4K to 1080p",
				yesNo(s.downscale),
				yesNo(b.downscale),
				"When enabled, sources taller than 1080 pixels are scaled down to 1080p before encoding. This saves a lot of space and encode time at the cost of fine detail on 4K sources. Sources at 1080p or below are not touched.",
			),
			row(
				"Crop black bars",
				pick(CROP, s.crop),
				pick(CROP, b.crop),
				"Auto detects letterbox / pillarbox black bars with FFmpeg's cropdetect over several sample windows and crops them off, so no bits are wasted on black borders. Off keeps the full frame.",
			),
			row(
				"Crop limit",
				num(s.cropLimit),
				num(b.cropLimit),
				"Black-level threshold (0-1) for crop detection: anything darker than this counts as black bar. Higher values crop more aggressively and can eat into very dark scenes, while lower values only remove true black.",
				{ inactive: s.crop === "off" ? "Crop is off." : undefined },
			),
		],
	};

	const filterRows: SettingRow[] = [
		row(
			"Denoise",
			pick(LEVEL, s.denoise),
			pick(LEVEL, b.denoise),
			"Removes grain and noise with NLMeans before encoding. Noise is very expensive to encode, so denoising can shrink the file a lot, but too much of it smooths away fine detail and intentional film grain. Light, Medium and Heavy apply one strength to the whole file, while Auto analyses every scene and picks a level (or none) per scene.",
		),
		row(
			"Auto-denoise metric",
			pick(DENOISE_METRIC, s.autoDenoiseMetric),
			pick(DENOISE_METRIC, b.autoDenoiseMetric),
			"What Auto denoise uses to judge each scene. Noise reads a bit-plane noise measurement. It works well for classic sensor and film grain, but it can under-score structured textures. Bitrate compares each scene's source bitrate to the file's own median, directly targeting scenes that cost a lot of bits, without knowing whether that comes from grain or from legitimate motion and detail.",
			{ inactive: notDenoiseAuto },
		),
		row(
			"Auto-denoise thresholds (noise)",
			thresholds(s.autoDenoiseThresholds),
			thresholds(b.autoDenoiseThresholds),
			"Noise-score cut-offs (0-1) used by Auto denoise with the Noise metric. A scene whose noise score reaches a level's threshold is denoised at that level, and scenes below the light threshold are left alone. Lower thresholds denoise more of the file.",
			{ inactive: notDenoiseAuto ?? (s.autoDenoiseMetric === "bitrate" ? "The Bitrate metric was used." : undefined) },
		),
		row(
			"Auto-denoise thresholds (bitrate)",
			thresholds(s.autoDenoiseBitrateThresholds, "x"),
			thresholds(b.autoDenoiseBitrateThresholds, "x"),
			"Cut-offs used by Auto denoise with the Bitrate metric, as multiples of the file's median bitrate. A scene whose bitrate is at least that many times the median is denoised at that level. Lower values denoise more of the file.",
			{ inactive: notDenoiseAuto ?? (s.autoDenoiseMetric !== "bitrate" ? "The Noise metric was used." : undefined) },
		),
		...LEVELS.map((l) =>
			row(
				`NLMeans (${LEVEL[l]})`,
				nlmeans(s.nlmeansParams[l]),
				nlmeans(b.nlmeansParams[l]),
				`Denoise filter parameters for the ${l} level. Strength (1-30) is how much noise is removed. Patch (odd) is the size of the blocks being compared, and research (odd) is how far around each pixel similar blocks are searched. Larger values denoise harder but take longer.`,
				{ inactive: nlmeansInactive(l) },
			),
		),
		row(
			"Deband",
			pick(LEVEL, s.deband),
			pick(LEVEL, b.deband),
			"Smooths colour banding (visible steps in gradients such as skies, fog or dark scenes) with FFmpeg's gradfun filter before encoding. Stronger levels hide more banding but can soften subtle detail.",
		),
		...LEVELS.map((l) =>
			row(
				`Gradfun (${LEVEL[l]})`,
				gradfun(s.gradfunParams[l]),
				gradfun(b.gradfunParams[l]),
				`Deband filter parameters for the ${l} level. Strength (0.51-64) is the maximum change applied to a pixel, and radius (8-32) is the neighbourhood size used to detect gradients.`,
				{ inactive: gradfunInactive(l) },
			),
		),
	];

	const vsDescription =
		"Extra VapourSynth filter presets, each run as its own pass before the FFmpeg filters (for example specialised denoisers or line darkeners). They are CPU-bound and can add a lot of processing time. Shown in the order they ran, with the chosen level and any parameters changed from the preset's defaults.";
	if (s.vsFilters.length === 0) {
		filterRows.push(row("VapourSynth filters", "None", "None", vsDescription));
	} else {
		s.vsFilters.forEach((f, i) => {
			const params = f.params.map(([k, v]) => `${k}=${v}`).join(", ");
			const level = pick(LEVEL, f.level);
			const label = s.vsFilters.length > 1 ? `VapourSynth filter ${i + 1} (${f.id})` : `VapourSynth filter (${f.id})`;
			filterRows.push(row(label, params ? `${level} · ${params}` : level, "None", vsDescription));
		});
	}

	const filters: SettingGroup = { title: "Denoise & deband", rows: filterRows };

	const audio: SettingGroup = {
		title: "Audio",
		rows: [
			row(
				"Audio languages",
				langList(s.audioLanguages, "All"),
				langList(b.audioLanguages, "All"),
				"Only audio tracks in these languages are kept and every other language is removed. All keeps every track regardless of language.",
			),
			row(
				"Audio language priority",
				langPriority(s.audioLanguagePriority),
				langPriority(b.audioLanguagePriority),
				'Order in which audio tracks are arranged in the output, by language. "Everything else" stands for all remaining languages, in alphabetical order.',
			),
			row(
				"Keep only highest channel layout",
				yesNo(s.keepBestAudioChannelsOnly),
				yesNo(b.keepBestAudioChannelsOnly),
				"For each language, keep only the track with the most channels. For example, the 5.1 track is kept and the stereo track of the same language is dropped.",
			),
			row(
				"Deduplicate audio tracks",
				yesNo(s.dedupeAudio),
				yesNo(b.dedupeAudio),
				"Keep only one audio track per language and type, picking the winner with the codec priority and uncensored preference. When off, every selected track is kept.",
			),
			row(
				"Codec priority",
				pick(AUDIO_CODEC, s.audioCodecPriority),
				pick(AUDIO_CODEC, b.audioCodecPriority),
				"Which track wins when duplicates are removed. Lossless first keeps the lossless / highest-bitrate source, which gives the best starting point for the Opus encode. Smallest first keeps the smallest track.",
				{ inactive: s.dedupeAudio ? undefined : "Audio deduplication is off." },
			),
			row(
				"Prefer uncensored tracks",
				yesNo(s.preferUncensoredAudio),
				yesNo(b.preferUncensoredAudio),
				"When deduplicating and sorting, prefer tracks marked as uncensored over censored versions of the same audio.",
			),
			row(
				"Remove commentary",
				yesNo(s.removeCommentaryAudio),
				yesNo(b.removeCommentaryAudio),
				"Drop audio tracks identified as commentary (director, cast or staff commentary).",
			),
			row(
				"Remove audio description",
				yesNo(s.removeDescriptiveAudio),
				yesNo(b.removeDescriptiveAudio),
				"Drop audio-description tracks, which narrate the on-screen action for blind and visually-impaired viewers.",
			),
			row(
				"Remove karaoke / off-vocal",
				yesNo(s.removeKaraokeAudio),
				yesNo(b.removeKaraokeAudio),
				"Drop karaoke, off-vocal and instrumental-only tracks (common extras on music and anime releases).",
			),
			row(
				"Drop compatibility downmixes",
				yesNo(s.dropCompatibilityAudio),
				yesNo(b.dropCompatibilityAudio),
				'Drop extra "compatibility" tracks. These are typically a lower-quality stereo or AC-3 downmix shipped next to a better main track in the same language.',
			),
			row(
				"Detect commentary",
				yesNo(s.detectCommentaryAudio),
				yesNo(b.detectCommentaryAudio),
				"Classify audio tracks as commentary from their titles. Needed for commentary tracks to be recognised, removed or named correctly.",
			),
			row(
				"Detect audio description",
				yesNo(s.detectDescriptiveAudio),
				yesNo(b.detectDescriptiveAudio),
				"Classify audio tracks as audio description (for visually-impaired viewers) from their titles.",
			),
			row(
				"Detect karaoke",
				yesNo(s.detectKaraokeAudio),
				yesNo(b.detectKaraokeAudio),
				"Classify audio tracks as karaoke / off-vocal / instrumental from their titles.",
			),
			row(
				"Rename audio tracks",
				yesNo(s.renameAudioTracks),
				yesNo(b.renameAudioTracks),
				"Rewrite audio track titles into Rabbit Encoder's clean, consistent naming format. When off, track titles are left empty so players show their own language / codec labels.",
			),
			row(
				"Disable phase inversion",
				yesNo(s.noPhaseInv),
				yesNo(b.noPhaseInv),
				"Passes --no-phase-inv to the Opus encoder. Opus normally uses phase inversion to improve stereo imaging. Disabling it avoids artefacts when the audio is later downmixed to mono (some TVs, phones and smart speakers), at a very small cost in stereo quality.",
				{ inactive: audioCopied },
			),
			...BITRATE_CHANNELS.map(({ key, label }) =>
				row(
					`Opus bitrate (${label})`,
					`${s.audioBitrates[key]} kbps`,
					`${b.audioBitrates[key]} kbps`,
					`Target Opus bitrate for audio tracks with a ${label} channel layout. Each track is encoded at the bitrate matching its own layout, so only the layouts present in the source matter.`,
					{ inactive: audioCopied },
				),
			),
		],
	};

	const subtitles: SettingGroup = {
		title: "Subtitles",
		rows: [
			row(
				"Subtitle languages",
				langList(s.subtitleLanguages, "All"),
				langList(b.subtitleLanguages, "All"),
				"Only subtitle tracks in these languages are kept and every other language is removed. All keeps every track regardless of language.",
			),
			row(
				"Subtitle language priority",
				langPriority(s.subtitleLanguagePriority),
				langPriority(b.subtitleLanguagePriority),
				'Order in which subtitle tracks are arranged in the output, by language. "Everything else" stands for all remaining languages, in alphabetical order.',
			),
			row(
				"Source priority",
				pick(SUB_SOURCE, s.subtitleSourcePriority),
				pick(SUB_SOURCE, b.subtitleSourcePriority),
				"Whether official subtitles (Blu-ray, streaming) or fansubs come first. Decides the track order and which track wins when duplicates are removed.",
			),
			row(
				"Fansub order",
				pick(SUB_TIEBREAK, s.subtitleFansubTiebreak),
				pick(SUB_TIEBREAK, b.subtitleFansubTiebreak),
				"How several fansub tracks are ordered among themselves: alphabetically by group name, or in the order they appear in the source file.",
			),
			row(
				"Format priority",
				pick(SUB_FORMAT, s.subtitleFormatPriority),
				pick(SUB_FORMAT, b.subtitleFormatPriority),
				"Whether text subtitles (SRT/ASS) or picture subtitles (PGS/VOBSUB) are preferred when ordering and deduplicating. Text subtitles are tiny, stay sharp at any resolution and can be restyled, while picture subtitles are images of text.",
			),
			row(
				"Drop picture-based subtitles",
				yesNo(s.dropPictureSubtitles),
				yesNo(b.dropPictureSubtitles),
				"Remove every picture-based subtitle track (PGS/VOBSUB), keeping only text subtitles.",
			),
			row(
				"Keep one subtitle per language and type",
				yesNo(s.dedupeSubtitles),
				yesNo(b.dedupeSubtitles),
				"Remove duplicate subtitle tracks so only one remains per language and type (full, SDH, Signs & Songs, honorifics and so on). The track that is kept is chosen with the source and format priority.",
			),
			row(
				"Dedupe across formats",
				yesNo(s.dedupeAcrossFormat),
				yesNo(b.dedupeAcrossFormat),
				"When deduplicating, treat text and picture tracks as duplicates of each other, so only one track per language and type is kept. When off, one text and one picture track of the same kind can both stay.",
				{ inactive: s.dedupeSubtitles ? undefined : "Subtitle deduplication is off." },
			),
			row(
				"Remove SDH",
				yesNo(s.removeSDHSubtitles),
				yesNo(b.removeSDHSubtitles),
				"Drop SDH tracks (subtitles for the deaf and hard of hearing, which include sound cues like [door creaks] and speaker names).",
			),
			row(
				"Remove commentary",
				yesNo(s.removeCommentarySubtitles),
				yesNo(b.removeCommentarySubtitles),
				"Drop subtitle tracks that transcribe a commentary track.",
			),
			row(
				"Remove forced / Signs & Songs",
				yesNo(s.removeForcedSignsSongs),
				yesNo(b.removeForcedSignsSongs),
				"Drop forced and Signs & Songs tracks. These only translate on-screen text and song lyrics, not the dialogue.",
			),
			row(
				"Remove storyboards",
				yesNo(s.removeStoryboardSubtitles),
				yesNo(b.removeStoryboardSubtitles),
				"Drop storyboard subtitle tracks (text tracks meant for storyboard / picture-in-picture extras rather than the main video).",
			),
			row(
				"Remove honorifics",
				yesNo(s.removeHonorificsSubtitles),
				yesNo(b.removeHonorificsSubtitles),
				"Drop honorifics tracks (English subtitles that keep Japanese honorifics such as -san, -kun or -senpai) and keep the regular dialogue track.",
			),
			row(
				"Compress subtitles",
				yesNo(s.compressSubtitles),
				yesNo(b.compressSubtitles),
				"Store subtitle tracks zlib-compressed inside the MKV to save space. Some hardware players and TVs don't support compressed subtitle tracks.",
			),
			row(
				"Min. savings to compress",
				`${s.compressSubtitlesMinSavings}%`,
				`${b.compressSubtitlesMinSavings}%`,
				"Only compress a track when zlib makes it at least this much smaller (0% = compress whenever it doesn't grow).",
				{ inactive: s.compressSubtitles ? undefined : "Subtitle compression is off." },
			),
			row(
				"Rename subtitle tracks",
				yesNo(s.renameSubtitleTracks),
				yesNo(b.renameSubtitleTracks),
				"Rewrite subtitle track titles into a clean, consistent naming format. When off, the original track titles are kept.",
			),
		],
	};

	const detection: SettingGroup = {
		title: "Subtitle detection",
		rows: [
			row(
				"Language detector",
				pick(LANG_DETECT, s.subtitleLangDetect),
				pick(LANG_DETECT, b.subtitleLangDetect),
				'Detects each subtitle track\'s real language from its text and fixes wrong or missing language tags. "Only if language undefined" only touches tracks tagged as undetermined (und).',
			),
			row(
				"Detector confidence",
				num(s.subtitleLangDetectConfidence),
				num(b.subtitleLangDetectConfidence),
				"Minimum confidence (0-1) the language detector needs before it relabels a track. Higher values mean fewer, safer corrections.",
				{ inactive: s.subtitleLangDetect === "disabled" ? "The language detector is disabled." : undefined },
			),
			row(
				"Assume mislabeled JP tracks are English",
				yesNo(s.assumeMislabeledTracks),
				yesNo(b.assumeMislabeledTracks),
				"When no English full track is found, assume a track tagged Japanese (or a picture-based fallback) is really English and relabel it. Common with releases that tag English subtitles with the audio language.",
			),
			row(
				"Detect Signs & Songs",
				yesNo(s.detectSignsSongs),
				yesNo(b.detectSignsSongs),
				"Reclassify tracks labelled as full subtitles that are really Signs & Songs, meaning tracks with very little dialogue or made up mostly of sign-styled ASS lines.",
			),
			row(
				"Signs & Songs style ratio",
				num(s.signsSongsStyleRatio),
				num(b.signsSongsStyleRatio),
				"Share of a track's lines (0-1) that must use sign/song-looking ASS styles for it to be reclassified as Signs & Songs.",
				{ inactive: s.detectSignsSongs ? undefined : "Signs & Songs detection is off." },
			),
			row(
				"Signs & Songs line ratio",
				num(s.signsSongsLineRatio),
				num(b.signsSongsLineRatio),
				"A full track with fewer lines than this share (0-1) of the largest full track is reclassified as Signs & Songs.",
				{ inactive: s.detectSignsSongs ? undefined : "Signs & Songs detection is off." },
			),
			row(
				"Detect SDH",
				yesNo(s.detectSDH),
				yesNo(b.detectSDH),
				"Reclassify tracks as SDH when they are full of SDH markers, such as sound cues like [door creaks] or (laughs) and speaker labels.",
			),
			row(
				"SDH marker ratio",
				num(s.sdhRatioThreshold),
				num(b.sdhRatioThreshold),
				"Share of lines (0-1) that must contain SDH markers for a track to be classified as SDH.",
				{ inactive: s.detectSDH ? undefined : "SDH detection is off." },
			),
			row(
				"SDH min. lines",
				num(s.sdhMinLines),
				num(b.sdhMinLines),
				"Minimum number of dialogue lines a track needs before SDH detection is applied, so tiny tracks aren't misclassified.",
				{ inactive: s.detectSDH ? undefined : "SDH detection is off." },
			),
			row(
				"Detect honorifics",
				yesNo(s.detectHonorifics),
				yesNo(b.detectHonorifics),
				"Mark the English full track that uses the most Japanese honorifics (-san, -kun, -chan and so on) as the Honorifics variant, so it can be named, ordered or removed separately.",
			),
			row(
				"Honorifics min. count",
				num(s.honorificsMinCount),
				num(b.honorificsMinCount),
				"Minimum number of honorific suffixes a track must contain before it can be flagged as Honorifics.",
				{ inactive: s.detectHonorifics ? undefined : "Honorifics detection is off." },
			),
			row(
				"Honorifics ratio",
				`${s.honorificsRatio}x`,
				`${b.honorificsRatio}x`,
				"A track must contain at least this many times more honorifics than the leanest English track to be flagged as Honorifics.",
				{ inactive: s.detectHonorifics ? undefined : "Honorifics detection is off." },
			),
		],
	};

	const styling: SettingGroup = {
		title: "Subtitle styling & fonts",
		rows: [
			row(
				"Convert SRT to ASS",
				yesNo(s.convertSrtToAss),
				yesNo(b.convertSrtToAss),
				"Convert every SRT track to ASS, styled with Rabbit Encoder's subtitle style (font, size, outline, shadow, margins), so plain subtitles look consistent and clean in every player.",
			),
			row(
				"Replace dialogue font in ASS",
				yesNo(s.restyleAssFont),
				yesNo(b.restyleAssFont),
				"Replace the font of the dialogue style in existing ASS tracks with Rabbit Encoder's configured subtitle font. Signs and typesetting keep their original fonts.",
			),
			row(
				"Restyle applies to",
				s.assRestyleTargets.length ? s.assRestyleTargets.map((t) => pick(TRACK_TYPE, t)).join(", ") : "None",
				b.assRestyleTargets.map((t) => pick(TRACK_TYPE, t)).join(", "),
				"Which detected track types the dialogue-font replacement is applied to.",
				{ inactive: s.restyleAssFont ? undefined : "Dialogue-font replacement is off." },
			),
			row(
				"Remove unused fonts",
				yesNo(s.removeUnusedFonts),
				yesNo(b.removeUnusedFonts),
				"Drop font attachments that none of the remaining ASS subtitles use. Font collections can add many megabytes to a file.",
			),
		],
	};

	// The whole subtitle pipeline is skipped when subtitles are copied.
	if (subsCopied) {
		for (const g of [subtitles, detection, styling]) for (const r of g.rows) r.inactive ??= subsCopied;
	}

	return [pipeline, video, filters, audio, subtitles, detection, styling];
}
