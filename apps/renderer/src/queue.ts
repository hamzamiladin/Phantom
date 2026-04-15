import { v4 as uuidv4 } from "uuid";
import { createJob, updateJob } from "./storage";
import { renderJob } from "./render";
import { uploadVideo, uploadThumbnail } from "./upload";

// TODO Phase 4+: wire up BullMQ + Upstash Redis for production.
// import { Queue, Worker } from "bullmq";
// import IORedis from "ioredis";
//
// const redisConnection = new IORedis(process.env.REDIS_URL!, {
//   maxRetriesPerRequest: null,
// });
// const renderQueue = new Queue("render", { connection: redisConnection });

const LOCAL_DEV = process.env.LOCAL_DEV !== "false";

export interface JobMeta {
  narration?: Record<string, unknown>;
  title?: string;
  description?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  patterns?: string[];
  keyInsight?: string;
}

export interface RenderJobData {
  jobId: string;
  template: string;
  props: Record<string, unknown>;
  layoutNodes?: unknown[];
  meta?: JobMeta;
}

/**
 * Enqueues a render job and returns its job ID.
 *
 * In LOCAL_DEV mode jobs execute asynchronously in the same process (no queue).
 * In production, jobs would be pushed to a BullMQ queue backed by Upstash Redis.
 */
export async function enqueueRenderJob(
  data: Omit<RenderJobData, "jobId">,
): Promise<string> {
  const jobId = uuidv4();
  createJob(jobId, data.template, data.props, data.meta);

  if (LOCAL_DEV) {
    // Fire-and-forget: let the HTTP response return before rendering starts.
    setImmediate(() => void processJob({ ...data, jobId }));
  } else {
    // TODO Phase 4+: push to BullMQ queue instead of throwing.
    // await renderQueue.add("render", { ...data, jobId });
    throw new Error(
      "BullMQ not configured. Set LOCAL_DEV=true for local development.",
    );
  }

  return jobId;
}

/**
 * Processes a single render job end-to-end:
 * render → upload MP4 → upload thumbnail → update job state.
 *
 * Called directly in LOCAL_DEV mode; called by the BullMQ worker in production.
 */
export async function processJob(data: RenderJobData): Promise<void> {
  const { jobId, template, props, layoutNodes } = data;

  try {
    updateJob(jobId, { status: "rendering" });

    const output = await renderJob({ jobId, template, props, layoutNodes });

    const [resultUrl, thumbnailUrl] = await Promise.all([
      uploadVideo(output.mp4Path, jobId),
      uploadThumbnail(output.thumbPath, jobId),
    ]);

    updateJob(jobId, {
      status: "done",
      resultUrl,
      thumbnailUrl,
    });

    console.log(`[queue] Job ${jobId} complete — ${resultUrl}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[queue] Job ${jobId} failed:`, error);
    updateJob(jobId, { status: "failed", error });
  }
}
