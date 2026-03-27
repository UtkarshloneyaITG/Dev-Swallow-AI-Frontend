import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:      Variant
  size?:         Size
  loading?:      boolean
  icon?:         ReactNode
  iconPosition?: 'left' | 'right'
  children?:     ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 border-transparent',
  secondary: 'bg-black/5 dark:bg-white/5 text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/10 border-transparent',
  danger:    'bg-rose-500 hover:bg-rose-600 text-white border-transparent',
  ghost:     'bg-transparent hover:bg-black/5 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300 border-transparent',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7  px-3   text-xs  gap-1.5 rounded-lg',
  md: 'h-9  px-4   text-sm  gap-2   rounded-xl',
  lg: 'h-11 px-5   text-sm  gap-2   rounded-xl',
}

export default function Button({
  variant      = 'primary',
  size         = 'md',
  loading      = false,
  icon,
  iconPosition = 'left',
  disabled,
  className    = '',
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center font-medium border transition-all duration-150 select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading && <Spinner size={size === 'sm' ? 12 : 14} />}
      {!loading && icon && iconPosition === 'left' && icon}
      {children}
      {!loading && icon && iconPosition === 'right' && icon}
    </button>
  )
}
