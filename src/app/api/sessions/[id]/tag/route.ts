import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, tickets } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      ticketId?: string | null;
      customer?: string | null;
      sessionName?: string | null;
    };
    const hasTicketId = Object.prototype.hasOwnProperty.call(body, "ticketId");
    const hasSessionName = Object.prototype.hasOwnProperty.call(
      body,
      "sessionName"
    );
    const ticketId = body.ticketId?.trim().toUpperCase() || null;
    const customer = body.customer?.trim() || null;
    const sessionName = body.sessionName?.trim() || null;

    if (ticketId && customer) {
      const now = new Date();
      db.insert(tickets)
        .values({
          id: ticketId,
          customer,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tickets.id,
          set: { customer, updatedAt: now },
        })
        .run();
    }

    const updates: {
      ticketId?: string | null;
      sessionName?: string | null;
    } = {};

    if (hasTicketId) {
      updates.ticketId = ticketId;
    }
    if (hasSessionName) {
      updates.sessionName = sessionName;
    }

    if (Object.keys(updates).length > 0) {
      db.update(sessions).set(updates).where(eq(sessions.id, id)).run();
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[agent-observer] Tag error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
