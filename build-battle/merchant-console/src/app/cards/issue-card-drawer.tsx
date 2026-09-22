"use client"

import { Button } from "@/components/Button"
import { Divider } from "@/components/Divider"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import { Input } from "@/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { CATEGORIES, humanizeCategory, type MaskedCard } from "@/data/cards"
import { CardCategory, Currency } from "@/data/types"
import { formatMoney, parseAmountToMinorUnits } from "@/lib/money"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

const CURRENCIES: Currency[] = ["USD", "EUR", "GBP"]

/** Same server-enforced ceiling, mirrored here as a convenience check only. */
const MAX_LIMIT_MINOR_UNITS = 5_000_000

type Step = "form" | "reveal"

type FieldErrors = Partial<
  Record<"nickname" | "merchantId" | "limit" | "currency" | "form", string>
>

type RevealData = {
  card: MaskedCard
  number: string
}

/** Maps the server's `{ field }` (request-body key) onto our local error keys. */
function mapServerField(field: string | undefined): keyof FieldErrors {
  switch (field) {
    case "limitMinorUnits":
      return "limit"
    case "merchantId":
      return "merchantId"
    case "nickname":
      return "nickname"
    case "currency":
      return "currency"
    default:
      return "form"
  }
}

/** Groups a 16-digit PAN into "4242 4242 4242 4242" for readability. */
function formatForDisplay(number: string): string {
  return number.replace(/(\d{4})(?=\d)/g, "$1 ")
}

