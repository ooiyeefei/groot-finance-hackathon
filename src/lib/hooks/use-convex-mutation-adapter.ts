'use client'

import { useState, useCallback } from 'react'
import { useMutation } from 'convex/react'
import type { FunctionReference, OptionalRestArgs, FunctionReturnType } from 'convex/server'

/**
 * Wraps a Convex useMutation to expose TanStack Query's .mutateAsync() / .isPending API.
 * This allows consumer components to stay unchanged during the fetch→Convex migration.
 *
 * Convex useMutation returns a plain async function. This adapter adds:
 * - .mutateAsync(args) — same as calling the function directly
 * - .isPending — tracks whether the mutation is in flight
 */
export function useConvexMutationAdapter<
  Mutation extends FunctionReference<'mutation', 'public'>,
>(mutation: Mutation) {
  const convexMutation = useMutation(mutation)
  const [isPending, setIsPending] = useState(false)

  const mutateAsync = useCallback(
    async (...args: OptionalRestArgs<Mutation>): Promise<FunctionReturnType<Mutation>> => {
      setIsPending(true)
      try {
        return await convexMutation(...args)
      } finally {
        setIsPending(false)
      }
    },
    [convexMutation]
  )

  return { mutateAsync, isPending }
}
