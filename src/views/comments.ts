import {
	getInfo,
	listComments,
	postComment,
	deleteComment,
	getOwnerToken,
	RateLimitError,
	type Category,
	type CommentNode,
	type CommentReply,
	type PostedComment,
} from "../api.ts";
import { el, formatDate, toast } from "../utils.ts";

function formatCountdown(totalSeconds: number): string {
	const s = Math.max(0, Math.ceil(totalSeconds));
	const m = Math.floor(s / 60);
	const sec = s % 60;
	return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Mount the comments section onto `parent` for a given release.
 * Self-contained: fetches its own config (brand + limits) and comment list.
 */
export async function mountComments(parent: HTMLElement, category: Category, releaseId: number): Promise<void> {
	let enabled = true;
	let maxLength = 1000;
	let releaseGroup = "Owner";
	try {
		const info = await getInfo();
		releaseGroup = info.releaseGroup || releaseGroup;
		if (info.comments) {
			enabled = info.comments.enabled;
			maxLength = info.comments.maxLength || maxLength;
		}
	} catch {
		// Fall back to defaults; the server stays the source of truth.
	}

	if (!enabled) return;

	const isOwner = getOwnerToken() !== null;

	const section = el("section", { className: "comments" });
	const heading = el("h2", { className: "comments-title", text: "Comments" });
	const countLabel = el("span", { className: "comments-count" });
	heading.appendChild(countLabel);
	section.appendChild(heading);

	if (isOwner) {
		section.appendChild(
			el("div", {
				className: "comments-owner-banner",
				children: [el("span", { className: "comments-owner-dot", text: "●" }), `You are responding as owner (${releaseGroup})`],
			}),
		);
	}

	const list = el("div", { className: "comments-list" });

	// Root composer
	const rootComposer = buildComposer({
		isOwner,
		maxLength,
		placeholder: "Add a comment…",
		submitLabel: "Post comment",
		onSubmit: async (text) => {
			const posted = await postComment(category, releaseId, text);
			const node: CommentNode = { ...stripParent(posted), replies: [] };
			list.appendChild(renderRoot(node));
			updateCount();
			toast("Comment posted", "success");
		},
	});

	section.appendChild(rootComposer.element);
	section.appendChild(list);
	parent.appendChild(section);

	// helpers

	function updateCount(): void {
		const roots = list.querySelectorAll(".comment-root").length;
		const replies = list.querySelectorAll(".comment-reply").length;
		const total = roots + replies;
		countLabel.textContent = total === 0 ? "" : ` (${total})`;
	}

	function stripParent(c: PostedComment): CommentReply {
		return { id: c.id, author: c.author, author_type: c.author_type, body: c.body, created_at: c.created_at };
	}

	function buildDeleteButton(commentId: number, onDeleted: () => void): HTMLElement | null {
		if (!isOwner) return null;
		const btn = el("button", {
			className: "comment-delete",
			attrs: { type: "button", title: "Delete comment", "aria-label": "Delete comment" },
			text: "🗑",
		}) as HTMLButtonElement;
		btn.addEventListener("click", async () => {
			btn.disabled = true;
			try {
				await deleteComment(category, releaseId, commentId);
				onDeleted();
				updateCount();
				toast("Comment deleted", "success");
			} catch (err) {
				btn.disabled = false;
				const msg = err instanceof Error ? err.message : "Could not delete comment";
				toast(msg, "error");
			}
		});
		return btn;
	}

	function commentMeta(c: CommentReply): HTMLElement {
		const author = el("span", {
			className: c.author_type === "owner" ? "comment-author owner" : "comment-author",
			text: c.author,
		});
		const children: (HTMLElement | string)[] = [author];
		if (c.author_type === "owner") children.push(el("span", { className: "comment-badge", text: "OWNER" }));
		children.push(el("span", { className: "comment-time", text: formatDate(c.created_at) }));
		return el("div", { className: "comment-meta", children });
	}

	function renderReply(reply: CommentReply): HTMLElement {
		const node = el("div", {
			className: "comment comment-reply",
			children: [el("div", { className: "comment-head", children: [commentMeta(reply)] }), el("div", { className: "comment-body", text: reply.body })],
		});
		const del = buildDeleteButton(reply.id, () => node.remove());
		if (del) node.querySelector(".comment-head")!.appendChild(del);
		return node;
	}

	function renderRoot(root: CommentNode): HTMLElement {
		const repliesWrap = el("div", { className: "comment-replies" });
		for (const r of root.replies) repliesWrap.appendChild(renderReply(r));

		// Reply composer (collapsed until "Reply" is clicked)
		const replySlot = el("div", { className: "comment-reply-slot" });
		const replyBtn = el("button", { className: "comment-reply-btn", attrs: { type: "button" }, text: "↩ Reply" }) as HTMLButtonElement;
		let replyComposer: ReturnType<typeof buildComposer> | null = null;
		replyBtn.addEventListener("click", () => {
			if (replyComposer) {
				replyComposer.element.remove();
				replyComposer = null;
				replyBtn.textContent = "↩ Reply";
				return;
			}
			replyComposer = buildComposer({
				isOwner,
				maxLength,
				placeholder: `Reply to ${root.author}…`,
				submitLabel: "Reply",
				compact: true,
				onSubmit: async (text) => {
					const posted = await postComment(category, releaseId, text, root.id);
					repliesWrap.appendChild(renderReply(stripParent(posted)));
					updateCount();
					replyComposer?.element.remove();
					replyComposer = null;
					replyBtn.textContent = "↩ Reply";
					toast("Reply posted", "success");
				},
			});
			replySlot.appendChild(replyComposer.element);
			replyBtn.textContent = "✕ Cancel";
			replyComposer.focus();
		});

		const node = el("div", {
			className: "comment comment-root",
			children: [
				el("div", { className: "comment-head", children: [commentMeta(root)] }),
				el("div", { className: "comment-body", text: root.body }),
				el("div", { className: "comment-actions", children: [replyBtn] }),
				repliesWrap,
				replySlot,
			],
		});
		const del = buildDeleteButton(root.id, () => node.remove());
		if (del) node.querySelector(".comment-head")!.appendChild(del);
		return node;
	}

	// initial load

	list.replaceChildren(el("div", { className: "comments-loading", text: "Loading comments…" }));
	try {
		const { comments } = await listComments(category, releaseId);
		if (comments.length === 0) {
			list.replaceChildren(el("div", { className: "comments-empty", text: "No comments yet. Be the first to comment." }));
		} else {
			list.replaceChildren(...comments.map(renderRoot));
		}
		updateCount();
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Failed to load comments";
		list.replaceChildren(el("div", { className: "comments-empty", text: `⚠️ ${msg}` }));
	}
}

interface ComposerOptions {
	isOwner: boolean;
	maxLength: number;
	placeholder: string;
	submitLabel: string;
	compact?: boolean;
	onSubmit: (text: string) => Promise<void>;
}

/**
 * A textarea + submit button with a live character counter (anonymous only)
 * and a cooldown timer driven by the server's 429 / Retry-After response.
 */
function buildComposer(opts: ComposerOptions) {
	let cooldownUntil = 0;
	let ticker: ReturnType<typeof setInterval> | null = null;

	const textarea = el("textarea", {
		className: "comment-input",
		attrs: { placeholder: opts.placeholder, rows: opts.compact ? "2" : "3", "aria-label": opts.placeholder },
	}) as HTMLTextAreaElement;

	const counter = el("span", { className: "comment-counter" });
	const submitBtn = el("button", { className: "comment-submit", attrs: { type: "button" }, text: opts.submitLabel }) as HTMLButtonElement;

	const refreshCounter = () => {
		if (opts.isOwner) {
			counter.textContent = "";
			return;
		}
		const remaining = opts.maxLength - textarea.value.length;
		counter.textContent = `${remaining}`;
		counter.classList.toggle("over", remaining < 0);
		submitBtn.disabled = remaining < 0 || textarea.value.trim().length === 0 || Date.now() < cooldownUntil;
	};

	const refreshOwner = () => {
		// For the owner there's no length limit; only block on empty / cooldown.
		submitBtn.disabled = textarea.value.trim().length === 0 || Date.now() < cooldownUntil;
	};

	const refresh = opts.isOwner ? refreshOwner : refreshCounter;

	const tickCooldown = () => {
		const remainingMs = cooldownUntil - Date.now();
		if (remainingMs <= 0) {
			if (ticker) {
				clearInterval(ticker);
				ticker = null;
			}
			submitBtn.textContent = opts.submitLabel;
			refresh();
			return;
		}
		submitBtn.disabled = true;
		submitBtn.textContent = `Wait ${formatCountdown(remainingMs / 1000)}`;
	};

	const startCooldown = (seconds: number) => {
		cooldownUntil = Date.now() + seconds * 1000;
		if (ticker) clearInterval(ticker);
		tickCooldown();
		ticker = setInterval(() => {
			if (!document.body.contains(submitBtn)) {
				if (ticker) clearInterval(ticker);
				ticker = null;
				return;
			}
			tickCooldown();
		}, 1000);
	};

	const doSubmit = async () => {
		if (Date.now() < cooldownUntil) return;
		const text = textarea.value.trim();
		if (!text) return;
		if (!opts.isOwner && text.length > opts.maxLength) return;

		submitBtn.disabled = true;
		submitBtn.textContent = "Posting…";
		try {
			await opts.onSubmit(text);
			textarea.value = "";
			submitBtn.textContent = opts.submitLabel;
			refresh();
		} catch (err) {
			if (err instanceof RateLimitError) {
				toast("You're commenting too fast — slow down a moment", "warning");
				startCooldown(err.retryAfter);
			} else {
				const msg = err instanceof Error ? err.message : "Something went wrong";
				toast(msg, "error");
				submitBtn.textContent = opts.submitLabel;
				refresh();
			}
		}
	};

	textarea.addEventListener("input", refresh);
	submitBtn.addEventListener("click", () => void doSubmit());

	const element = el("div", {
		className: opts.compact ? "comment-composer compact" : "comment-composer",
		children: [textarea, el("div", { className: "comment-composer-foot", children: [counter, submitBtn] })],
	});

	refresh();

	return {
		element,
		focus: () => textarea.focus(),
	};
}
