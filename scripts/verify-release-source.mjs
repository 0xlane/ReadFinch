import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const tag = process.env.RELEASE_TAG ?? "";
assert.match(tag, /^v\d+\.\d+\.\d+$/, "A stable release tag is required.");
const commit = run("git", ["rev-parse", "--verify", tag + "^{commit}"]);
const changes = run("git", ["diff", "--name-only", commit, "HEAD"]);
const releaseOnly =
  /^(?:\.github\/workflows\/|docs\/|README\.md$|scripts\/(?:publish-manifest|verify-release-source)\.mjs$)/;
assert.ok(
  changes
    .split("\n")
    .filter(Boolean)
    .every((file) => releaseOnly.test(file)),
  "Application source differs from the release tag. Rebuild the packages instead of reusing them.",
);
const id = process.env.BUILD_RUN_ID;
if (id) {
  assert.match(id, /^\d+$/, "Invalid build run ID.");
  const repo = process.env.GITHUB_REPOSITORY;
  assert.match(repo ?? "", /^[\w.-]+\/[\w.-]+$/);
  const metadata = JSON.parse(
    run("gh", ["api", "repos/" + repo + "/actions/runs/" + id]),
  );
  assert.equal(metadata.repository.full_name, repo);
  assert.equal(
    metadata.head_sha,
    commit,
    "Artifacts must have been built from this exact release tag.",
  );
  assert.equal(metadata.path, ".github/workflows/release.yml");
  assert.ok(["push", "workflow_dispatch"].includes(metadata.event));
  const { jobs } = JSON.parse(
    run("gh", [
      "api",
      "repos/" + repo + "/actions/runs/" + id + "/jobs?per_page=100",
    ]),
  );
  for (const name of [
    "Package windows x64",
    "Package macos arm64",
    "Package macos x64",
    "Package linux x64",
  ])
    assert.ok(
      jobs.some((job) => job.name === name && job.conclusion === "success"),
      name + " must have passed.",
    );
}
console.log(
  "Verified release source " + tag + " (" + commit.slice(0, 7) + ").",
);
