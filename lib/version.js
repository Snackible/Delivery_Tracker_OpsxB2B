// What is running, in a form you can read at a glance: "v1.2.0 · dd9371c".
// The release number is `version` in package.json (bumped with each push). The short commit hash is
// added automatically: Vercel provides VERCEL_GIT_COMMIT_SHA, and locally it is read from git.
import { execSync } from "node:child_process";
import pkg from "../package.json" with { type: "json" };

let localSha = null;

function commit() {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  if (process.env.VERCEL) return "unknown";
  if (localSha === null) {
    try {
      localSha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "local";
    } catch {
      localSha = "local";
    }
  }
  return localSha;
}

export function versionInfo() {
  const sha = commit();
  const where = process.env.VERCEL_ENV || "local"; // production, preview or local
  return {
    version: pkg.version,
    commit: sha,
    env: where,
    label: `v${pkg.version} · ${sha}`,
  };
}
