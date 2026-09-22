import {
  createCard,
  listCards,
  maskCard,
  toCardCreateInput,
  validateCardInput,
} from "@/data/cards"
import { CardCategory, Currency } from "@/data/types"
import { NextRequest, NextResponse } from "next/server"

export function GET() {
  return NextResponse.json({ cards: listCards() })
}

/**
 * Issues a card. This is the one response in the system that carries the
 * full number — every other read of this card is masked.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    )
  }

  const input = (body ?? {}) as Record<string, unknown>
  const validationError = validateCardInput(input)
  if (validationError) {
    return NextResponse.json(
      { error: validationError.message, field: validationError.field },
      { status: 400 },
    )
  }

  const { card, number } = createCard(
    toCardCreateInput({
      nickname: input.nickname as string,
      merchantId: input.merchantId as string,
      limitMinorUnits: input.limitMinorUnits as number,
      currency: input.currency as Currency,
      category: input.category as CardCategory | null | undefined,
    }),
  )

  return NextResponse.json({ card: maskCard(card), number }, { status: 201 })
}
