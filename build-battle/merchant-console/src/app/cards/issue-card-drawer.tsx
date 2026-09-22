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
type RevealData = { card: MaskedCard; number: string }

/** Maps the server's `{ field }` (request-body key) onto our local error keys. */
function mapServerField(field: string | undefined): keyof FieldErrors {
  switch (field) {
    case "limitMinorUnits":
      return "limit"
    case "merchantId":
    case "nickname":
    case "currency":
      return field
    default:
      return "form"
  }
}

/** Groups a 16-digit PAN into "4242 4242 4242 4242" for readability. */
function formatForDisplay(number: string): string {
  return number.replace(/(\d{4})(?=\d)/g, "$1 ")
}

type FieldWrap = {
  label: React.ReactNode
  htmlFor: string
  error?: string
  helper?: string
}

/** Label + control + helper/error, shared across every field below. */
function Field({ label, htmlFor, error, helper, children }: FieldWrap & {
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-gray-900 dark:text-gray-50"
      >
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="mt-1 text-sm text-red-600 dark:text-red-500">{error}</p>
      ) : helper ? (
        <p className="mt-1 text-sm text-gray-500">{helper}</p>
      ) : null}
    </div>
  )
}

/** A Field wired up to a Select, for the three dropdown fields below. */
function SelectField({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  ...field
}: FieldWrap & {
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder: string
  disabled?: boolean
}) {
  return (
    <Field {...field}>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={field.htmlFor} hasError={Boolean(field.error)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export function IssueCardDrawer({
  merchants,
}: {
  merchants: { id: string; name: string; currency: Currency }[]
}) {
  const router = useRouter()
  const fieldId = useId()

  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  )
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
  const [copyFailed, setCopyFailed] = useState(false)

  function clearError(field: keyof FieldErrors) {
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

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
    setCopyFailed(false)
    // A fresh key for the next card. Retries of *this* submission (a slow
    // response resent, a double click) reuse the key set below instead.
    setIdempotencyKey(crypto.randomUUID())
  }

  function handleOpenChange(open: boolean) {
    // Drawer closed: drop the one-time reveal state along with the rest of
    // the form. Nothing from `reveal` may outlive this.
    if (!open) resetState()
  }

  function handleMerchantChange(id: string) {
    setMerchantId(id)
    clearError("merchantId")
    // The server rejects a currency that doesn't match the merchant's, so
    // the select below locks to this and stops being editable.
    const merchant = merchants.find((candidate) => candidate.id === id)
    if (merchant) setCurrency(merchant.currency)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextErrors: FieldErrors = {}
    if (!nickname.trim()) nextErrors.nickname = "Nickname is required."
    if (!merchantId) nextErrors.merchantId = "Select a merchant."

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
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
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
    try {
      await navigator.clipboard.writeText(reveal.number)
      setCopied(true)
      setCopyFailed(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFailed(true)
    }
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
                <Field
                  label="Nickname"
                  htmlFor={`${fieldId}-nickname`}
                  error={errors.nickname}
                >
                  <Input
                    id={`${fieldId}-nickname`}
                    value={nickname}
                    onChange={(event) => {
                      setNickname(event.target.value)
                      clearError("nickname")
                    }}
                    placeholder="e.g. Contractor tools"
                    required
                    hasError={Boolean(errors.nickname)}
                  />
                </Field>

                <SelectField
                  label="Merchant"
                  htmlFor={`${fieldId}-merchant`}
                  error={errors.merchantId}
                  value={merchantId}
                  onValueChange={handleMerchantChange}
                  options={merchants.map((m) => ({ value: m.id, label: m.name }))}
                  placeholder="Select a merchant"
                />

                <Field
                  label="Spend limit"
                  htmlFor={`${fieldId}-limit`}
                  error={errors.limit}
                  helper={`Whole or decimal amount in ${currency}, e.g. 250 or 250.00.`}
                >
                  <Input
                    id={`${fieldId}-limit`}
                    inputMode="decimal"
                    value={limitInput}
                    onChange={(event) => {
                      setLimitInput(event.target.value)
                      clearError("limit")
                    }}
                    placeholder="250.00"
                    required
                    hasError={Boolean(errors.limit)}
                  />
                </Field>

                <SelectField
                  label="Currency"
                  htmlFor={`${fieldId}-currency`}
                  error={errors.currency}
                  helper={
                    merchantId
                      ? "Locked to the selected merchant's currency."
                      : "Choose a merchant to set this automatically."
                  }
                  value={currency}
                  disabled={Boolean(merchantId)}
                  onValueChange={(value) => {
                    setCurrency(value as Currency)
                    clearError("currency")
                  }}
                  options={CURRENCIES.map((code) => ({ value: code, label: code }))}
                  placeholder="Currency"
                />

                <SelectField
                  label={
                    <>
                      Category{" "}
                      <span className="font-normal text-gray-500">
                        (optional)
                      </span>
                    </>
                  }
                  htmlFor={`${fieldId}-category`}
                  helper="Locks the card to this spending category. Cannot be changed after issue."
                  value={category}
                  onValueChange={(value) => setCategory(value as CardCategory)}
                  options={CATEGORIES.map((value) => ({
                    value,
                    label: humanizeCategory(value),
                  }))}
                  placeholder="No category"
                />

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
              <DrawerDescription>{reveal?.card.nickname}</DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <div className="flex flex-col gap-4">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-500">
                  This is the only time the full card number will be shown.
                  Copy it now — it won&apos;t be shown again.
                </p>

                <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                  <p className="font-mono text-lg tracking-wider text-gray-900 dark:text-gray-50">
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
                {copyFailed && (
                  <p className="text-sm text-red-600 dark:text-red-500">
                    Couldn&apos;t copy automatically — select the number above
                    and copy it manually.
                  </p>
                )}

                <Divider />

                <dl className="grid grid-cols-2 gap-y-3 text-sm">
                  <dt className="text-gray-500">Spend limit</dt>
                  <dd className="text-gray-900 dark:text-gray-50">
                    {reveal &&
                      formatMoney(reveal.card.limitMinorUnits, reveal.card.currency)}
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
