import express from "express";
import { z } from "zod";
import { enqueueRenderJob } from "./queue";
import { getJob } from "./storage";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = parseInt(process.env.PORT ?? "3001", 10);

// ---------------------------------------------------------------------------
// POST /generate
// Body: { template, props, layout_nodes? }
// Returns: { job_id, status: "queued" }
// ---------------------------------------------------------------------------

const GenerateSchema = z.object({
  template: z.string(),
  props: z.record(z.unknown()),
  layout_nodes: z.array(z.unknown()).optional(),
  narration: z.record(z.unknown()).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  time_complexity: z.string().optional(),
  space_complexity: z.string().optional(),
  patterns: z.array(z.string()).optional(),
  key_insight: z.string().optional(),
});

app.post("/generate", async (req, res) => {
  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { template, props, layout_nodes, narration, title, description, time_complexity, space_complexity, patterns, key_insight } = parsed.data;

  try {
    const jobId = await enqueueRenderJob({
      template,
      props,
      layoutNodes: layout_nodes,
      meta: {
        narration,
        title,
        description,
        timeComplexity: time_complexity,
        spaceComplexity: space_complexity,
        patterns,
        keyInsight: key_insight,
      },
    });

    res.json({ job_id: jobId, status: "queued" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /status/:id
// Returns: { job_id, status, result_url?, thumbnail_url?, error? }
// ---------------------------------------------------------------------------

app.get("/status/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({
    job_id: job.id,
    status: job.status,
    template: job.template,
    props: job.props ?? null,
    narration: job.narration ?? null,
    title: job.title ?? null,
    description: job.description ?? null,
    time_complexity: job.timeComplexity ?? null,
    space_complexity: job.spaceComplexity ?? null,
    patterns: job.patterns ?? [],
    key_insight: job.keyInsight ?? null,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    result_url: job.resultUrl ?? null,
    thumbnail_url: job.thumbnailUrl ?? null,
    error: job.error ?? null,
  });
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({ status: "ok", local_dev: process.env.LOCAL_DEV !== "false" });
});

app.listen(PORT, () => {
  console.log(`[server] Phantom renderer running on http://localhost:${PORT}`);
  console.log(`[server] LOCAL_DEV=${process.env.LOCAL_DEV !== "false"}`);
});

export default app;
