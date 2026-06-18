import { runReadOnlyProbe } from "../probe/readOnlyProbe.ts";

const summary = await runReadOnlyProbe();

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.exitCode = summary.ok ? 0 : 1;
