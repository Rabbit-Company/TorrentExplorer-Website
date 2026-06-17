import { getInfo, submitRequest, RateLimitError, type RequestKind, listRequests, deleteRequest, tvdbUrl, type RequestListItem, getOwnerToken } from "../api.ts";
import { el, formatDate, toast } from "../utils.ts";

interface KindOption {
	value: RequestKind;
	label: string;
	icon: string;
	idLabel: "Series ID" | "Movies ID";
}

const KIND_OPTIONS: KindOption[] = [
	{ value: "movies", label: "Movie", icon: "🎬", idLabel: "Movies ID" },
	{ value: "series", label: "Series", icon: "📺", idLabel: "Series ID" },
	{ value: "anime", label: "Anime", icon: "🌸", idLabel: "Series ID" },
];

/** Client-side mirror of the server's strict ID validation. */
function validateId(raw: string): { ok: true; value: number } | { ok: false; reason: string } {
	const s = raw.trim();
	if (!s) return { ok: false, reason: "Enter a TheTVDB ID." };
	if (!/^[0-9]+$/.test(s)) return { ok: false, reason: "IDs are numbers only — no letters, spaces or symbols." };
	if (/^0/.test(s)) return { ok: false, reason: "ID can't start with a zero." };
	if (s.length > 10) return { ok: false, reason: "That ID is too long to be valid." };
	const n = Number(s);
	if (!Number.isInteger(n) || n < 1) return { ok: false, reason: "Enter a valid positive ID." };
	return { ok: true, value: n };
}

