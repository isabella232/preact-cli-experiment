import { join } from "path";
import _glob from "glob";
import { promisify } from "util";
import test, { ExecutionContext } from "ava";
import dirTree from "directory-tree";
import _rmrf from "rimraf";
import { createProgram } from "../src/cli";
import { execAsync } from "../src/utils";

const glob = promisify(_glob);
const rimraf = promisify(_rmrf);

const subjectsDir = join(__dirname, "subjects");

async function buildMacro<T>(t: ExecutionContext<T>, input: string, extraArgs: string[] = []) {
	const projectDir = join(subjectsDir, input);
	const { stdout } = await execAsync(`ts-node ${join(__dirname, "../src/bin/preact.ts")} --cwd "${projectDir}" --only-resolve client ${extraArgs.join(" ")}`);
	t.snapshot(stdout);
}

buildMacro.title = (_: string | undefined, input: string, extra?: string[]) => `builds ${input}${extra ? " " + extra.join(" ") : ""}`;

test.afterEach(async t => {
	const dirs = await glob(join(subjectsDir, "**/build"));
	await Promise.all(dirs.map(v => rimraf(v)));
});

test("adds build command", async t => {
	const { program } = await createProgram(["build"]);
	// t.false(program.parseOptions(["build"]).unknown.includes("build"));
	const { args, unknown } = program.parseOptions(["build"]);
	t.false(unknown.includes("build"));
	t.true(args.includes("build"));
});

test(buildMacro, "default");
test.serial(buildMacro, "prerendering", ["--prerender-urls", "prerender-urls.json"])
test.serial(buildMacro, "prerendering", ["--prerender-urls", "prerender-urls.js"]);
test.serial(buildMacro, "prerendering", ["--prerender-urls", "prerender-urls.promise.js"]);
