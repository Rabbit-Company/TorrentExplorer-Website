import { rm, mkdir, cp } from "node:fs/promises";
import { watch } from "node:fs";

const OUT = "./dist";
const PUBLIC = "./public";
const ENTRY = "./src/main.ts";

async function build() {
	const start = performance.now();

	await rm(OUT, { recursive: true, force: true });
	await mkdir(OUT, { recursive: true });

	// Copy static assets (html, css, config.json, favicons, ...)
	await cp(PUBLIC, OUT, { recursive: true });

	// Bundle TS -> JS
	const result = await Bun.build({
		entrypoints: [ENTRY],
		outdir: OUT,
		minify: true,
		target: "browser",
		sourcemap: "linked",
		naming: "[name].[hash].js",
	});

	if (!result.success) {
		for (const log of result.logs) console.error(log);
		throw new Error("Build failed");
	}

	// Rewrite <script src="main.js"> in index.html to the hashed filename
	const [output] = result.outputs;
	if (!output) throw new Error("No output produced");

	const hashedName = output.path.split("/").pop()!;
	const htmlPath = `${OUT}/index.html`;
	const html = await Bun.file(htmlPath).text();
	const patched = html.replace(
		/<script[^>]*src="\.?\/?main\.js"[^>]*><\/script>/,
		`<script type="module" src="/${hashedName}"></script>`,
	);
	await Bun.write(htmlPath, patched);

	const ms = (performance.now() - start).toFixed(0);
	console.log(`✓ Built in ${ms}ms → ${hashedName}`);
}

const isWatch = process.argv.includes("--watch");

await build().catch((err) => {
	console.error(err);
	if (!isWatch) process.exit(1);
});

if (isWatch) {
	console.log("👀 Watching src/ and public/ …");
	const rebuilder = debounce(async () => {
		try {
			await build();
		} catch (err) {
			console.error(err);
		}
	}, 100);
	watch("./src", { recursive: true }, rebuilder);
	watch(PUBLIC, { recursive: true }, rebuilder);
}

function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return ((...args: any[]) => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	}) as T;
}
