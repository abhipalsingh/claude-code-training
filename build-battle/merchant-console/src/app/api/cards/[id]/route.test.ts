import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it } from "vitest"
import { createCard, toCardCreateInput } from "@/data/cards"
import { merchants } from "@/data/merchants"
import { store } from "@/data/store"
import { GET, PATCH } from "./route"

beforeEach(() => {
  store.cards.length = 0
})

const VALID_INPUT = {
  nickname: "Ad spend — Q4",
  merchantId: merchants[0].id,
  limitMinorUnits: 25000,
  currency: "USD" as const,
}

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/cards/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

describe("GET /api/cards/[id]", () => {
  it("returns the masked card", async () => {
    const { card } = createCard(toCardCreateInput(VALID_INPUT))
    const response = await GET(new NextRequest(`http://localhost/api/cards/${card.id}`), {
      params: Promise.resolve({ id: card.id }),
    })
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.card.id).toBe(card.id)
    expect(json.card.last4).toBeUndefined()
  })

  it("404s on an unknown id", async () => {
    const response = await GET(new NextRequest("http://localhost/api/cards/card_ghost"), {
      params: Promise.resolve({ id: "card_ghost" }),
    })
    expect(response.status).toBe(404)
  })
})

describe("PATCH /api/cards/[id]", () => {
  it("freezes an active card", async () => {
    const { card } = createCard(toCardCreateInput(VALID_INPUT))
    const response = await patch(card.id, { status: "frozen" })
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.card.status).toBe("frozen")
  })

  it("rejects an illegal transition out of cancelled", async () => {
    const { card } = createCard(toCardCreateInput(VALID_INPUT))
    await patch(card.id, { status: "cancelled" })
    const response = await patch(card.id, { status: "active" })
    expect(response.status).toBe(409)
  })

  it("rejects a status outside the allowlist", async () => {
    const { card } = createCard(toCardCreateInput(VALID_INPUT))
    const response = await patch(card.id, { status: "deleted" })
    expect(response.status).toBe(400)
  })

  it("404s on an unknown id", async () => {
    const response = await patch("card_ghost", { status: "frozen" })
    expect(response.status).toBe(404)
  })
})
