import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");

const processes = ["backend", "frontend"].map((directory) =>
  Bun.spawn(["bun", "run", "--cwd", directory, "dev"], {
    cwd: repositoryRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }),
);

let shuttingDown = false;

async function shutdown(exitCode: number) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of processes) {
    child.kill();
  }

  await Promise.allSettled(processes.map((child) => child.exited));
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));

const firstExitCode = await Promise.race(
  processes.map((child) => child.exited),
);

await shutdown(firstExitCode);
