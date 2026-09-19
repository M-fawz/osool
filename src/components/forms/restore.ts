/**
 * Write a submitted `FormData` back over a form React has just reset.
 *
 * Shared by `ActionForm` and the sign-up form, the two places a Server Action
 * form must survive React 19's post-action reset.
 *
 * File inputs are skipped — a browser will not let a value be assigned to one,
 * and the upload step does not restore through here. `applicationId` and React's
 * own `$ACTION_*` fields are skipped because they are already correct and
 * writing to them would be meddling with the action's own plumbing.
 */
export function restore(form: HTMLFormElement | null, data: FormData | null) {
  if (!form || !data) return

  const values = new Map<string, string[]>()
  for (const [name, value] of data.entries()) {
    if (typeof value !== 'string') continue
    values.set(name, [...(values.get(name) ?? []), value])
  }

  for (const element of Array.from(form.elements)) {
    const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    const name = control.name
    if (!name || name.startsWith('$ACTION') || name === 'applicationId') continue
    if (control instanceof HTMLInputElement && control.type === 'file') continue

    const submittedValues = values.get(name)

    if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) {
      control.checked = Boolean(submittedValues?.includes(control.value))
      continue
    }

    if (submittedValues?.[0] !== undefined) control.value = submittedValues[0]
  }
}
