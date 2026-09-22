import { describe, expect, it } from "vitest"
import { generateCardNumber, isValidLuhn, luhnCheckDigit } from "./luhn"

describe("luhnCheckDigit", () => {
  it("computes the digit that makes the Stripe test number valid", () => {
    expect(luhnCheckDigit("424242424242424")).toBe("2")
  })
})

describe("isValidLuhn", () => {
  it("accepts the Stripe test card number", () => {
    expect(isValidLuhn("4242424242424242")).toBe(true)
  })

  it("rejects a number with a wrong check digit", () => {
    expect(isValidLuhn("4242424242424241")).toBe(false)
  })

  it("rejects non-digit input", () => {
    expect(isValidLuhn("4242-4242-4242-4242")).toBe(false)
  })
})

describe("generateCardNumber", () => {
  it("always starts with the 4242 test BIN", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCardNumber().startsWith("4242")).toBe(true)
    }
  })

  it("is always 16 digits", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCardNumber()).toHaveLength(16)
    }
  })

  it("always passes its own Luhn check", () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidLuhn(generateCardNumber())).toBe(true)
    }
  })
})
