import { NextRequest, NextResponse } from "next/server";

const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      code?: string;
      question?: string;
      context?: string;
    };

    if (!body.question?.trim()) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const res = await fetch(`${ENGINE_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: body.code ?? "",
        question: body.question,
        context: body.context ?? "",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Engine error: ${err}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Ask failed: ${msg}` }, { status: 502 });
  }
}
