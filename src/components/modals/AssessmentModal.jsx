import { useState } from 'react'
import {
  ASSESSMENT_TYPES,
  createId,
  toNumberOrNull,
} from '../../hooks/useDashboardDomain'

export default function AssessmentModal({
  open,
  mode,
  courseId,
  assessment,
  courses,
  onClose,
  onSave,
  onDelete,
}) {
  const [form, setForm] = useState(() => ({
    courseId: assessment?.courseId || courseId || '',
    title: assessment?.title || '',
    type: assessment?.type || ASSESSMENT_TYPES[0],
    dueDate: assessment?.dueDate || '',
    weight: assessment?.weight ?? '',
    score: assessment?.score ?? '',
    completed: assessment?.completed || false,
  }))
  const [error, setError] = useState('')

  if (!open) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!form.courseId) {
      setError('Please choose a course.')
      return
    }
    if (!form.title.trim()) {
      setError('Assessment title is required.')
      return
    }

    const weightNumber = Number(form.weight)
    if (!Number.isFinite(weightNumber) || weightNumber <= 0 || weightNumber > 100) {
      setError('Weight must be between 0 and 100.')
      return
    }

    const scoreNumber = toNumberOrNull(form.score)
    if (scoreNumber !== null && (scoreNumber < 0 || scoreNumber > 100)) {
      setError('Score must be between 0 and 100.')
      return
    }
    if (form.completed && scoreNumber === null) {
      setError('Add a score before marking an assessment as completed.')
      return
    }

    const payload = {
      id: assessment?.id || createId(),
      courseId: form.courseId,
      title: form.title.trim(),
      type: form.type,
      dueDate: form.dueDate || '',
      weight: weightNumber,
      score: scoreNumber,
      completed: Boolean(form.completed),
      mode,
    }
    onSave(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 backdrop-blur-sm overscroll-contain">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-modal-title"
        aria-describedby="assessment-modal-description"
        className="w-full max-w-lg rounded-3xl border border-white/50 bg-white/80 p-6 shadow-glass backdrop-blur-md"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3
              id="assessment-modal-title"
              className="text-lg font-semibold text-slate-700"
            >
              {mode === 'edit' ? 'Edit Assessment' : 'Add Assessment'}
            </h3>
            <p
              id="assessment-modal-description"
              className="text-xs text-slate-400"
            >
              Capture weight, due date, and completion status.
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
            Course
            <select
              name="courseId"
              value={form.courseId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, courseId: event.target.value }))
              }
              autoComplete="off"
              className="mt-2 w-full rounded-2xl bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <option value="" disabled>
                Select course…
              </option>
              {courses.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-500">
            Assessment title
            <input
              name="assessmentTitle"
              type="text"
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="e.g. Assignment 2…"
              autoComplete="off"
              className="mt-2 w-full rounded-2xl bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500">
              Type
              <select
                name="assessmentType"
                value={form.type}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, type: event.target.value }))
                }
                autoComplete="off"
                className="mt-2 w-full rounded-2xl bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {ASSESSMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Due date (optional)
              <input
                name="dueDate"
                type="date"
                value={form.dueDate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, dueDate: event.target.value }))
                }
                autoComplete="off"
                className="mt-2 w-full rounded-2xl bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500">
              Weight (%)
              <input
                name="assessmentWeight"
                type="number"
                value={form.weight}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, weight: event.target.value }))
                }
                placeholder="e.g. 20…"
                inputMode="decimal"
                autoComplete="off"
                className="mt-2 w-full rounded-2xl bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Score (%)
              <input
                name="assessmentScore"
                type="number"
                value={form.score}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, score: event.target.value }))
                }
                placeholder="e.g. 83…"
                inputMode="decimal"
                autoComplete="off"
                className="mt-2 w-full rounded-2xl bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </label>
          </div>

          <label className="flex items-center gap-3 text-xs font-semibold text-slate-500">
            <input
              name="assessmentCompleted"
              type="checkbox"
              checked={form.completed}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, completed: event.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300 text-accent focus-visible:ring-2 focus-visible:ring-accent"
            />
            Mark as Completed
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
            {mode === 'edit' && assessment && (
              <button
                type="button"
                onClick={() => onDelete(assessment.id)}
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
                {mode === 'edit' ? 'Save Changes' : 'Add Assessment'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
