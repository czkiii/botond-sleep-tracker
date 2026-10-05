import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

// The native top layer makes the background inert and contains keyboard focus.
export function Modal({ children, className, label, busy = false, onClose }: {
  children: ReactNode; className: string; label: string; busy?: boolean; onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    const title = dialog.querySelector<HTMLElement>('h1, h2')
    if (title) title.tabIndex = -1
    ;(title ?? dialog).focus() // Do not initially focus a destructive action.
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      // React removes the nested crop dialog and clears the parent's inert
      // state in the same commit. Restore focus after that commit has finished.
      queueMicrotask(() => {
        if (previous?.isConnected) previous.focus()
        const parent = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).at(-1)
        if (parent && !parent.contains(document.activeElement)) {
          const heading = parent.querySelector<HTMLElement>('h1, h2')
          if (heading) { heading.tabIndex = -1; heading.focus() }
          else parent.focus()
        }
      })
    }
  }, [])
  useEffect(() => {
    const dialog = ref.current!
    if (dialog.open && !dialog.querySelector('dialog[open]') && !dialog.contains(document.activeElement)) {
      (dialog.querySelector<HTMLElement>('h1, h2') ?? dialog).focus()
    }
  })
  return <dialog ref={ref} tabIndex={-1} aria-label={label} aria-busy={busy || undefined}
    className={`native-modal ${className}`}
    onKeyDown={event => {
      if (event.key !== 'Tab' || (event.target as HTMLElement).closest('dialog') !== event.currentTarget) return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
      )).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest('[inert]'))
      const index = controls.indexOf(document.activeElement as HTMLElement)
      if (!controls.length) { event.preventDefault(); event.currentTarget.focus() }
      else if (index === -1 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
        event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0].focus()
      }
    }}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose() }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    {children}
  </dialog>
}
