export default function DeleteCourseModal({ open, course, busy, onCancel, onConfirm }) {
  if (!open || !course) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 backdrop-blur-sm overscroll-contain">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-course-title"
        aria-describedby="delete-course-description"
        className="w-full max-w-md rounded-3xl border border-white/50 bg-white/80 p-6 shadow-glass backdrop-blur-md"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Delete Course
            </p>
            <h3
              id="delete-course-title"
              className="mt-2 text-lg font-semibold text-slate-800"
            >
              Delete {course.name}?
            </h3>
            <p
              id="delete-course-description"
              className="mt-2 text-xs text-slate-400"
            >
              This removes the course and all of its assessments.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-neu disabled:cursor-not-allowed disabled:opacity-70"
          >
            Close
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-white/70 p-4 text-xs text-slate-500 shadow-neu">
          <p className="font-semibold text-slate-600">{course.code}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {course.creditPoints} credit points
          </p>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-neu disabled:cursor-not-allowed disabled:opacity-70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-2xl bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-neu disabled:cursor-not-allowed disabled:opacity-80"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
