import type { ComponentPropsWithRef, ReactNode } from 'react'
import { buttonClassName, type ButtonStyleOptions } from './buttonStyles'

export interface ButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'color'>, Omit<ButtonStyleOptions, 'iconOnly' | 'inert' | 'className'> {
  /** Leading icon; SVG icons are sized to the button. */
  icon?: ReactNode
  /** Trailing icon, for example an arrow. */
  iconEnd?: ReactNode
  /**
   * Show only the icon, in a square button: the label (children) stays available to
   * screen readers and becomes the tooltip unless `title` is given.
   */
  hideLabel?: boolean
}

/**
 * A themed button. With `hideLabel`, or without children, it renders square around its
 * icon; without children give it an `aria-label`. Pass `type="submit"` explicitly; the
 * default is `button`.
 */
export function Button({ size, tone, variant, fullWidth, pill, icon, iconEnd, hideLabel = false, className, type = 'button', title, children, ...props }: ButtonProps) {
  const hasLabel = children !== undefined && children !== null && children !== false
  const iconOnly = hideLabel || !hasLabel
  const tooltip = title ?? (hideLabel && typeof children === 'string' ? children : undefined)
  return <button type={type} title={tooltip} className={buttonClassName({ size, tone, variant, fullWidth, pill, iconOnly, className })} {...props}>
    {icon}
    {hideLabel ? hasLabel && <span className="sr-only">{children}</span> : children}
    {!hideLabel && iconEnd}
  </button>
}
