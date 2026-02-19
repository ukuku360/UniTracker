import { useState } from 'react'
import {
  createId,
  getColorFromCode,
  normalizeCourseCode,
  toNumberOrNull,
} from '../../hooks/useDashboardDomain'

export default function CourseModal({
  open,
  mode,
  course,
  courses,
  handbookIndex,
  handbookStatus,
  onClose,
  onSave,
  onDelete,
}) {
  const [form, setForm] = useState(() => ({
    code: course?.code || '',
    targetMark: course?.targetMark ?? '',
  }))
  const [error, setError] = useState('')

  const normalizedCode = normalizeCourseCode(form.code)
  const matchedSubject = normalizedCode ? handbookIndex?.get(normalizedCode) : null
  const creditPointsValue = matchedSubject?.creditPoints

  if (!open) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!normalizedCode) {
      setError('Subject code is required.')
      return
    }
    if (!matchedSubject) {
      setError('No matching subject found in the handbook data.')
      return
    }

    const hasDuplicateCode = courses.some(
      (existing) =>
        normalizeCourseCode(existing.code) === normalizedCode &&
        existing.id !== course?.id,
    )
    if (hasDuplicateCode) {
      setError('This subject is already in your course list.')
      return
    }

    const targetValue = toNumberOrNull(form.targetMark)
    if (targetValue !== null && (targetValue < 0 || targetValue > 100)) {
      setError('Target mark must be between 0 and 100.')
      return
    }

    const nameValue = matchedSubject.name?.trim()
    const creditPointsNumber = Number(matchedSubject.creditPoints)

    if (!nameValue) {
      setError('Subject name is missing from handbook data.')
      return
    }
    if (!Number.isFinite(creditPointsNumber) || creditPointsNumber <= 0) {
      setError('Credit points are missing from handbook data.')
      return
    }

    const payload = {
      id: course?.id || createId(),
      code: normalizedCode,
      name: nameValue,
      creditPoints: creditPointsNumber,
      targetMark: targetValue,
      color: course?.color || getColorFromCode(normalizedCode),
      mode,
    }
    onSave(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 backdrop-blur-sm overscroll-contain">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-modal-title"
        aria-describedby="course-modal-description"
        className="w-full max-w-md rounded-3xl border border-white/50 bg-white/80 p-6 shadow-glass backdrop-blur-md"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3
              id="course-modal-title"
              className="text-lg font-semibold text-slate-700"
            >
              {mode === 'edit' ? 'Edit Course' : 'Add Course'}
            </h3>
            <p id="course-modal-description" className="text-xs text-slate-400">
              Enter a subject code to auto-fill the course details.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-neu"
          >
            Close
          </button>
        </div>

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="text-xs font-semibold text-slate-500">
            Subject code
            <input
              name="courseCode"
              type="text"
              value={form.code}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, code: event.target.value }))
              }
              placeholder="e.g. MAST10006"
              autoComplete="off"
              className="mt-2 w-full rounded-2xl bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>

          <div className="rounded-2xl bg-white/70 p-4 text-xs text-slate-500 shadow-neu">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Matched subject
            </p>
            {handbookStatus === 'loading' && (
              <p className="mt-2 text-slate-400">Loading handbook data…</p>
            )}
            {handbookStatus !== 'loading' && !normalizedCode && (
              <p className="mt-2 text-slate-400">Enter a subject code to match.</p>
            )}
            {handbookStatus !== 'loading' && normalizedCode && !matchedSubject && (
              <p className="mt-2 text-rose-500">No match found for {normalizedCode}.</p>
            )}
            {matchedSubject && (
              <div className="mt-2 space-y-2">
                <p className="text-sm font-semibold text-slate-700">
                  {matchedSubject.name}
                </p>
                <p className="text-[11px] text-slate-400">
                  {matchedSubject.code} · {creditPointsValue || '--'} credit points
                </p>
              </div>
            )}
          </div>

          <label className="text-xs font-semibold text-slate-500">
            Target mark (optional)
            <input
              name="targetMark"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.targetMark}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, targetMark: event.target.value }))
              }
              placeholder="e.g. 75…"
              inputMode="decimal"
              autoComplete="off"
              className="mt-2 w-full rounded-2xl bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Used in the goal planner to calculate required scores.
            </span>
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-2xl bg-red-100/70 px-3 py-2 text-xs text-red-500"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-between">
            {mode === 'edit' && course && (
              <button
                type="button"
                onClick={() => onDelete(course)}
                className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-red-500 shadow-neu"
              >
                Delete
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-neu"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-2xl bg-accent px-5 py-2 text-xs font-semibold text-white shadow-neu"
              >
                {mode === 'edit' ? 'Save Changes' : 'Add Course'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
