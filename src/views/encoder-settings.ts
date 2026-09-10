/**
 * Rabbit Encoder settings: summary card for the release page, plus a modal
 * listing every setting (defaults included) with an explanation of each.
 */

import type { DecodedSettings, SettingRow } from "../rabbit-settings.ts";
import { el, toast } from "../utils.ts";

/** Group a raw CLI string into "flag value" chips, e.g.
 *  "--film-grain 4 --tune 2" → ["--film-grain 4", "--tune 2"]. */
function splitFlags(raw: string): string[] {
	const chips: string[] = [];
	for (const tok of raw.split(/\s+/).filter(Boolean)) {
		const prev = chips[chips.length - 1];
		if (tok.startsWith("-")) {
			chips.push(tok);
		} else if (prev && prev.startsWith("-") && !prev.includes(" ")) {
			chips[chips.length - 1] = `${prev} ${tok}`;
		} else {
			chips.push(tok);
		}
	}
	return chips.length ? chips : [raw];
}

function valueNode(row: SettingRow, className: string): HTMLElement {
	if (!row.mono) return el("span", { className, text: row.value });
	return el("span", {
		className: `${className} settings-flags`,
		children: splitFlags(row.value).map((flag) => el("code", { className: "settings-flag", text: flag })),
	});
}

export function buildSettingsCard(decoded: DecodedSettings): HTMLElement {
	const rows: HTMLElement[] = [];

	const row = (label: string, value: string): HTMLElement =>
		el("div", {
			className: "info-row",
			children: [el("span", { className: "label", text: label }), el("span", { className: "value", text: value })],
		});

	if (decoded.newerFormat) rows.push(row("Format", `RE${decoded.version} (shown best-effort)`));

	if (decoded.items.length === 0) {
		rows.push(row("Settings", "All defaults"));
	} else {
		for (const item of decoded.items) {
			const label = el("span", {
				className: "label",
				attrs: { title: item.description },
				children: [item.label, item.changed ? null : el("span", { className: "rs-default-tag", text: "default" })],
			});
			rows.push(el("div", { className: item.mono ? "info-row settings-flag-row" : "info-row", children: [label, valueNode(item, "value")] }));
		}
	}

	const openBtn = el("button", {
		className: "rs-card-open",
		attrs: { type: "button", "aria-haspopup": "dialog", title: "Show every Rabbit Encoder setting, with explanations" },
		children: [el("span", { text: "⚙️ Rabbit Encoder Settings" }), el("span", { className: "rs-card-more", text: "All settings ›" })],
	});
	openBtn.addEventListener("click", () => openSettingsModal(decoded));

	return el("div", {
		className: "info-card",
		children: [el("h3", { children: [openBtn] }), ...rows],
	});
}

