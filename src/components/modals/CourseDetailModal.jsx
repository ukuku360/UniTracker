import { useMemo } from 'react'
import {
  formatDateShort,
  getGoalRequirement,
  toNumberOrNull,
} from '../../hooks/useDashboardDomain'

export default function CourseDetailModal({
  course,
  assessments,
  average,
  wamGoalNumber,
  onClose,
  onViewHandbook,
  onImportAssessments,
  onAddAssessment,
  onEditAssessment,
}) {
  const [upcoming, completed] = useMemo(() => {
    const upcomingItems = []
    const completedItems = []
    assessments.forEach((assessment) => {
      if (assessment.completed) {
        completedItems.push(assessment)
      } else {
        upcomingItems.push(assessment)
      }
    })
    return [upcomingItems, completedItems]
  }, [assessments])

  if (!course) return null

  const targetValue = toNumberOrNull(course.targetMark ?? wamGoalNumber)
  const targetSource =
    course.targetMark !== null && course.targetMark !== undefined
      ? 'Course target'
      : wamGoalNumber !== null
        ? 'WAM goal'
        : ''
  const goalStats = getGoalRequirement(assessments, targetValue)
  let requiredText = '--'
  let requiredTone = 'text-slate-500'
  let helperText = ''

  if (goalStats.status === 'no-target') {
    requiredText = 'Set a goal'
    helperText = 'Add a course target or WAM goal.'
  } else if (goalStats.status === 'no-assessments') {
    requiredText = 'Add assessments'
    helperText = 'Need weights to calculate.'
  } else if (goalStats.status === 'complete') {
    requiredText =
      goalStats.currentAverage === null
        ? 'All graded'
        : `Final ${goalStats.currentAverage.toFixed(1)}%`
    helperText = 'All assessments graded.'
  } else if (goalStats.status === 'active') {
    if (goalStats.required <= 0) {
      requiredText = 'Goal secured'
      requiredTone = 'text-emerald-500'
    } else if (goalStats.required > 100) {
      requiredText = '>100%'
      requiredTone = 'text-rose-500'
    } else {
      requiredText = `${goalStats.required.toFixed(1)}%`
      requiredTone = 'text-slate-700'
    }
    helperText = `${goalStats.remainingWeight}% weight remaining`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 backdrop-blur-sm overscroll-contain">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-detail-title"
        aria-describedby="course-detail-description"
        className="w-full max-w-2xl rounded-3xl border border-white/50 bg-white/80 p-6 shadow-glass backdrop-blur-md"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Course Details
            </p>
            <h3
              id="course-detail-title"
              className="mt-2 text-xl font-semibold text-slate-800"
            >
              {course.name}
            </h3>
            <p
              id="course-detail-description"
              className="mt-1 text-xs text-slate-400"
            >
              {course.creditPoints} credit points · {assessments.length} items
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onViewHandbook && (
              <button
                type="button"
                onClick={onViewHandbook}
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-neu"
              >
                View details
              </button>
            )}
            {onImportAssessments && (
              <button
                type="button"
                onClick={onImportAssessments}
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-neu"
              >
                Import handbook
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-neu"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_1fr]">
          <section className="rounded-2xl bg-white/70 p-4 shadow-neu">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Course average</p>
                <p className="text-2xl font-semibold text-slate-700">
                  {average === null ? '--' : average.toFixed(1)}
                </p>
              </div>
              <button
                type="button"
                onClick={onAddAssessment}
                className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm active:translate-y-0 active:shadow-neu-inset"
              >
                + Assessment
              </button>
            </div>
          </section>

          <section className="rounded-2xl bg-white/70 p-4 shadow-neu">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Goal Planner
            </p>
            <div className="mt-2 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">Target mark</p>
                <p className="text-base font-semibold text-slate-700">
                  {targetValue === null ? '--' : `${targetValue.toFixed(1)}%`}
                </p>
                {targetSource && (
                  <p className="text-[11px] text-slate-400">{targetSource}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Required on remaining</p>
                <p className={`text-base font-semibold ${requiredTone}`}>
                  {requiredText}
                </p>
              </div>
            </div>
            {helperText && (
              <p className="mt-2 text-[11px] text-slate-400">{helperText}</p>
            )}
          </section>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl bg-white/70 p-4 shadow-neu">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Upcoming
            </p>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No upcoming assessments.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {upcoming.slice(0, 4).map((assessment) => (
                  <button
                    key={assessment.id}
                    type="button"
                    onClick={() => onEditAssessment(assessment)}
                    className="flex w-full items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-left text-xs text-slate-600 shadow-neu transition hover:shadow-neu-sm"
                  >
                    <div>
                      <p className="break-words font-semibold">{assessment.title}</p>
                      <p className="text-[11px] text-slate-400">
                        {assessment.type} · {formatDateShort(assessment.dueDate)}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {assessment.weight}%
                    </span>
                  </button>
                ))}
                {upcoming.length > 4 && (
                  <p className="text-[11px] text-slate-400">+{upcoming.length - 4} more</p>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white/70 p-4 shadow-neu">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Completed
            </p>
            {completed.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Nothing graded yet.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {completed.slice(0, 3).map((assessment) => (
                  <button
                    key={assessment.id}
                    type="button"
                    onClick={() => onEditAssessment(assessment)}
                    className="flex w-full items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-left text-xs text-slate-600 shadow-neu transition hover:shadow-neu-sm"
                  >
                    <div>
                      <p className="break-words font-semibold">{assessment.title}</p>
                      <p className="text-[11px] text-slate-400">
                        {assessment.type} · {assessment.score ?? '--'}%
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {assessment.weight}%
                    </span>
                  </button>
                ))}
                {completed.length > 3 && (
                  <p className="text-[11px] text-slate-400">+{completed.length - 3} more</p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
