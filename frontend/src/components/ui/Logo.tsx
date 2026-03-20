import logoSrc from '../../assests/logo.png'

interface LogoProps {
  size?: number
}

export default function Logo({ size = 42 }: LogoProps) {
  return (
    <div
      style={{ width: size, height: size }}
      className="relative flex-shrink-0 rounded-2xl overflow-hidden flex items-center justify-center"
    >
      {/* Logo-colour gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FFF0E6] via-[#FDDCC4] to-[#FBCFAA]" />
      {/* Subtle inner highlight */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
      <img
        src={logoSrc}
        alt="Swallow logo"
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        className="relative z-10 object-contain"
      />
    </div>
  )
}
