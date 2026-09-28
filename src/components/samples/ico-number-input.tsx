'use client'

import { forwardRef, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { lastSegmentRange } from '@/lib/ico-number'

/**
 * An ICO number input that takes focus with the cursor on the mark's last
 * segment (the lot), so a copied ICO is corrected by typing only that part.
 *
 * The selection is applied on focus (keyboard, autofocus), again a frame
 * later (tabbing in selects everything after focus fires), and on the mouseup
 * that ends the click which focused the field, because the browser places
 * the caret at the click point after focus has fired. A click into a
 * field that already has focus is left alone. `data-select-on-focus` tells
 * hosts that select a focused input whole (InlineEdit) to leave this one.
 */
export const IcoNumberInput = forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>(
  function IcoNumberInput({ onFocus, onMouseDown, onMouseUp, ...props }, ref) {
    const focusingClick = useRef(false)
    const selectLot = (el: HTMLInputElement) => {
      const { start, end } = lastSegmentRange(el.value)
      el.setSelectionRange(start, end)
    }
    return (
      <Input
        ref={ref}
        autoComplete="off"
        {...props}
        data-select-on-focus="last-segment"
        onMouseDown={(e) => {
          focusingClick.current = document.activeElement !== e.currentTarget
          onMouseDown?.(e)
        }}
        onFocus={(e) => {
          const el = e.currentTarget
          selectLot(el)
          // Tabbing in selects the whole value after focus has fired; take
          // the lot back unless the user has placed the caret meanwhile.
          requestAnimationFrame(() => {
            if (document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === el.value.length) {
              selectLot(el)
            }
          })
          onFocus?.(e)
        }}
        onMouseUp={(e) => {
          if (focusingClick.current) {
            focusingClick.current = false
            e.preventDefault()
            selectLot(e.currentTarget)
          }
          onMouseUp?.(e)
        }}
      />
    )
  },
)
