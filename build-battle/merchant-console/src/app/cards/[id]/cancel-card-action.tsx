"use client"

import { Button } from "@/components/Button"
import type { CardStatus } from "@/data/types"
import { useRouter } from "next/navigation"
import { useState } from "react"

/** Two-step cancel: nothing fires on the first click, only on "Confirm". Renders nothing once already cancelled. */
export function CancelCardAction({
  cardId,
  status,
}: {
  cardId: string
  status: CardStatus
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === "cancelled") return null

  async function handleConfirm() {
    setIsSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(data?.error ?? "Something went wrong. Try again.")
        setConfirming(false)
        return
      }

      router.refresh()
    } catch {
      setError("Something went wrong. Try again.")
      setConfirming(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-gray-500">
          Cancel this card? This can&apos;t be undone.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="py-1 text-xs"
          onClick={() => setConfirming(false)}
          disabled={isSubmitting}
        >
          Never mind
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="py-1 text-xs"
          onClick={handleConfirm}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Cancelling..." : "Confirm cancel"}
        </Button>
      </div>
    )
  }

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        className="py-1 text-xs"
        onClick={() => setConfirming(true)}
      >
        Cancel card
      </Button>
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-500">{error}</p>
      )}
    </div>
  )
}
