/**
 * Card numbers in this repo use the 4242 test BIN. Luhn is what keeps a
 * generated number looking like a real PAN structurally without being one.
 */

const TEST_BIN = "4242"
const NUMBER_LENGTH = 16

/** The check digit that makes `digitsWithoutCheckDigit + result` Luhn-valid. */
export function luhnCheckDigit(digitsWithoutCheckDigit: string): string {
  let sum = 0
  const digits = digitsWithoutCheckDigit.split("").map(Number).reverse()
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i]
    if (i % 2 === 0) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return String((10 - (sum % 10)) % 10)
}

/** Whether a full digit string, including its own check digit, is Luhn-valid. */
export function isValidLuhn(number: string): boolean {
  if (!/^\d+$/.test(number)) return false
  let sum = 0
  const digits = number.split("").map(Number).reverse()
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i]
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

/** A 16-digit number on the 4242 test BIN with a valid Luhn check digit. Server-side only. */
export function generateCardNumber(): string {
  const fillLength = NUMBER_LENGTH - TEST_BIN.length - 1
  let middle = ""
  for (let i = 0; i < fillLength; i++) {
    middle += String(Math.floor(Math.random() * 10))
  }
  const withoutCheckDigit = TEST_BIN + middle
  return withoutCheckDigit + luhnCheckDigit(withoutCheckDigit)
}
