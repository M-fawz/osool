'use client'

import * as React from 'react'
import { guardAction, type Unconfirmed } from '@/lib/actions/unconfirmed'
import { useHydrated } from '@/lib/hooks/use-hydrated'

/**
 * The action to hand to `useActionState`: the raw Server Action until React
 * has hydrated, and a guarded one after.
 *
 * ── Why not simply the guarded one ───────────────────────────────────────
 *
 * The guard is a client function, and a client function cannot be posted by a
 * browser that has no JavaScript. React decides how to render `<form action>`
 * on the server by looking at the action given to `useActionState`: a Server
 * Action reference carries `$$FORM_ACTION`, from which React writes the hidden
 * `$ACTION_*` inputs that make the form post without any script at all. Given a
 * client function instead, it writes `action="javascript:throw …"`, and every
 * form in the product stops working before hydration — the trap described in
 * form-state.tsx and action-form.tsx, arrived at by a different road.
 *
 * So the server render, and the client render that hydrates it, both see the
 * raw reference. The swap happens in the first effect after hydration. React
 * permits it: `useActionState` stores its action in a queue that each render
 * updates, while the dispatch function it returned — the one on the `<form>` —
 * keeps its identity. Nothing on the page re-renders differently for it.
 *
 * The cast on the raw branch is sound because the only thing that differs is
 * the type of `previous`, and an `Unconfirmed` can only be produced by the
 * guarded branch, which by then is the one running.
 */
export function useGuardedAction<State, Payload>(
  action: (previous: State | null, payload: Payload) => Promise<State>,
): (previous: State | Unconfirmed | null, payload: Payload) => Promise<State | Unconfirmed> {
  const hydrated = useHydrated()
  const guarded = React.useMemo(() => guardAction(action), [action])
  return hydrated
    ? guarded
    : (action as (previous: State | Unconfirmed | null, payload: Payload) => Promise<State>)
}