function formatCountdown(totalSeconds: number): string {
	const s = Math.max(0, Math.ceil(totalSeconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
	return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function windowPhrase(minutes: number): string {
	if (minutes === 60) return "once per hour";
	if (minutes === 1) return "once per minute";
	if (minutes % 60 === 0) return `once every ${minutes / 60} hours`;
	return `once every ${minutes} minutes`;
}

export async function renderRequest(app: HTMLElement): Promise<void> {
	app.replaceChildren(el("div", { className: "loading-screen", text: "Loading…" }));

	let windowMinutes = 60;
	let enabled = true;
	try {
		const info = await getInfo();
		if (info.requests) {
			windowMinutes = info.requests.rateLimitWindowMinutes || 60;
			enabled = info.requests.enabled;
		}
	} catch {
		// Fall back to the defaults; the server is still the source of truth.
	}

	if (!enabled) {
		app.replaceChildren(
			el("div", {
				className: "empty",
				children: [el("div", { className: "empty-icon", text: "🚫" }), el("div", { text: "Requests are currently disabled." })],
			}),
		);
		return;
	}

	let selectedKind: RequestKind = "series";
	let cooldownUntil = 0; // epoch ms; while now < this, submitting is blocked

	// Type selector (segmented control)
	const kindButtons: HTMLButtonElement[] = [];
	const idLabelText = el("span", { className: "request-id-kind", text: "Series ID" });

	const refreshKindButtons = () => {
		for (const btn of kindButtons) {
			btn.classList.toggle("active", btn.dataset.kind === selectedKind);
		}
		const opt = KIND_OPTIONS.find((o) => o.value === selectedKind)!;
		idLabelText.textContent = opt.idLabel;
	};

	const segmented = el("div", { className: "request-segmented" });
	for (const opt of KIND_OPTIONS) {
		const btn = el("button", {
			className: "request-seg-btn",
			attrs: { type: "button", "data-kind": opt.value },
			children: [el("span", { className: "request-seg-icon", text: opt.icon }), el("span", { text: opt.label })],
		}) as HTMLButtonElement;
		btn.addEventListener("click", () => {
			selectedKind = opt.value;
			refreshKindButtons();
			clearFieldError();
			void loadRequests();
		});
		kindButtons.push(btn);
		segmented.appendChild(btn);
	}

	const idInput = el("input", {
		className: "request-input",
		attrs: {
			type: "text",
			inputmode: "numeric",
			pattern: "[0-9]*",
			placeholder: "359274",
			autocomplete: "off",
			spellcheck: "false",
			"aria-label": "TheTVDB ID",
		},
	}) as HTMLInputElement;

	const fieldError = el("div", { className: "request-field-error", attrs: { role: "alert" } });
	const clearFieldError = () => {
		fieldError.textContent = "";
		idInput.classList.remove("invalid");
	};
	const showFieldError = (msg: string) => {
		fieldError.textContent = msg;
		idInput.classList.add("invalid");
	};

	// Keep the input numeric as the user types, and clear errors on edit.
	idInput.addEventListener("input", () => {
		const cleaned = idInput.value.replace(/[^0-9]/g, "");
		if (cleaned !== idInput.value) idInput.value = cleaned;
		clearFieldError();
		clearResult();
	});

	const submitBtn = el("button", {
		className: "request-submit",
		attrs: { type: "button" },
		text: "Submit request",
	}) as HTMLButtonElement;

	// Result + rate-limit notice slots
	const resultSlot = el("div", { className: "request-result-slot" });
	const noticeSlot = el("div", { className: "request-notice-slot" });

	const clearResult = () => resultSlot.replaceChildren();

	const showSuccess = (count: number) => {
		const optLabel = KIND_OPTIONS.find((o) => o.value === selectedKind)!.label.toLowerCase();
		const times = count === 1 ? "once" : `${count} times`;
		resultSlot.replaceChildren(
			el("div", {
				className: "request-success",
				children: [
					el("span", { className: "request-success-icon", text: "✓" }),
					el("div", {
						children: [
							el("div", { className: "request-success-title", text: "Request received!" }),
							el("div", {
								className: "request-success-sub",
								text: count === 1 ? `You're the first to request this ${optLabel}.` : `This ${optLabel} has now been requested ${times}.`,
							}),
						],
					}),
				],
			}),
		);
	};

	// Cooldown handling
	let ticker: ReturnType<typeof setInterval> | null = null;

	const renderCooldownNotice = () => {
		const remainingMs = cooldownUntil - Date.now();
		if (remainingMs <= 0) {
			noticeSlot.replaceChildren();
			submitBtn.disabled = false;
			submitBtn.textContent = "Submit request";
			if (ticker) {
				clearInterval(ticker);
				ticker = null;
			}
			return;
		}

		submitBtn.disabled = true;
		const countdown = formatCountdown(remainingMs / 1000);
		submitBtn.textContent = `Available in ${countdown}`;

		noticeSlot.replaceChildren(
			el("div", {
				className: "request-ratelimit",
				children: [
					el("span", { className: "request-ratelimit-icon", text: "⏳" }),
					el("div", {
						children: [
							el("div", { className: "request-ratelimit-title", text: `You can request ${windowPhrase(windowMinutes)}.` }),
							el("div", {
								className: "request-ratelimit-sub",
								children: ["You can submit your next request in ", el("strong", { text: countdown }), "."],
							}),
						],
					}),
				],
			}),
		);
	};

	const startCooldown = (untilMs: number) => {
		cooldownUntil = untilMs;
		if (ticker) clearInterval(ticker);
		renderCooldownNotice();
		ticker = setInterval(() => {
			// Self-terminate if the view has been navigated away from.
			if (!document.body.contains(submitBtn)) {
				if (ticker) clearInterval(ticker);
				ticker = null;
				return;
			}
			renderCooldownNotice();
		}, 1000);
	};

	// Submit handler
	const doSubmit = async () => {
		if (Date.now() < cooldownUntil) return;

		const validation = validateId(idInput.value);
		if (!validation.ok) {
			showFieldError(validation.reason);
			idInput.focus();
			return;
		}
		clearFieldError();

		submitBtn.disabled = true;
		submitBtn.textContent = "Submitting…";

		try {
			const result = await submitRequest(selectedKind, validation.value);
			showSuccess(result.counter);
			toast("Request submitted", "success");
			// Server now rate-limits this IP for the window; reflect that in the UI.
			startCooldown(Date.now() + windowMinutes * 60_000);
		} catch (err) {
			if (err instanceof RateLimitError) {
				clearResult();
				toast("You've already requested recently", "warning");
				startCooldown(Date.now() + err.retryAfter * 1000);
			} else {
				const msg = err instanceof Error ? err.message : "Something went wrong";
				showFieldError(msg);
				toast(msg, "error");
				submitBtn.disabled = false;
				submitBtn.textContent = "Submit request";
			}
		}
	};

	submitBtn.addEventListener("click", () => void doSubmit());
	idInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			void doSubmit();
		}
	});

	// Assemble
	const card = el("div", {
		className: "request-card",
		children: [
			el("div", {
				className: "request-field",
				children: [el("label", { className: "request-label", text: "What are you requesting?" }), segmented],
			}),
			el("div", {
				className: "request-field",
				children: [
					el("label", {
						className: "request-label",
						children: ["TheTVDB ", idLabelText],
					}),
					idInput,
					fieldError,
					el("div", {
						className: "request-hint",
						children: [
							"Find the numeric ID on the title's page at ",
							el("a", { attrs: { href: "https://thetvdb.com", target: "_blank", rel: "noopener" }, text: "thetvdb.com" }),
							". Anime use a Series ID.",
						],
					}),
				],
			}),
			submitBtn,
			resultSlot,
			noticeSlot,
		],
	});

	// Requests table
	const requestsStatus = el("div", { className: "request-list-status", text: "Loading requests…" });
	const requestsTableSlot = el("div", { className: "request-list-slot" });

	const requestsSection = el("section", {
		className: "request-list",
		children: [el("h2", { className: "request-list-title", text: "Most requested" }), requestsStatus, requestsTableSlot],
	});

	const buildRequestsTable = (items: RequestListItem[], owner: boolean): HTMLElement => {
		const headCells = [el("th", { text: "ID" }), el("th", { text: "Requests" }), el("th", { text: "First requested" }), el("th", { text: "Last requested" })];
		if (owner) headCells.push(el("th", { className: "request-th-actions", text: "" }));

		const rows = items.map((item) => {
			const idLink = el("a", {
				className: "request-id-link",
				attrs: { href: tvdbUrl(item.kind, item.id), target: "_blank", rel: "noopener" },
				text: String(item.id),
			});

			const cells: HTMLElement[] = [
				el("td", { children: [idLink] }),
				el("td", { className: "request-td-count", text: String(item.counter) }),
				el("td", { text: formatDate(item.created) }),
				el("td", { text: formatDate(item.last_updated) }),
			];

			if (owner) {
				const delBtn = el("button", {
					className: "request-delete",
					attrs: { type: "button", title: "Delete request", "aria-label": `Delete request ${item.id}` },
					text: "Delete",
				}) as HTMLButtonElement;
				delBtn.addEventListener("click", async () => {
					if (!window.confirm(`Delete request for TheTVDB ID ${item.id}?`)) return;
					delBtn.disabled = true;
					try {
						await deleteRequest(item.kind, item.id);
						toast("Request deleted", "success");
						void loadRequests();
					} catch (err) {
						toast(err instanceof Error ? err.message : "Failed to delete", "error");
						delBtn.disabled = false;
					}
				});
				cells.push(el("td", { className: "request-td-actions", children: [delBtn] }));
			}

			return el("tr", { children: cells });
		});

		return el("table", {
			className: "request-table",
			children: [el("thead", { children: [el("tr", { children: headCells })] }), el("tbody", { children: rows })],
		});
	};

	const loadRequests = async (): Promise<void> => {
		const owner = getOwnerToken() !== null;
		requestsStatus.textContent = "Loading requests…";
		try {
			const { requests } = await listRequests(selectedKind);
			if (requests.length === 0) {
				requestsStatus.textContent = "No requests yet for this type.";
				requestsTableSlot.replaceChildren();
				return;
			}
			requestsStatus.textContent = "";
			requestsTableSlot.replaceChildren(buildRequestsTable(requests, owner));
		} catch (err) {
			requestsStatus.textContent = `⚠️ ${err instanceof Error ? err.message : "Failed to load requests"}`;
			requestsTableSlot.replaceChildren();
		}
	};

	app.replaceChildren(
		el("h1", { className: "page-title", text: "Request a title" }),
		el("p", {
			className: "page-sub",
			children: ["Want something added? Drop the TheTVDB ID below. You can request ", el("strong", { text: windowPhrase(windowMinutes) }), "."],
		}),
		card,
		requestsSection,
	);

	refreshKindButtons();
	void loadRequests();
}