export function openSettingsModal(decoded: DecodedSettings): void {
	const allRows = decoded.groups.flatMap((g) => g.rows);
	const changedCount = allRows.filter((r) => r.changed).length;

	// One shared tooltip, positioned next to whichever setting name is active.
	const tip = el("div", { className: "rs-tip", attrs: { role: "tooltip", id: "rs-tip" } });
	tip.hidden = true;
	let tipOwner: HTMLElement | null = null;
	let tipPinned = false;

	function showTip(term: HTMLElement, row: SettingRow): void {
		tipOwner = term;
		tip.replaceChildren(
			el("div", { className: "rs-tip-title", text: row.label }),
			el("p", { text: row.description }),
			el("div", { className: "rs-tip-meta", text: `Default: ${row.defaultValue}` }),
		);
		if (row.inactive) tip.appendChild(el("div", { className: "rs-tip-note", text: `Not used in this encode: ${row.inactive}` }));
		tip.hidden = false;

		const r = term.getBoundingClientRect();
		const margin = 8;
		const left = Math.min(Math.max(margin, r.left), window.innerWidth - tip.offsetWidth - margin);
		let top = r.bottom + 6;
		if (top + tip.offsetHeight > window.innerHeight - margin) top = Math.max(margin, r.top - tip.offsetHeight - 6);
		tip.style.left = `${left}px`;
		tip.style.top = `${top}px`;
	}

	function hideTip(): void {
		tip.hidden = true;
		tipOwner = null;
		tipPinned = false;
	}

	function settingRow(row: SettingRow): HTMLElement {
		// Hover or keyboard focus previews the description, and a click (or tap) pins it.
		const term = el("button", { className: "rs-term", attrs: { type: "button", "aria-describedby": "rs-tip" }, text: row.label });
		term.addEventListener("mouseenter", () => showTip(term, row));
		term.addEventListener("mouseleave", () => {
			if (!tipPinned) hideTip();
		});
		term.addEventListener("focus", () => showTip(term, row));
		term.addEventListener("blur", hideTip);
		term.addEventListener("click", () => {
			if (tipPinned && tipOwner === term) {
				hideTip();
			} else {
				showTip(term, row);
				tipPinned = true;
			}
		});

		const classes = ["rs-row"];
		if (row.changed) classes.push("changed");
		if (row.inactive) classes.push("inactive");

		return el("div", {
			className: classes.join(" "),
			children: [
				el("div", {
					className: "rs-name",
					children: [term, row.inactive ? el("span", { className: "rs-tag", attrs: { title: row.inactive }, text: "not used" }) : null],
				}),
				el("div", {
					className: "rs-val",
					children: [valueNode(row, "rs-val-text"), row.changed ? el("span", { className: "rs-val-default", text: `default: ${row.defaultValue}` }) : null],
				}),
			],
		});
	}

	const groups = decoded.groups.map((g) => {
		const changed = g.rows.filter((r) => r.changed).length;
		return el("section", {
			className: changed ? "rs-group" : "rs-group no-changes",
			children: [
				el("h3", {
					className: "rs-group-title",
					children: [g.title, changed ? el("span", { className: "rs-group-count", text: `${changed} changed` }) : null],
				}),
				el("div", { className: "rs-rows", children: g.rows.map(settingRow) }),
			],
		});
	});

	// Header

	const closeBtn = el("button", { className: "rs-close", attrs: { type: "button", "aria-label": "Close" }, text: "✕" });
	const header = el("div", {
		className: "rs-modal-header",
		children: [
			el("div", {
				children: [
					el("h2", { attrs: { id: "rs-modal-title" }, text: "⚙️ Rabbit Encoder Settings" }),
					el("p", {
						className: "rs-modal-sub",
						text: `Format RE${decoded.version} · ${changedCount} of ${allRows.length} settings changed from the defaults`,
					}),
				],
			}),
			closeBtn,
		],
	});

	// Toolbar: all / changed-only filter

	const allBtn = el("button", { className: "rs-seg active", attrs: { type: "button", "aria-pressed": "true" }, text: "All settings" });
	const changedBtn = el("button", {
		className: "rs-seg",
		attrs: { type: "button", "aria-pressed": "false" },
		text: `Changed only (${changedCount})`,
	});
	const emptyNote = el("div", { className: "rs-empty", text: "Every setting was left at its default." });
	emptyNote.hidden = true;

	function setFilter(onlyChanged: boolean): void {
		modal.classList.toggle("only-changed", onlyChanged);
		allBtn.classList.toggle("active", !onlyChanged);
		changedBtn.classList.toggle("active", onlyChanged);
		allBtn.setAttribute("aria-pressed", String(!onlyChanged));
		changedBtn.setAttribute("aria-pressed", String(onlyChanged));
		emptyNote.hidden = !(onlyChanged && changedCount === 0);
		hideTip();
	}
	allBtn.addEventListener("click", () => setFilter(false));
	changedBtn.addEventListener("click", () => setFilter(true));

	const toolbar = el("div", {
		className: "rs-toolbar",
		children: [
			el("div", { className: "rs-segmented", attrs: { role: "group", "aria-label": "Filter settings" }, children: [allBtn, changedBtn] }),
			el("span", { className: "rs-hint", text: "Hover or tap a setting name for an explanation" }),
		],
	});

	// Body

	const banner = decoded.newerFormat
		? el("div", {
				className: "rs-banner",
				text: `This file uses settings format RE${decoded.version}, newer than this site understands (RE1). Settings added since may be missing or shown as defaults.`,
			})
		: null;

	const body = el("div", { className: "rs-modal-body", children: [banner, emptyNote, ...groups] });
	body.addEventListener("scroll", hideTip, { passive: true });

	// Footer: the raw code, importable in Rabbit Encoder

	const copyBtn = el("button", { className: "rs-copy", attrs: { type: "button" }, text: "Copy" });
	copyBtn.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(decoded.code);
			toast("Settings code copied. Import it in Rabbit Encoder under Settings code.", "success");
		} catch {
			toast("Could not copy the settings code", "error");
		}
	});

	const footer = el("div", {
		className: "rs-modal-footer",
		children: [
			el("div", { className: "rs-code-label", text: "Settings code" }),
			el("div", { className: "rs-code-row", children: [el("code", { className: "rs-code", text: decoded.code }), copyBtn] }),
		],
	});

	const modal = el("div", { className: "rs-modal", children: [header, toolbar, body, footer] });

	const overlay = el("div", {
		className: "rs-overlay",
		attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "rs-modal-title" },
		children: [modal, tip],
	});

	function close(): void {
		document.removeEventListener("keydown", onKey);
		window.removeEventListener("resize", hideTip);
		document.body.style.overflow = prevOverflow;
		overlay.remove();
		opener?.focus?.();
	}

	function onKey(e: KeyboardEvent): void {
		if (e.key !== "Escape") return;
		e.preventDefault();
		if (!tip.hidden) hideTip();
		else close();
	}

	closeBtn.addEventListener("click", close);
	overlay.addEventListener("click", (e) => {
		if (e.target === overlay) close();
	});

	const opener = document.activeElement as HTMLElement | null;
	const prevOverflow = document.body.style.overflow;
	document.body.style.overflow = "hidden";
	document.addEventListener("keydown", onKey);
	window.addEventListener("resize", hideTip);
	document.body.appendChild(overlay);
	closeBtn.focus();
}
