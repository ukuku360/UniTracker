export default function HandbookDetailModal({ open, subject, onClose }) {
  if (!open || !subject) return null

  const overviewItems = Array.isArray(subject.overview) ? subject.overview : []
  const instructorEmails = Array.isArray(subject.instructorEmails)
    ? subject.instructorEmails
    : []
  const subjectUrl = subject?.source?.subjectUrl || subject?.subjectUrl
  const assessmentUrl = subject?.source?.assessmentUrl || subject?.assessmentUrl

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 backdrop-blur-sm overscroll-contain">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="handbook-detail-title"
        aria-describedby="handbook-detail-description"
        className="w-full max-w-3xl rounded-3xl border border-white/50 bg-white/80 p-6 shadow-glass backdrop-blur-md"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Handbook
            </p>
            <h3
              id="handbook-detail-title"
              className="mt-2 text-xl font-semibold text-slate-800"
            >
              {subject.name}
            </h3>
            <p
              id="handbook-detail-description"
              className="mt-1 text-xs text-slate-400"
            >
              {subject.code} · {subject.creditPoints || '--'} credit points ·{' '}
              {subject.studyPeriod || 'Study period TBA'}{' '}
              {subject.year ? `(${subject.year})` : ''}
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

        <div className="mt-4 flex flex-wrap gap-2">
          {subjectUrl && (
            <a
              href={subjectUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm"
            >
              Open handbook
            </a>
          )}
          {assessmentUrl && (
            <a
              href={assessmentUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm"
            >
              Assessment details
            </a>
          )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl bg-white/70 p-4 text-xs text-slate-500 shadow-neu">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Key info
            </p>
            <div className="mt-3 space-y-2">
              <p>
                <span className="font-semibold text-slate-600">Code:</span>{' '}
                {subject.code || '--'}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Credit points:</span>{' '}
                {subject.creditPoints || '--'}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Study period:</span>{' '}
                {subject.studyPeriod || '--'}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Year:</span>{' '}
                {subject.year || '--'}
              </p>
            </div>
          </section>

          <section className="rounded-2xl bg-white/70 p-4 text-xs text-slate-500 shadow-neu">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Instructors
            </p>
            {instructorEmails.length ? (
              <div className="mt-3 space-y-2">
                {instructorEmails.map((email) => (
                  <a
                    key={email}
                    href={`mailto:${email}`}
                    className="block text-xs font-semibold text-slate-600 underline decoration-dotted"
                  >
                    {email}
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-slate-400">
                No instructor emails listed.
              </p>
            )}
          </section>
        </div>

        {subject.availability && (
          <section className="mt-4 rounded-2xl bg-white/70 p-4 text-xs text-slate-500 shadow-neu">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Availability
            </p>
            <p className="mt-2 whitespace-pre-line text-[11px] text-slate-500">
              {subject.availability}
            </p>
          </section>
        )}

        <section className="mt-4 rounded-2xl bg-white/70 p-4 text-xs text-slate-500 shadow-neu">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Overview
          </p>
          {overviewItems.length ? (
            <div className="mt-3 max-h-[45vh] space-y-3 overflow-y-auto pr-2 text-[11px] text-slate-500">
              {overviewItems.map((item, index) => (
                <p key={`${subject.code}-overview-${index}`} className="whitespace-pre-line">
                  {item}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-slate-400">
              No overview available for this subject.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
