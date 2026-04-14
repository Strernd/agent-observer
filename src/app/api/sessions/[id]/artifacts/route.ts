import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import type { OutputArtifact } from "@/lib/ai/schemas";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestedPath = request.nextUrl.searchParams.get("path");
    const disposition = request.nextUrl.searchParams.get("disposition");
    if (!requestedPath) {
      return NextResponse.json({ error: "missing_path" }, { status: 400 });
    }

    const [session] = await db
      .select({
        outputArtifacts: sessions.outputArtifacts,
      })
      .from(sessions)
      .where(eq(sessions.id, id));

    if (!session) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const artifacts = parseArtifacts(session.outputArtifacts);
    const artifact = artifacts.find((item) => item.path === requestedPath);
    if (!artifact) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const content = await fs.readFile(artifact.path);
    const fileName = path.basename(artifact.path);

    return new NextResponse(content, {
      headers: {
        "content-type": contentTypeForPath(artifact.path),
        "content-disposition": `${disposition === "attachment" ? "attachment" : "inline"}; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    console.error("[agent-observer] Artifact open error:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

function parseArtifacts(raw: string | null): OutputArtifact[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutputArtifact[]) : [];
  } catch {
    return [];
  }
}

function contentTypeForPath(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".pdf":
      return "application/pdf";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}
