import { el, toast } from "./utils.ts";

export function setupDonation(xmr: string | undefined): void {
	if (!xmr) return;
	const slot = document.getElementById("donation-slot");
	if (!slot) return;

	const details = document.createElement("details");
	details.className = "donation";

	const summary = el("summary", { className: "donation-summary", text: "🪙 Donate XMR" });

	const addressLink = el("a", {
		className: "donation-address",
		attrs: { href: `monero:${xmr}` },
		text: xmr,
	});

	const copyBtn = el("button", {
		className: "donation-copy",
		attrs: { type: "button" },
		text: "Copy",
	}) as HTMLButtonElement;

	copyBtn.addEventListener("click", async (e) => {
		e.preventDefault();
		try {
			await navigator.clipboard.writeText(xmr);
			copyBtn.textContent = "✓ Copied";
			toast("XMR address copied to clipboard", "success");
			setTimeout(() => (copyBtn.textContent = "Copy"), 1800);
		} catch {
			toast("Could not copy address", "error");
		}
	});

	const panel = el("div", {
		className: "donation-panel",
		children: [addressLink, copyBtn],
	});

	details.append(summary, panel);
	slot.appendChild(details);
}
