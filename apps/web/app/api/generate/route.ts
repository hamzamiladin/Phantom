import { NextRequest, NextResponse } from "next/server";

const RENDERER_URL = process.env.RENDERER_URL ?? "http://localhost:3001";
const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  // TODO: Add Upstash Ratelimit by IP here

  try {
    const body = (await req.json()) as {
      code?: string;
      intent?: string;
      template?: string;
      props?: Record<string, unknown>;
    };

    let template: string;
    let props: Record<string, unknown>;
    let layoutNodes: unknown[] = [];
    let narration: Record<string, unknown> | undefined;
    let title: string | undefined;
    let description: string | undefined;
    let time_complexity: string | undefined;
    let space_complexity: string | undefined;
    let patterns: string[] | undefined;
    let key_insight: string | undefined;

    if (body.code) {
      // Call the engine to analyze the code
      const engineRes = await fetch(`${ENGINE_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: body.code,
          intent: body.intent ?? "explain",
        }),
      });

      if (!engineRes.ok) {
        const err = await engineRes.text();
        return NextResponse.json(
          { error: `Engine failed: ${err}` },
          { status: 502 },
        );
      }

      const engineData = (await engineRes.json()) as {
        template: string;
        props: Record<string, unknown>;
        layout_nodes: unknown[];
        narration: Record<string, unknown>;
        title: string;
        description: string;
        time_complexity: string;
        space_complexity: string;
        patterns: string[];
        key_insight: string;
      };

      template = engineData.template;
      props = engineData.props;
      layoutNodes = engineData.layout_nodes ?? [];
      narration = engineData.narration;
      title = engineData.title;
      description = engineData.description;
      time_complexity = engineData.time_complexity;
      space_complexity = engineData.space_complexity;
      patterns = engineData.patterns;
      key_insight = engineData.key_insight;
    } else {
      // Direct mode (for testing): props passed explicitly
      template = body.template ?? "recursion_tree";
      props = body.props ?? {};
    }

    // Post to renderer
    const rendererRes = await fetch(`${RENDERER_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template,
        props,
        layout_nodes: layoutNodes,
        narration,
        title,
        description,
        time_complexity,
        space_complexity,
        patterns,
        key_insight,
      }),
    });

    const data = await rendererRes.json();
    return NextResponse.json(data, { status: rendererRes.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Request failed: ${msg}` },
      { status: 502 },
    );
  }
}
