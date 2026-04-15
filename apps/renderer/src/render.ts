import path from "path";
import os from "os";
import fs from "fs";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";

// Path to the animations package entry point.
// __dirname resolves to apps/renderer/src at runtime (CommonJS).
const ANIMATIONS_ENTRY = path.resolve(
  __dirname,
  "../../../packages/animations/src/remotion-entry.tsx",
);

// Cache the bundle path — bundling is expensive (~10-30s), do it once per process.
let bundleCache: string | null = null;

async function getBundle(): Promise<string> {
  if (bundleCache) return bundleCache;
  console.log("[renderer] Bundling animations package...");
  bundleCache = await bundle({
    entryPoint: ANIMATIONS_ENTRY,
    webpackOverride: (config) => config,
  });
  console.log(`[renderer] Bundle ready at ${bundleCache}`);
  return bundleCache;
}

export interface RenderInput {
  jobId: string;
  /** Remotion composition ID, e.g. "RecursionTree" */
  template: string;
  props: Record<string, unknown>;
  layoutNodes?: unknown[];
}

export interface RenderOutput {
  mp4Path: string;
  thumbPath: string;
  durationMs: number;
}

export async function renderJob(input: RenderInput): Promise<RenderOutput> {
  const bundlePath = await getBundle();
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `phantom-${input.jobId}-`),
  );
  const mp4Path = path.join(tmpDir, "out.mp4");
  const thumbPath = path.join(tmpDir, "thumb.png");

  const compositionId = toCompositionId(input.template);
  const start = Date.now();

  // Resolve and validate the composition against the provided props.
  const composition = await selectComposition({
    serveUrl: bundlePath,
    id: compositionId,
    inputProps: input.props,
  });

  // Render the full MP4.
  await renderMedia({
    composition,
    serveUrl: bundlePath,
    codec: "h264",
    outputLocation: mp4Path,
    inputProps: input.props,
    chromiumOptions: { gl: "swangle" },
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct % 20 === 0) {
        console.log(`[renderer] ${input.jobId} ${pct}%`);
      }
    },
  });

  // Render a single still frame for the thumbnail (frame 0).
  await renderStill({
    composition,
    serveUrl: bundlePath,
    output: thumbPath,
    inputProps: input.props,
    frame: 0,
    imageFormat: "png",
    chromiumOptions: { gl: "swangle" },
  });

  const durationMs = Date.now() - start;
  console.log(
    `[renderer] ${input.jobId} done in ${(durationMs / 1000).toFixed(1)}s`,
  );

  return { mp4Path, thumbPath, durationMs };
}

/**
 * Converts a snake_case template name to PascalCase Remotion composition ID.
 * e.g. "recursion_tree" -> "RecursionTree"
 * e.g. "RecursionTree"  -> "RecursionTree" (already PascalCase, passthrough)
 */
function toCompositionId(template: string): string {
  return template
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}
