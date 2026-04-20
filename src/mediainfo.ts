export interface MediaInfoField {
	key: string;
	value: string;
}

export interface MediaInfoSection {
	type: string; // "General", "Video", "Audio", "Text", "Menu", "Attachments"
	fields: MediaInfoField[];
}

export interface ParsedMediaInfo {
	general?: MediaInfoSection;
	video: MediaInfoSection[];
	audio: MediaInfoSection[];
	text: MediaInfoSection[]; // subtitles
	menu: MediaInfoSection[];
	other: MediaInfoSection[];
	raw: string;
}

/**
 * Parse MediaInfo "Text" output into structured sections.
 *
 * MediaInfo format:
 *   Section Name
 *   Key                     : Value
 *   Key                     : Value
 *
 *   Next Section
 *   Key                     : Value
 *
 * Sections are separated by blank lines. Each field is
 * `{key}{padding}: {value}`.
 */
export function parseMediaInfo(raw: string): ParsedMediaInfo {
	const result: ParsedMediaInfo = {
		video: [],
		audio: [],
		text: [],
		menu: [],
		other: [],
		raw,
	};

	// Normalize line endings, split into blocks on blank lines
	const blocks = raw
		.replace(/\r\n/g, "\n")
		.split(/\n\s*\n/)
		.map((b) => b.trim())
		.filter(Boolean);

	for (const block of blocks) {
		const lines = block.split("\n");
		if (lines.length === 0) continue;

		const type = lines[0]!.trim();
		const fields: MediaInfoField[] = [];

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i]!;
			// Match "Key<spaces>: Value" - MediaInfo pads the key with spaces
			const m = line.match(/^(.+?)\s{2,}:\s(.*)$/);
			if (m) {
				fields.push({ key: m[1]!.trim(), value: m[2]!.trim() });
			} else if (/^\d{2}:\d{2}:\d{2}/.test(line.trim())) {
				// Menu chapter line, e.g. "00:00:00.000      : en:Prologue"
				const mm = line.match(/^(.+?)\s{2,}:\s(.*)$/);
				if (mm) fields.push({ key: mm[1]!.trim(), value: mm[2]!.trim() });
			}
		}

		const section: MediaInfoSection = { type, fields };
		const lower = type.toLowerCase();

		if (lower.startsWith("general")) result.general = section;
		else if (lower.startsWith("video")) result.video.push(section);
		else if (lower.startsWith("audio")) result.audio.push(section);
		else if (lower.startsWith("text")) result.text.push(section);
		else if (lower.startsWith("menu")) result.menu.push(section);
		else result.other.push(section);
	}

	return result;
}

/** Look up a field by key, case-insensitive. */
export function getField(section: MediaInfoSection | undefined, key: string): string | undefined {
	if (!section) return undefined;
	const lower = key.toLowerCase();
	return section.fields.find((f) => f.key.toLowerCase() === lower)?.value;
}

/** Get the first non-empty field matching any of the provided keys. */
export function getFirstField(section: MediaInfoSection | undefined, keys: string[]): string | undefined {
	if (!section) return undefined;
	for (const key of keys) {
		const value = getField(section, key);
		if (value) return value;
	}
	return undefined;
}

/**
 * Pretty-format common MediaInfo values for display.
 * Returns the original string when no rule matches.
 */
export function formatValue(key: string, value: string): string {
	const k = key.toLowerCase();

	// Bitrate: "1 353 kb/s" -> leave alone, MediaInfo already formats nicely
	// File size: already formatted
	// Duration: already formatted

	if (k === "channel(s)" || k === "channels") {
		const n = parseInt(value, 10);
		if (Number.isFinite(n)) {
			if (n === 1) return "Mono";
			if (n === 2) return "Stereo";
			if (n === 6) return "5.1";
			if (n === 8) return "7.1";
			return `${n} channels`;
		}
	}

	return value;
}

/** Short human-readable summary of the video track for card display. */
export function videoSummary(video: MediaInfoSection | undefined): string {
	if (!video) return "";
	const parts: string[] = [];
	const format = getField(video, "Format");
	if (format) parts.push(format);
	const w = getField(video, "Width")?.replace(/\D/g, "");
	const h = getField(video, "Height")?.replace(/\D/g, "");
	if (w && h) parts.push(`${w}×${h}`);
	const bitDepth = getField(video, "Bit depth");
	if (bitDepth) parts.push(bitDepth);
	return parts.join(" · ");
}

/** Short human-readable audio summary. */
export function audioSummary(audio: MediaInfoSection[]): string {
	if (audio.length === 0) return "";
	const parts: string[] = [];
	for (const track of audio) {
		const format = getField(track, "Format") ?? "";
		const ch = getField(track, "Channel(s)");
		const lang = getField(track, "Language");
		let label = format;
		if (ch) {
			const n = parseInt(ch, 10);
			if (n === 2) label += " 2.0";
			else if (n === 6) label += " 5.1";
			else if (n === 8) label += " 7.1";
			else if (n === 1) label += " 1.0";
		}
		if (lang) label += ` (${lang})`;
		parts.push(label.trim());
	}
	return parts.join(", ");
}
