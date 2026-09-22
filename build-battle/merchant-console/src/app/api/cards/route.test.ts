import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it } from "vitest"
import { store } from "@/data/store"
import { merchants } from "@/data/merchants"
import { GET, POST } from "./route"

/**
 * Exercises the route handlers directly, the same way Next would call them,
 * without needing a running dev server — a stand-in for the curl checks the
 * spec calls for in an environment where a live server isn't available.
 */

beforeEach(() => {
  store.cards.length = 0
})

const VALID_BODY = {
  nickname: "Ad spend — Q4",
  merchantId: merchants[0].id,
  limitMinorUnits: 25000,
  currency: "USD",
}

function post(body: unknown, headers?: Record<string, string>) {
  return POST(
    new NextRequest("http://localhost/api/cards", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  )
}

describe("POST /api/cards", () => {
  it("issues a card and returns the full number exactly once", async () => {
    const response = await post(VALID_BODY)
    expect(response.status).toBe(201)
    const json = await response.json()
    expect(json.number).toHaveLength(16)
    expect(json.card.maskedNumber).toBe(`•••• ${json.number.slice(-4)}`)
    expect(json.card.last4).toBeUndefined()
  })

  it("adds the card to the list", async () => {
    await post(VALID_BODY)
    const response = await GET()
    const json = await response.json()
    expect(json.cards).toHaveLength(1)
    expect(json.cards[0].maskedNumber).toMatch(/^•••• \d{4}$/)
  })

  it("rejects a missing merchant with a 400 and creates nothing", async () => {
    const response = await post({ ...VALID_BODY, merchantId: "" })
    expect(response.status).toBe(400)
    expect(store.cards).toHaveLength(0)
  })

  it("rejects a zero limit", async () => {
    const response = await post({ ...VALID_BODY, limitMinorUnits: 0 })
    expect(response.status).toBe(400)
  })

  it("rejects a negative limit", async () => {
    const response = await post({ ...VALID_BODY, limitMinorUnits: -500 })
    expect(response.status).toBe(400)
  })

  it("rejects a limit above 5,000,000 minor units", async () => {
    const response = await post({ ...VALID_BODY, limitMinorUnits: 5_000_001 })
    expect(response.status).toBe(400)
  })

  it("rejects a currency outside USD/EUR/GBP", async () => {
    const response = await post({ ...VALID_BODY, currency: "JPY" })
    expect(response.status).toBe(400)
  })

  it("rejects a malformed body", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/cards", {
        method: "POST",
        body: "not json",
      }),
    )
    expect(response.status).toBe(400)
  })

  it("rejects a currency that doesn't match the merchant's currency", async () => {
    const gbpMerchant = merchants.find((m) => m.currency === "GBP")!
    const response = await post({
      ...VALID_BODY,
      merchantId: gbpMerchant.id,
      currency: "USD",
    })
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.field).toBe("currency")
    expect(store.cards).toHaveLength(0)
  })

  it("replays the same card for a repeated Idempotency-Key instead of creating a second one", async () => {
    const headers = { "Idempotency-Key": "route-test-repeat-key" }
    const first = await post(VALID_BODY, headers)
    const second = await post(VALID_BODY, headers)

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const firstJson = await first.json()
    const secondJson = await second.json()
    expect(secondJson.card.id).toBe(firstJson.card.id)
    expect(secondJson.number).toBe(firstJson.number)
    expect(store.cards).toHaveLength(1)
  })

  it("creates a separate card when the Idempotency-Key differs", async () => {
    await post(VALID_BODY, { "Idempotency-Key": "route-test-distinct-a" })
    await post(VALID_BODY, { "Idempotency-Key": "route-test-distinct-b" })
    expect(store.cards).toHaveLength(2)
  })
})

describe("GET /api/cards", () => {
  it("returns an empty list when no cards exist", async () => {
    const response = await GET()
    const json = await response.json()
    expect(json.cards).toEqual([])
  })
})
