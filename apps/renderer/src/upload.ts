import path from "path";
import fs from "fs";

// TODO Phase 4+: configure R2 upload
// import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
// import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
//
// const s3 = new S3Client({
//   region: "auto",
//   endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
//   credentials: {
//     accessKeyId: process.env.R2_ACCESS_KEY_ID!,
//     secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
//   },
// });

const LOCAL_DEV = process.env.LOCAL_DEV !== "false";
const OUT_DIR = path.resolve(process.cwd(), "out");

export async function uploadVideo(
  localPath: string,
  jobId: string,
): Promise<string> {
  if (LOCAL_DEV) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const dest = path.join(OUT_DIR, `${jobId}.mp4`);
    fs.copyFileSync(localPath, dest);
    return `file://${dest}`;
  }

  // TODO Phase 4+: upload to R2
  // Requires: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
  throw new Error(
    "R2 upload not configured. Set LOCAL_DEV=true for local development.",
  );
}

export async function uploadThumbnail(
  localPath: string,
  jobId: string,
): Promise<string> {
  if (LOCAL_DEV) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const dest = path.join(OUT_DIR, `${jobId}_thumb.png`);
    fs.copyFileSync(localPath, dest);
    return `file://${dest}`;
  }

  // TODO Phase 4+: upload to R2
  throw new Error(
    "R2 upload not configured. Set LOCAL_DEV=true for local development.",
  );
}
