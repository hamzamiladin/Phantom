import { NextRequest, NextResponse } from "next/server";

const RENDERER_URL = process.env.RENDERER_URL ?? "http://localhost:3001";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const res = await fetch(`${RENDERER_URL}/status/${id}`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Renderer unreachable: ${msg}` }, { status: 502 });
  }
}
