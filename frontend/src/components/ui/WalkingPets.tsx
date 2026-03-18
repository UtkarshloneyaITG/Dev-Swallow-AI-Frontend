import { useState, useEffect, useCallback, useRef } from 'react'

const BASE = 'https://raw.githubusercontent.com/tonybaloney/vscode-pets/main/media'

// ---------------------------------------------------------------------------
// Animation sets
// ---------------------------------------------------------------------------
const WALK_ANIMS   = ['walk', 'walk_fast', 'run', 'idle', 'lie']  // dogs & fox
const MONKEY_ANIMS = ['walk', 'run', 'idle']                       // monkey (verified in vscode-pets)

interface PetDef {
  animal: string
  variant: string
  anims: string[]
}

// ---------------------------------------------------------------------------
// Animal pool
// ---------------------------------------------------------------------------
const ALL_PETS: PetDef[] = [
  // Fox
  { animal: 'fox', variant: 'red',   anims: WALK_ANIMS },
  { animal: 'fox', variant: 'white', anims: WALK_ANIMS },
  // Dogs
  { animal: 'dog', variant: 'white', anims: WALK_ANIMS },
  { animal: 'cat', variant: 'brown', anims: WALK_ANIMS },
  // Monkey (vscode-pets, gray variant)
  { animal: 'monkey', variant: 'gray', anims: MONKEY_ANIMS },
]

// Moving animations translate across the screen; stationary ones stay in place
const MOVING = new Set(['walk', 'walk_fast', 'run'])

// Duration each animation state lasts (ms)
const ANIM_MS: Record<string, number> = {
  walk:      16_000,
  walk_fast: 10_000,
  run:        7_000,
  idle:       4_500,
  lie:        6_500,
}

// Weighted animation picker — walking is most frequent
function pickNextAnim(anims: string[], current: string): string {
  const candidates = anims.filter((a) => a !== current)
  // Weight walking 2× heavier than stationary
  const weighted = candidates.flatMap((a) =>
    MOVING.has(a) ? [a, a] : [a]
  )
  return weighted[Math.floor(Math.random() * weighted.length)]
}

const MAX_PETS        = 3
const SPAWN_MIN_MS    = 8_000
const SPAWN_MAX_MS    = 18_000
const FADE_DURATION   = 500  // ms

let uid = 0

interface SpawnedPet extends PetDef { id: number }

// ---------------------------------------------------------------------------
// Single pet sprite — owns its own animation FSM + fade lifecycle
// ---------------------------------------------------------------------------
function PetSprite({
  pet,
  onDone,
}: {
  pet: SpawnedPet
  onDone: (id: number) => void
}) {
  const [anim, setAnim]         = useState(() => pickNextAnim(pet.anims, ''))
  const [stillPos, setStillPos] = useState(() => Math.floor(Math.random() * 60) + 15)
  const [opacity, setOpacity]   = useState(0)   // start invisible for fade-in
  const completedRef            = useRef(0)
  const exitingRef              = useRef(false)

  const moving = MOVING.has(anim)
  const ms     = ANIM_MS[anim] ?? 5_000
  const src    = `${BASE}/${pet.animal}/${pet.variant}_${anim}_8fps.gif`

  // Fade in on mount
  useEffect(() => {
    const t = setTimeout(() => setOpacity(1), 30)
    return () => clearTimeout(t)
  }, [])

  const exit = useCallback(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    setOpacity(0)
    setTimeout(() => onDone(pet.id), FADE_DURATION)
  }, [pet.id, onDone])

  const advance = useCallback(() => {
    if (exitingRef.current) return
    completedRef.current += 1
    // Exit after the pet has done enough animations
    if (completedRef.current >= pet.anims.length * 2) {
      exit()
      return
    }
    setAnim((prev) => pickNextAnim(pet.anims, prev))
    if (!MOVING.has(anim)) {
      setStillPos(Math.floor(Math.random() * 60) + 15)
    }
  }, [pet.anims, anim, exit])

  // Timer for stationary animations
  useEffect(() => {
    if (moving) return
    const t = setTimeout(advance, ms)
    return () => clearTimeout(t)
  }, [moving, ms, advance, anim])

  return (
    <div
      className="absolute bottom-0"
      style={{
        opacity,
        transition: `opacity ${FADE_DURATION}ms ease`,
        ...(moving ? {} : { left: `${stillPos}%` }),
      }}
    >
      {/* key on inner div restarts CSS animation on each anim change */}
      <div
        key={anim}
        style={moving ? { animation: `pet-walk ${ms}ms linear 1 forwards` } : {}}
        onAnimationEnd={moving ? advance : undefined}
      >
        <img
          src={src}
          alt={pet.animal}
          className="h-14 w-auto select-none"
          draggable={false}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Container — spawns pets at random intervals, no duplicate animals back-to-back
// active=false stops new spawns; existing pets walk off naturally
// ---------------------------------------------------------------------------
export default function WalkingPets({ active = true }: { active?: boolean }) {
  const [pets, setPets]       = useState<SpawnedPet[]>([])
  const lastAnimalRef         = useRef<string>('')

  const removePet = useCallback((id: number) => {
    setPets((prev) => prev.filter((p) => p.id !== id))
  }, [])

  useEffect(() => {
    if (!active) return   // stop spawning when not active; existing pets finish naturally

    let timeoutId: ReturnType<typeof setTimeout>

    function spawnNext() {
      // Pick a different animal from the last spawned one
      const pool = ALL_PETS.filter((p) => p.animal !== lastAnimalRef.current)
      const def  = pool[Math.floor(Math.random() * pool.length)]
      lastAnimalRef.current = def.animal

      const pet: SpawnedPet = { ...def, id: uid++ }
      setPets((prev) => {
        if (prev.length >= MAX_PETS) return prev   // wait until slot frees
        return [...prev, pet]
      })

      const delay = SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS)
      timeoutId = setTimeout(spawnNext, delay)
    }

    timeoutId = setTimeout(spawnNext, 800)
    return () => clearTimeout(timeoutId)
  }, [active])

  // Once inactive and all pets have walked off, render nothing
  if (!active && pets.length === 0) return null

  return (
    <div className="fixed bottom-3 left-0 right-0 pointer-events-none h-16 z-10 overflow-hidden">
      {pets.map((pet) => (
        <PetSprite key={pet.id} pet={pet} onDone={removePet} />
      ))}
    </div>
  )
}
