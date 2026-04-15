export type JobStatus = "queued" | "rendering" | "done" | "failed";

export interface Job {
  id: string;
  status: JobStatus;
  template: string;
  props?: Record<string, unknown>;
  narration?: Record<string, unknown>;
  title?: string;
  description?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  patterns?: string[];
  keyInsight?: string;
  createdAt: Date;
  updatedAt: Date;
  resultUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

// TODO Phase 4+: replace with Supabase
// import { createClient } from "@supabase/supabase-js";
// const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

const jobs = new Map<string, Job>();

export function createJob(
  id: string,
  template: string,
  props?: Record<string, unknown>,
  meta?: {
    narration?: Record<string, unknown>;
    title?: string;
    description?: string;
    timeComplexity?: string;
    spaceComplexity?: string;
    patterns?: string[];
    keyInsight?: string;
  },
): Job {
  const job: Job = {
    id,
    status: "queued",
    template,
    props,
    narration: meta?.narration,
    title: meta?.title,
    description: meta?.description,
    timeComplexity: meta?.timeComplexity,
    spaceComplexity: meta?.spaceComplexity,
    patterns: meta?.patterns,
    keyInsight: meta?.keyInsight,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, updates: Partial<Job>): Job {
  const existing = jobs.get(id);
  if (!existing) throw new Error(`Job not found: ${id}`);
  const updated = { ...existing, ...updates, updatedAt: new Date() };
  jobs.set(id, updated);
  return updated;
}
