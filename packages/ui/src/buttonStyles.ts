export type ButtonSize = 'sm' | 'md' | 'lg'
export type ButtonTone = 'primary' | 'neutral' | 'sky' | 'cyan' | 'purple' | 'warning' | 'danger'
/**
 * `solid` and `soft` are filled, `ghost` is borderless until hovered, and `overlay`
 * is dark translucent glass for controls drawn over maps and imagery; it looks the
 * same in light and dark themes.
 */
export type ButtonVariant = 'solid' | 'soft' | 'ghost' | 'overlay'

export interface ButtonStyleOptions {
  size?: ButtonSize
  tone?: ButtonTone
  variant?: ButtonVariant
  /** Square, icon-only proportions. */
  iconOnly?: boolean
  fullWidth?: boolean
  /** Fully rounded ends (a circle when icon-only). */
  pill?: boolean
  /** Omit hover and pointer styling, for a non-interactive badge that matches a button. */
  inert?: boolean
  className?: string
}

const BASE = 'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 disabled:cursor-not-allowed disabled:opacity-45'

// Icon-only buttons carry a slightly larger glyph, since the icon is all there is.
const SIZES: Record<ButtonSize, { text: string; icon: string; radius: string; glyph: string; iconGlyph: string }> = {
  sm: { text: 'h-6 gap-1 px-2 text-[10px] font-semibold', icon: 'h-6 w-6', radius: 'rounded-md', glyph: '[&>svg]:size-3', iconGlyph: '[&>svg]:size-3.5' },
  md: { text: 'h-8 gap-1.5 px-3 text-xs font-semibold', icon: 'h-8 w-8', radius: 'rounded-lg', glyph: '[&>svg]:size-3.5', iconGlyph: '[&>svg]:size-4' },
  lg: { text: 'h-10 gap-2 px-5 text-sm font-semibold', icon: 'h-10 w-10', radius: 'rounded-xl', glyph: '[&>svg]:size-4', iconGlyph: '[&>svg]:size-5' },
}

// [resting, hover] per variant and tone. Every class is a complete literal so Tailwind finds it in dist.
const TONES: Record<ButtonVariant, Record<ButtonTone, [string, string]>> = {
  solid: {
    primary: ['border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-600/30', 'hover:bg-indigo-500'],
    neutral: ['border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200', 'hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-white'],
    sky: ['border-sky-400 bg-sky-500 text-white shadow-sm shadow-sky-500/30', 'hover:bg-sky-400'],
    cyan: ['border-cyan-400 bg-cyan-600 text-white shadow-sm shadow-cyan-600/30', 'hover:bg-cyan-500'],
    purple: ['border-purple-400 bg-purple-600 text-white shadow-sm shadow-purple-600/30', 'hover:bg-purple-500'],
    warning: ['border-amber-400 bg-amber-500 text-white shadow-sm shadow-amber-500/30', 'hover:bg-amber-400'],
    danger: ['border-rose-400/40 bg-rose-500 text-white shadow-sm shadow-rose-500/30', 'hover:bg-rose-600'],
  },
  soft: {
    primary: ['border-indigo-500/30 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300', 'hover:bg-indigo-500/25'],
    neutral: ['border-slate-300/70 bg-slate-500/10 text-slate-700 dark:border-white/10 dark:text-slate-200', 'hover:bg-slate-500/20'],
    sky: ['border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300', 'hover:bg-sky-500/25'],
    cyan: ['border-cyan-500/30 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300', 'hover:bg-cyan-500/25'],
    purple: ['border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-300', 'hover:bg-purple-500/25'],
    warning: ['border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300', 'hover:bg-amber-500/25'],
    danger: ['border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300', 'hover:bg-rose-500/25'],
  },
  ghost: {
    primary: ['border-transparent text-indigo-600 dark:text-indigo-400', 'hover:bg-indigo-50 dark:hover:bg-indigo-500/10'],
    neutral: ['border-transparent text-slate-500 dark:text-slate-400', 'hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white'],
    sky: ['border-transparent text-sky-600 dark:text-sky-400', 'hover:bg-sky-50 dark:hover:bg-sky-500/10'],
    cyan: ['border-transparent text-cyan-600 dark:text-cyan-400', 'hover:bg-cyan-50 dark:hover:bg-cyan-500/10'],
    purple: ['border-transparent text-purple-600 dark:text-purple-400', 'hover:bg-purple-50 dark:hover:bg-purple-500/10'],
    warning: ['border-transparent text-amber-600 dark:text-amber-400', 'hover:bg-amber-50 dark:hover:bg-amber-500/10'],
    danger: ['border-transparent text-rose-500 dark:text-rose-400', 'hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300'],
  },
  overlay: {
    primary: ['border-indigo-400 bg-indigo-500/90 text-white shadow-sm shadow-indigo-500/20 backdrop-blur-md', 'hover:bg-indigo-400'],
    neutral: ['border-white/10 bg-black/60 text-white/80 shadow-sm backdrop-blur-md', 'hover:bg-black/80 hover:text-white'],
    sky: ['border-sky-400/40 bg-sky-500/25 text-sky-200 shadow-sm backdrop-blur-md', 'hover:bg-sky-500/35'],
    cyan: ['border-cyan-400/40 bg-cyan-500/20 text-cyan-200 shadow-sm backdrop-blur-md', 'hover:bg-cyan-500/30'],
    purple: ['border-purple-400/40 bg-purple-500/25 text-purple-200 shadow-sm backdrop-blur-md', 'hover:bg-purple-500/35'],
    warning: ['border-amber-400/40 bg-amber-500/20 text-amber-200 shadow-sm backdrop-blur-md', 'hover:bg-amber-500/30'],
    danger: ['border-rose-400/40 bg-rose-500/25 text-rose-100 shadow-sm backdrop-blur-md', 'hover:bg-rose-500/35'],
  },
}

/** The class list of a {@link Button}, for links and badges that must look like one. */
export function buttonClassName({ size = 'md', tone = 'neutral', variant = 'solid', iconOnly = false, fullWidth = false, pill = false, inert = false, className = '' }: ButtonStyleOptions = {}): string {
  const sizing = SIZES[size]
  const [resting, hover] = TONES[variant][tone]
  return [BASE, iconOnly ? sizing.icon : sizing.text, pill ? 'rounded-full' : sizing.radius, iconOnly ? sizing.iconGlyph : sizing.glyph, resting, inert ? '' : `cursor-pointer ${hover}`, fullWidth ? 'w-full' : '', className].filter(Boolean).join(' ')
}
