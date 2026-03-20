import { motion } from 'framer-motion'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'amber'

// Omit drag/animation props that conflict with framer-motion's motion.button
type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onAnimationStart' | 'onDragStart' | 'onDrag' | 'onDragEnd'
>

interface ButtonProps extends NativeButtonProps {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  loading?: boolean
  children: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-[rgb(var(--accent,_0_0_0))] text-[rgb(var(--accent-fg,_255_255_255))] hover:opacity-90 shadow-sm shadow-black/20',
  secondary: 'bg-white/60 dark:bg-slate-700/60 backdrop-blur-md border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 hover:border-black/20 dark:hover:border-white/20',
  ghost:     'text-slate-400 dark:text-slate-500 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5',
  danger:    'bg-rose-500 text-white hover:bg-rose-600 shadow-sm shadow-rose-500/30',
  amber:     'bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-500/30',
}

const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-sm gap-2',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  children,
  className = '',
  disabled,
  type = 'button',
  onClick,
  id,
  'aria-label': ariaLabel,
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <motion.button
      type={type}
      onClick={onClick}
      id={id}
      aria-label={ariaLabel}
      disabled={isDisabled}
      whileHover={isDisabled ? {} : { scale: 1.03 }}
      whileTap={isDisabled ? {} : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={[
        'inline-flex items-center justify-center rounded-full font-medium transition-colors duration-150 select-none',
        variantClasses[variant],
        sizeClasses[size],
        isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        className,
      ].join(' ')}
    >
      {loading && <Spinner size={18} />}
      {!loading && icon && iconPosition === 'left' && (
        <span className="w-4 h-4 flex items-center justify-center">{icon}</span>
      )}
      <span>{children}</span>
      {!loading && icon && iconPosition === 'right' && (
        <span className="w-4 h-4 flex items-center justify-center">{icon}</span>
      )}
    </motion.button>
  )
}
