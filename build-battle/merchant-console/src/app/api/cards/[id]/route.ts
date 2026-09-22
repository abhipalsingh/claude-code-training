import { CARD_STATUSES, cardById, maskCard, transitionCardStatus } from "@/data/cards"
import { CardStatus } from "@/data/types"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const card = cardById(id)
  if (!card) {
    return NextResponse.json({ error: "Card not found." }, { status: 404 })
  }
  return NextResponse.json({ card: maskCard(card) })
}

/** The only mutation a card supports post-issue: a guarded status transition. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    )
  }

  const status = (body as Record<string, unknown> | null)?.status
  if (typeof status !== "string" || !CARD_STATUSES.includes(status as CardStatus)) {
    return NextResponse.json(
      { error: "status must be one of active, frozen, cancelled." },
      { status: 400 },
    )
  }

  if (!cardById(id)) {
    return NextResponse.json({ error: "Card not found." }, { status: 404 })
  }

  const result = transitionCardStatus(id, status as CardStatus)
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }
  return NextResponse.json({ card: result.card })
}
