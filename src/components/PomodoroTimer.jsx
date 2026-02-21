import { useState, useEffect } from 'react'

export default function PomodoroTimer() {
  const [timeLeft, setTimeLeft] = useState(25 * 60)
  const [isActive, setIsActive] = useState(false)
  const [isBreak, setIsBreak] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    let interval = null
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => time - 1)
      }, 1000)
    } else if (isActive && timeLeft === 0) {
      setIsActive(false)
      clearInterval(interval)
      // Switch mode and Auto-start
      if (isBreak) {
        setIsBreak(false)
        setTimeLeft(25 * 60)
      } else {
        setIsBreak(true)
        setTimeLeft(5 * 60)
      }
      setIsActive(true) // auto-start next phase
    } else if (!isActive && timeLeft !== 0) {
      clearInterval(interval)
    }
    return () => clearInterval(interval)
  }, [isActive, timeLeft, isBreak])

  const toggleTimer = () => setIsActive(!isActive)
  const resetTimer = () => {
    setIsActive(false)
    setTimeLeft(isBreak ? 5 * 60 : 25 * 60)
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const progress = isBreak
    ? ((5 * 60 - timeLeft) / (5 * 60)) * 100
    : ((25 * 60 - timeLeft) / (25 * 60)) * 100

  // If minimized, show a small floating button
  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-white/70 shadow-glass backdrop-blur-md transition-transform hover:scale-105"
      >
        <span className="text-2xl">⏳</span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-64 rounded-3xl border border-white/60 bg-white/40 p-5 shadow-glass backdrop-blur-md animate-fade-up">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          {isBreak ? '☕ Break Time' : '🧠 Focus Mode'}
        </h3>
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="rounded-full p-1 text-slate-400 hover:bg-white/50 hover:text-slate-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center gap-3">
        {/* Circular Progress (simplified with a progress bar for now) */}
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white/50 shadow-neu-inset">
          <svg className="absolute h-full w-full -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="44"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-white/30"
            />
            <circle
              cx="48"
              cy="48"
              r="44"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray="276"
              strokeDashoffset={276 - (276 * progress) / 100}
              className={`transition-all duration-1000 ${isBreak ? 'text-accent2' : 'text-accent'}`}
            />
          </svg>
          <span className="relative z-10 text-2xl font-bold tracking-tight text-slate-700">
            {formatTime(timeLeft)}
          </span>
        </div>

        <div className="flex w-full justify-center gap-2">
          <button
            type="button"
            onClick={toggleTimer}
            className={`flex-1 rounded-2xl px-4 py-2 text-xs font-semibold text-white shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm active:translate-y-0 active:shadow-neu-inset ${
              isActive ? 'bg-rose-400' : 'bg-accent'
            }`}
          >
            {isActive ? 'Pause' : 'Start'}
          </button>
          <button
            type="button"
            onClick={resetTimer}
            className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm active:translate-y-0 active:shadow-neu-inset"
          >
            Reset
          </button>
        </div>

        <div className="flex gap-2">
          <button
             type="button"
             onClick={() => {
               setIsBreak(false)
               setTimeLeft(25 * 60)
               setIsActive(false)
             }}
             className={`text-[10px] font-semibold uppercase tracking-wider ${!isBreak ? 'text-accent' : 'text-slate-400 hover:text-slate-600'}`}
          >
             Focus
          </button>
          <span className="text-[10px] text-slate-300">|</span>
          <button
             type="button"
             onClick={() => {
               setIsBreak(true)
               setTimeLeft(5 * 60)
               setIsActive(false)
             }}
             className={`text-[10px] font-semibold uppercase tracking-wider ${isBreak ? 'text-accent2' : 'text-slate-400 hover:text-slate-600'}`}
          >
             Break
          </button>
        </div>
      </div>
    </div>
  )
}