export function IssueCardDrawer({
  merchants,
}: {
  merchants: { id: string; name: string; currency: Currency }[]
}) {
  const router = useRouter()
  const fieldId = useId()

  const [step, setStep] = useState<Step>("form")
  const [nickname, setNickname] = useState("")
  const [merchantId, setMerchantId] = useState("")
  const [limitInput, setLimitInput] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [category, setCategory] = useState<CardCategory | "">("")
  const [errors, setErrors] = useState<FieldErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reveal, setReveal] = useState<RevealData | null>(null)
  const [copied, setCopied] = useState(false)

  function resetState() {
    setStep("form")
    setNickname("")
    setMerchantId("")
    setLimitInput("")
    setCurrency("USD")
    setCategory("")
    setErrors({})
    setIsSubmitting(false)
    setReveal(null)
    setCopied(false)
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      // Drawer is closed: drop any trace of the one-time reveal state along
      // with the rest of the form. Nothing from `reveal` may outlive this.
      resetState()
    }
  }

  function handleMerchantChange(id: string) {
    setMerchantId(id)
    setErrors((prev) => ({ ...prev, merchantId: undefined }))
    const merchant = merchants.find((candidate) => candidate.id === id)
    if (merchant) {
      // Nice-to-have default; the currency select below still lets the
      // user override it after this.
      setCurrency(merchant.currency)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextErrors: FieldErrors = {}
    if (!nickname.trim()) {
      nextErrors.nickname = "Nickname is required."
    }
    if (!merchantId) {
      nextErrors.merchantId = "Select a merchant."
    }

    const minorUnits = parseAmountToMinorUnits(limitInput)
    if (minorUnits === null) {
      nextErrors.limit = "Enter a valid amount, like 250 or 250.00."
    } else if (minorUnits <= 0) {
      nextErrors.limit = "Spend limit must be greater than zero."
    } else if (minorUnits > MAX_LIMIT_MINOR_UNITS) {
      nextErrors.limit = `Spend limit can't exceed ${formatMoney(MAX_LIMIT_MINOR_UNITS, currency)}.`
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          merchantId,
          limitMinorUnits: minorUnits,
          currency,
          category: category || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setErrors({ [mapServerField(data.field)]: data.error })
        return
      }

      // This is the only place `data.number` (the full PAN) is ever read.
      // It lives in local state for the reveal step only, and resetState()
      // above clears it the moment the drawer closes.
      setReveal({ card: data.card, number: data.number })
      setStep("reveal")
      router.refresh()
    } catch {
      setErrors({ form: "Something went wrong. Try again." })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCopy() {
    if (!reveal) return
    await navigator.clipboard.writeText(reveal.number)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Drawer onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button variant="primary">Issue card</Button>
      </DrawerTrigger>
      <DrawerContent>
        {step === "form" ? (
          <>
            <DrawerHeader>
              <DrawerTitle>Issue card</DrawerTitle>
              <DrawerDescription>
                Create a virtual card for a merchant. The full number is shown
                once, right after you submit.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <form
                id={`${fieldId}-issue-card-form`}
                onSubmit={handleSubmit}
                className="flex flex-col gap-4"
              >
                <div>
                  <label
                    htmlFor={`${fieldId}-nickname`}
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Nickname
                  </label>
                  <Input
                    id={`${fieldId}-nickname`}
                    className="mt-1"
                    value={nickname}
                    onChange={(event) => {
                      setNickname(event.target.value)
                      setErrors((prev) => ({ ...prev, nickname: undefined }))
                    }}
                    placeholder="e.g. Contractor tools"
                    required
                    hasError={Boolean(errors.nickname)}
                  />
                  {errors.nickname && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-500">
                      {errors.nickname}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor={`${fieldId}-merchant`}
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Merchant
                  </label>
                  <Select value={merchantId} onValueChange={handleMerchantChange}>
                    <SelectTrigger
                      id={`${fieldId}-merchant`}
                      className="mt-1"
                      hasError={Boolean(errors.merchantId)}
                    >
                      <SelectValue placeholder="Select a merchant" />
                    </SelectTrigger>
                    <SelectContent>
                      {merchants.map((merchant) => (
                        <SelectItem key={merchant.id} value={merchant.id}>
                          {merchant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.merchantId && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-500">
                      {errors.merchantId}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor={`${fieldId}-limit`}
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Spend limit
                  </label>
                  <Input
                    id={`${fieldId}-limit`}
                    className="mt-1"
                    inputMode="decimal"
                    value={limitInput}
                    onChange={(event) => {
                      setLimitInput(event.target.value)
                      setErrors((prev) => ({ ...prev, limit: undefined }))
                    }}
                    placeholder="250.00"
                    required
                    hasError={Boolean(errors.limit)}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Whole or decimal amount in {currency}, e.g. 250 or 250.00.
                  </p>
                  {errors.limit && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-500">
                      {errors.limit}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor={`${fieldId}-currency`}
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Currency
                  </label>
                  <Select
                    value={currency}
                    onValueChange={(value) => {
                      setCurrency(value as Currency)
                      setErrors((prev) => ({ ...prev, currency: undefined }))
                    }}
                  >
                    <SelectTrigger
                      id={`${fieldId}-currency`}
                      className="mt-1"
                      hasError={Boolean(errors.currency)}
                    >
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.currency && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-500">
                      {errors.currency}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor={`${fieldId}-category`}
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Category{" "}
                    <span className="font-normal text-gray-500">
                      (optional)
                    </span>
                  </label>
                  <Select
                    value={category}
                    onValueChange={(value) =>
                      setCategory(value as CardCategory)
                    }
                  >
                    <SelectTrigger id={`${fieldId}-category`} className="mt-1">
                      <SelectValue placeholder="No category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {humanizeCategory(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-sm text-gray-500">
                    Locks the card to this spending category. Cannot be
                    changed after issue.
                  </p>
                </div>

                {errors.form && (
                  <>
                    <Divider />
                    <p className="text-sm text-red-600 dark:text-red-500">
                      {errors.form}
                    </p>
                  </>
                )}
              </form>
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DrawerClose>
              <Button
                type="submit"
                form={`${fieldId}-issue-card-form`}
                variant="primary"
                isLoading={isSubmitting}
                loadingText="Issuing..."
              >
                Issue card
              </Button>
            </DrawerFooter>
          </>
        ) : (
          <>
            <DrawerHeader>
              <DrawerTitle>Card issued</DrawerTitle>
              <DrawerDescription>
                {reveal?.card.nickname}
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <div className="flex flex-col gap-4">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-500">
                  This is the only time the full card number will be shown.
                  Copy it now — it won&apos;t be shown again.
                </p>

                <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                  <p
                    className="font-mono text-lg tracking-wider text-gray-900 dark:text-gray-50"
                    data-testid="card-number-reveal"
                  >
                    {reveal ? formatForDisplay(reveal.number) : ""}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCopy}
                  className="self-start"
                >
                  {copied ? "Copied" : "Copy"}
                </Button>

                <Divider />

                <dl className="grid grid-cols-2 gap-y-3 text-sm">
                  <dt className="text-gray-500">Spend limit</dt>
                  <dd className="text-gray-900 dark:text-gray-50">
                    {reveal
                      ? formatMoney(
                          reveal.card.limitMinorUnits,
                          reveal.card.currency,
                        )
                      : ""}
                  </dd>
                  <dt className="text-gray-500">Currency</dt>
                  <dd className="text-gray-900 dark:text-gray-50">
                    {reveal?.card.currency}
                  </dd>
                  {reveal?.card.category && (
                    <>
                      <dt className="text-gray-500">Category</dt>
                      <dd className="text-gray-900 dark:text-gray-50">
                        {humanizeCategory(reveal.card.category)}
                      </dd>
                    </>
                  )}
                </dl>
              </div>
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="primary">Done</Button>
              </DrawerClose>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
