import { useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { motion } from 'framer-motion'
import { User, Mail, Lock, ArrowRight } from 'lucide-react'
import Button from '../components/ui/Button'
import Logo from '../components/ui/Logo'
import BlobBackground from '../components/ui/BlobBackground'

export default function Register() {
  const navigate = useNavigate()
  const { register, user, isLoading } = useAuth()

  // Already logged in — send to dashboard
  if (!isLoading && user) return <Navigate to="/dashboard" replace />
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) { setError('Please enter your full name.'); return }
    if (!email.includes('@')) { setError('Please enter a valid email.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }

    setLoading(true)
    try {
      await register(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <BlobBackground />

      <motion.div
        className="relative w-full max-w-sm"
        initial={{ opacity: 0, scale: 0.98, filter: 'blur(4px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Card */}
        <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-md border border-white/80 dark:border-white/10 rounded-3xl shadow-2xl shadow-black/5 dark:shadow-black/30 p-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <Logo size={42} />
            <span className="text-xl font-light tracking-tight text-black dark:text-white">
              swallow
            </span>
          </div>

          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-2xl font-light tracking-tight text-black dark:text-white">
              Create account
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-light mt-1">
              Start migrating your Shopify data today
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="john wick"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-slate-700/60 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 focus:border-black/20 dark:focus:border-white/20 transition-all"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-slate-700/60 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 focus:border-black/20 dark:focus:border-white/20 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-slate-700/60 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 focus:border-black/20 dark:focus:border-white/20 transition-all"
                />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                At least 8 characters
              </p>
            </div>

            {/* Error */}
            {error && (
              <motion.p
                className="text-xs text-rose-500"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.p>
            )}

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              loading={loading}
              icon={<ArrowRight className="w-4 h-4" />}
              iconPosition="right"
            >
              Create account
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-slate-400 mt-6">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-slate-700 dark:text-slate-300 font-medium hover:text-black dark:hover:text-white transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-5">
          Shopify migration made effortless
        </p>
      </motion.div>
    </div>
  )
}
