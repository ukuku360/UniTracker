import { useState } from 'react'
import { format, isSameMonth, isToday, parseISO } from 'date-fns'
import {
  AUTH_VIEWS,
  DUE_SOON_DAYS,
  MAX_COURSES,
  formatDateTime,
  normalizeCourseCode,
  useDashboardDomain,
} from './hooks/useDashboardDomain'
import ProfileModal from './components/modals/ProfileModal'
import CourseDetailModal from './components/modals/CourseDetailModal'
import CourseModal from './components/modals/CourseModal'
import DeleteCourseModal from './components/modals/DeleteCourseModal'
import HandbookDetailModal from './components/modals/HandbookDetailModal'
import AssessmentModal from './components/modals/AssessmentModal'

function App() {
  const {
    hasFirebaseConfig,
    authView,
    switchAuthView,
    authStatus,
    authError,
    authNotice,
    authBusy,
    user,
    dataStatus,
    courses,
    assessments,
    wamGoal,
    setWamGoal,
    monthCursor,
    setMonthCursor,
    selectedDate,
    setSelectedDate,
    courseModal,
    setCourseModal,
    courseDetailId,
    setCourseDetailId,
    deleteCoursePrompt,
    deleteCourseBusy,
    assessmentModal,
    setAssessmentModal,
    profileOpen,
    setProfileOpen,
    handbookDetail,
    setHandbookDetail,
    handbookStatus,
    handbookError,
    handbookMeta,
    handbookQuery,
    setHandbookQuery,
    handbookResultRef,
    normalizedHandbookQuery,
    handbookResult,
    courseMap,
    handbookIndex,
    assessmentsByCourse,
    courseAverages,
    wamGoalNumber,
    wamData,
    projectedWam,
    semesterTitle,
    handbookSubtitle,
    plannerSnapshot,
    primaryUrgentItem,
    primaryRiskCourse,
    assessmentsByDate,
    selectedDateAssessments,
    completedAssessmentCount,
    upcomingAssessmentCount,
    monthStart,
    calendarDays,
    displayName,
    showDisplayName,
    handleAuthSubmit,
    handleSignOut,
    openAddCourse,
    openEditCourse,
    openAddAssessment,
    openEditAssessment,
    openDeleteCoursePrompt,
    cancelDeleteCourse,
    confirmDeleteCourse,
    handleSaveCourse,
    handleSaveAssessment,
    handleDeleteAssessment,
    openHandbookDetailFromCourse,
    importHandbookAssessmentsForCourse,
  } = useDashboardDomain()

  if (authStatus === 'loading') {
    return <LoadingScreen label="Checking your session…" />
  }

  if (!hasFirebaseConfig) {
    return <ConfigMissingScreen />
  }

  if (!user) {
    return (
      <AuthScreen
        view={authView}
        error={authError}
        notice={authNotice}
        busy={authBusy}
        onSubmit={handleAuthSubmit}
        onToggleView={switchAuthView}
      />
    )
  }

  if (dataStatus === 'loading') {
    return <LoadingScreen label="Loading your dashboard…" />
  }

  const headerActionBase =
    'rounded-2xl px-4 py-2 text-xs font-semibold shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm active:translate-y-0 active:shadow-neu-inset'
  const headerActionSecondary = `${headerActionBase} bg-white text-slate-500`
  const headerActionPrimary = `${headerActionBase} bg-accent text-white`

  const handleImportFromHandbook = () => {
    if (!courseDetailId) return
    const result = importHandbookAssessmentsForCourse(courseDetailId)
    if (!result) return

    if (result.status === 'course-not-found') {
      window.alert('Unable to import: course not found.')
      return
    }

    if (result.status === 'subject-not-found') {
      window.alert(
        `No matching subject found in handbook for ${result.courseCode || 'this course'}.`,
      )
      return
    }

    if (result.status === 'no-importable-rows') {
      window.alert('No importable assessment rows found in handbook data.')
      return
    }

    if (result.status === 'no-new-items') {
      window.alert('No new handbook assessments to import for this course.')
      return
    }

    window.alert(
      `Imported ${result.imported} assessment(s) from handbook${
        result.skipped ? ` (${result.skipped} skipped as duplicates).` : '.'
      }`,
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-base via-base to-[#d5dbe6] text-slate-700">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-6 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-700 focus:shadow-neu"
      >
        Skip to content
      </a>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Student Dashboard
            </p>
            <h1 className="text-3xl font-semibold text-slate-800">{semesterTitle}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Track courses, assessments, and your WAM in one calm space.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden items-center gap-2 rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-neu sm:flex">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-emerald-400/80 shadow-sm"
              />
              <span>Signed in</span>
              {showDisplayName && (
                <>
                  <span aria-hidden="true" className="h-3 w-px bg-slate-200/80" />
                  <span className="max-w-[120px] truncate text-slate-600">
                    {displayName}
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className={headerActionSecondary}
            >
              Sign Out
            </button>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className={headerActionSecondary}
            >
              Profile
            </button>
            <button
              type="button"
              onClick={openAddCourse}
              className={headerActionPrimary}
            >
              + Add Course
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <section className="w-full rounded-2xl border border-white/60 bg-white/40 px-5 py-3 shadow-neu backdrop-blur-md lg:w-[560px] lg:flex-none">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  WAM
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-slate-800">
                    {wamData.wam === null ? '--' : wamData.wam.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-500">current</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {wamData.totalCredits || 0} CP tracked
                </p>
              </div>
              <label className="flex flex-col gap-2 text-xs font-semibold text-slate-500">
                <span className="uppercase tracking-[0.2em] text-[10px] text-slate-400">
                  WAM goal
                </span>
                <div className="flex items-center gap-2">
                  <input
                    id="wam-goal"
                    name="wamGoal"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={wamGoal}
                    onChange={(event) => setWamGoal(event.target.value)}
                    placeholder="e.g. 75…"
                    inputMode="decimal"
                    autoComplete="off"
                    className="w-full min-w-[180px] rounded-2xl bg-white/70 px-3 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
                {projectedWam !== null && (
                  <p className="text-[11px] text-slate-400">
                    Projected: {projectedWam.toFixed(2)}
                  </p>
                )}
              </label>
            </div>
          </section>

          <section className="w-full rounded-3xl border border-white/60 bg-white/35 p-6 shadow-glass backdrop-blur-md lg:flex-1">
            <div>
              <h3 className="text-base font-semibold text-slate-700">
                Due on {format(parseISO(selectedDate), 'MMMM d')}
              </h3>
              <p className="text-xs text-slate-400">
                {selectedDateAssessments.length
                  ? `${selectedDateAssessments.length} item(s)`
                  : 'No assessments due.'}
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {selectedDateAssessments.length === 0 ? (
                <div className="rounded-2xl bg-white/70 p-4 text-center text-sm text-slate-400 shadow-neu">
                  All clear. Use the + Assessment button inside a course card.
                </div>
              ) : (
                selectedDateAssessments.map((assessment) => (
                  <button
                    key={assessment.id}
                    type="button"
                    onClick={() => openEditAssessment(assessment)}
                    className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 text-left shadow-neu transition hover:shadow-neu-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor:
                            courseMap.get(assessment.courseId)?.color || '#cbd5f5',
                        }}
                      />
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-slate-700">
                          {assessment.title}
                        </p>
                        <p className="text-xs text-slate-400">
                          {courseMap.get(assessment.courseId)?.name || 'Course'} ·{' '}
                          {assessment.type}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <p>{assessment.weight}%</p>
                      <p>
                        {assessment.completed
                          ? `${assessment.score ?? '--'}%`
                          : 'Pending'}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-white/60 bg-white/55 p-6 shadow-neu">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-700">Action Center</h2>
              <p className="text-xs text-slate-400">
                Prioritized from deadlines and goal feasibility.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-neu">
              {plannerSnapshot.overdue.length + plannerSnapshot.dueSoon.length} open
              task(s)
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/80 p-4 shadow-neu">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Overdue
              </p>
              <p className="mt-2 text-2xl font-semibold text-rose-500">
                {plannerSnapshot.overdue.length}
              </p>
              <p className="text-[11px] text-slate-400">Past due and not completed</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-4 shadow-neu">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Due in {DUE_SOON_DAYS} days
              </p>
              <p className="mt-2 text-2xl font-semibold text-amber-500">
                {plannerSnapshot.dueSoon.length}
              </p>
              <p className="text-[11px] text-slate-400">Upcoming deadlines</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-4 shadow-neu">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                At risk courses
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-700">
                {plannerSnapshot.atRiskCourses.length}
              </p>
              <p className="text-[11px] text-slate-400">
                Need above 100% to hit target
              </p>
            </div>
          </div>

          {(primaryUrgentItem || primaryRiskCourse) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {primaryUrgentItem && (
                <button
                  type="button"
                  onClick={() => openEditAssessment(primaryUrgentItem.assessment)}
                  className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm"
                >
                  Open urgent task:{' '}
                  {courseMap.get(primaryUrgentItem.assessment.courseId)?.code || 'Course'}
                  {' · '}
                  {primaryUrgentItem.daysUntil < 0
                    ? `${Math.abs(primaryUrgentItem.daysUntil)}d overdue`
                    : primaryUrgentItem.daysUntil === 0
                      ? 'Due today'
                      : `Due in ${primaryUrgentItem.daysUntil}d`}
                </button>
              )}
              {primaryRiskCourse && (
                <button
                  type="button"
                  onClick={() => setCourseDetailId(primaryRiskCourse.course.id)}
                  className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm"
                >
                  Review risk: {primaryRiskCourse.course.code} (needs{' '}
                  {primaryRiskCourse.required.toFixed(1)}%)
                </button>
              )}
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="flex flex-col gap-5">
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-600">Courses</h2>
                <span className="text-xs text-slate-400">
                  {courses.length}/{MAX_COURSES}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {courses.length === 0 ? (
                  <div className="rounded-2xl bg-white/50 p-6 text-center shadow-neu">
                    <p className="text-sm text-slate-500">
                      No courses yet. Add your first course to get started.
                    </p>
                    <button
                      type="button"
                      onClick={openAddCourse}
                      className="mt-4 rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm active:translate-y-0 active:shadow-neu-inset"
                    >
                      Add Course
                    </button>
                  </div>
                ) : (
                  courses.map((course) => {
                    const courseAssessments = assessmentsByCourse.get(course.id) || []
                    const upcoming = []
                    const completed = []
                    courseAssessments.forEach((assessment) => {
                      if (assessment.completed) {
                        completed.push(assessment)
                      } else {
                        upcoming.push(assessment)
                      }
                    })
                    const average = courseAverages.get(course.id)

                    return (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => setCourseDetailId(course.id)}
                        className="w-full rounded-2xl bg-white/80 p-3 text-left shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: course.color }}
                            />
                            <div className="min-w-0">
                              <h3 className="break-words text-sm font-semibold text-slate-800">
                                {course.name}
                              </h3>
                              <p className="text-[11px] text-slate-500">
                                {course.creditPoints} credit points ·{' '}
                                {courseAssessments.length} items
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                openEditCourse(course)
                              }}
                              className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-neu transition hover:shadow-neu-sm"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                const opened = openHandbookDetailFromCourse(course)
                                if (!opened) {
                                  window.alert(
                                    'No matching subject found in the handbook data.',
                                  )
                                }
                              }}
                              className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-neu transition hover:shadow-neu-sm"
                            >
                              View details
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                openDeleteCoursePrompt(course)
                              }}
                              className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-400 shadow-neu transition hover:text-red-500"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                          <span>Average</span>
                          <span className="font-semibold text-slate-700">
                            {average === null ? '--' : average.toFixed(1)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                          <span>Upcoming: {upcoming.length}</span>
                          <span>Completed: {completed.length}</span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </section>
          </aside>

          <main id="main-content" className="flex flex-col gap-6">
            <section className="rounded-3xl bg-white/70 p-6 shadow-neu">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-700">Handbook lookup</h2>
                  <p className="text-xs text-slate-400">{handbookSubtitle}</p>
                  {handbookMeta?.generatedAt && (
                    <p className="text-[11px] text-slate-400">
                      Updated {formatDateTime(handbookMeta.generatedAt)}
                    </p>
                  )}
                </div>
              </div>

              <form
                onSubmit={(event) => event.preventDefault()}
                className="mt-4 flex flex-wrap gap-3"
              >
                <label className="flex flex-1 flex-col gap-2 text-xs font-semibold text-slate-500">
                  <span className="uppercase tracking-[0.2em] text-[10px] text-slate-400">
                    Subject code
                  </span>
                  <input
                    name="handbookCode"
                    type="text"
                    value={handbookQuery}
                    onChange={(event) =>
                      setHandbookQuery(normalizeCourseCode(event.target.value))
                    }
                    placeholder="e.g. MAST10006"
                    autoComplete="off"
                    className="w-full rounded-2xl bg-white/80 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  />
                </label>
              </form>

              {handbookStatus === 'loading' && (
                <p className="mt-4 text-xs text-slate-400">Loading handbook data…</p>
              )}

              {handbookStatus === 'error' && (
                <p className="mt-4 rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-500">
                  {handbookError}
                </p>
              )}

              {handbookStatus === 'ready' && normalizedHandbookQuery && !handbookResult && (
                <p className="mt-4 text-xs text-slate-400">
                  No match found for {normalizedHandbookQuery}.
                </p>
              )}

              {handbookResult && (
                <div ref={handbookResultRef} className="mt-4">
                  <button
                    type="button"
                    onClick={() => setHandbookDetail(handbookResult)}
                    className="w-full rounded-2xl border border-white/60 bg-white/80 p-4 text-left shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-800">
                          {handbookResult.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {handbookResult.code} · {handbookResult.creditPoints || '--'}
                          {' credit points'}
                        </p>
                      </div>
                      <span className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent">
                        View details
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </section>

            <section className="rounded-3xl bg-white/70 p-6 shadow-neu">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-700">
                    {format(monthCursor, 'MMMM yyyy')}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Click a date to see what&apos;s due.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setMonthCursor(
                        new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1),
                      )
                    }
                    className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-neu transition hover:shadow-neu-sm"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setMonthCursor(new Date())}
                    className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-neu transition hover:shadow-neu-sm"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMonthCursor(
                        new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1),
                      )
                    }
                    className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-neu transition hover:shadow-neu-sm"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayLabel) => (
                  <span key={dayLabel}>{dayLabel}</span>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-7 gap-2">
                {calendarDays.map((calendarDay) => {
                  const key = format(calendarDay, 'yyyy-MM-dd')
                  const dayAssessments = assessmentsByDate.get(key) || []
                  const isCurrentMonth = isSameMonth(calendarDay, monthStart)
                  const isSelected = selectedDate === key

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDate(key)}
                      className={`flex h-20 flex-col items-start justify-between rounded-2xl p-2 text-left text-sm transition ${
                        isSelected
                          ? 'bg-white shadow-neu-inset'
                          : 'bg-white/60 shadow-neu hover:shadow-neu-sm'
                      } ${isCurrentMonth ? 'text-slate-700' : 'text-slate-400'}`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span
                          className={`text-sm font-semibold ${
                            isToday(calendarDay) ? 'text-accent' : ''
                          }`}
                        >
                          {format(calendarDay, 'd')}
                        </span>
                        {dayAssessments.length > 0 && (
                          <span className="text-[10px] text-slate-400">
                            {dayAssessments.length}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {dayAssessments.slice(0, 3).map((assessment) => (
                          <span
                            key={assessment.id}
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor:
                                courseMap.get(assessment.courseId)?.color || '#cbd5f5',
                            }}
                          />
                        ))}
                        {dayAssessments.length > 3 && (
                          <span className="text-[10px] text-slate-400">+</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          </main>
        </div>
      </div>

      {courseModal.open && (
        <CourseModal
          key={courseModal.course?.id || 'new-course'}
          open={courseModal.open}
          mode={courseModal.mode}
          course={courseModal.course}
          courses={courses}
          handbookIndex={handbookIndex}
          handbookStatus={handbookStatus}
          onClose={() => setCourseModal({ open: false, mode: 'add', course: null })}
          onSave={(payload) => {
            handleSaveCourse(payload)
            setCourseModal({ open: false, mode: 'add', course: null })
          }}
          onDelete={(course) => {
            openDeleteCoursePrompt(course)
            setCourseModal({ open: false, mode: 'add', course: null })
          }}
        />
      )}

      {courseDetailId && (
        <CourseDetailModal
          course={courseMap.get(courseDetailId)}
          assessments={assessmentsByCourse.get(courseDetailId) || []}
          average={courseAverages.get(courseDetailId) ?? null}
          wamGoalNumber={wamGoalNumber}
          onClose={() => setCourseDetailId(null)}
          onViewHandbook={() => {
            const selectedCourse = courseMap.get(courseDetailId)
            setCourseDetailId(null)
            const opened = openHandbookDetailFromCourse(selectedCourse)
            if (!opened) {
              window.alert('No matching subject found in the handbook data.')
            }
          }}
          onImportAssessments={handleImportFromHandbook}
          onAddAssessment={() => {
            const selectedId = courseDetailId
            setCourseDetailId(null)
            if (selectedId) {
              openAddAssessment(selectedId)
            }
          }}
          onEditAssessment={(assessment) => {
            setCourseDetailId(null)
            openEditAssessment(assessment)
          }}
        />
      )}

      {assessmentModal.open && (
        <AssessmentModal
          key={assessmentModal.assessment?.id || 'new-assessment'}
          open={assessmentModal.open}
          mode={assessmentModal.mode}
          courseId={assessmentModal.courseId}
          assessment={assessmentModal.assessment}
          courses={courses}
          onClose={() =>
            setAssessmentModal({
              open: false,
              mode: 'add',
              assessment: null,
              courseId: null,
            })
          }
          onSave={(payload) => {
            handleSaveAssessment(payload)
            setAssessmentModal({
              open: false,
              mode: 'add',
              assessment: null,
              courseId: null,
            })
          }}
          onDelete={(assessmentId) => {
            handleDeleteAssessment(assessmentId)
            setAssessmentModal({
              open: false,
              mode: 'add',
              assessment: null,
              courseId: null,
            })
          }}
        />
      )}

      {deleteCoursePrompt && (
        <DeleteCourseModal
          open={Boolean(deleteCoursePrompt)}
          course={deleteCoursePrompt}
          busy={deleteCourseBusy}
          onCancel={cancelDeleteCourse}
          onConfirm={confirmDeleteCourse}
        />
      )}

      {handbookDetail && (
        <HandbookDetailModal
          open={Boolean(handbookDetail)}
          subject={handbookDetail}
          onClose={() => setHandbookDetail(null)}
        />
      )}

      {profileOpen && (
        <ProfileModal
          open={profileOpen}
          user={user}
          dataStatus={dataStatus}
          courseCount={courses.length}
          assessmentCount={assessments.length}
          completedCount={completedAssessmentCount}
          upcomingCount={upcomingAssessmentCount}
          wam={wamData.wam}
          wamGoal={wamGoalNumber}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  )
}

function LoadingScreen({ label }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-base via-base to-[#d5dbe6] text-slate-700">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 py-12">
        <div className="w-full rounded-3xl bg-white/70 p-8 shadow-neu">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            UniTracker
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-800">{label}</h1>
          <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-accent/70" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfigMissingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-base via-base to-[#d5dbe6] text-slate-700">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 py-12">
        <div className="w-full rounded-3xl bg-white/70 p-8 shadow-neu">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Setup Required
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-800">
            Connect Firebase to enable accounts
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Add your Firebase web app config in `.env.local`, then restart the dev
            server.
          </p>
          <div className="mt-4 rounded-2xl bg-white/80 p-4 text-xs text-slate-500 shadow-neu">
            <p className="font-semibold text-slate-600">Required keys</p>
            <p className="mt-2">VITE_FIREBASE_API_KEY=</p>
            <p>VITE_FIREBASE_AUTH_DOMAIN=</p>
            <p>VITE_FIREBASE_PROJECT_ID=</p>
            <p>VITE_FIREBASE_APP_ID=</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function AuthScreen({ view, error, notice, busy, onSubmit, onToggleView }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const isSignUp = view === AUTH_VIEWS.signUp

  const handleSubmit = (event) => {
    event.preventDefault()
    const email = form.email.trim()
    const password = form.password
    if (!email || !password) return
    onSubmit({ email, password, mode: view })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-base via-base to-[#d5dbe6] text-slate-700">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/70 p-8 shadow-neu">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            UniTracker
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-800">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {isSignUp
              ? 'Sign up to sync courses and assessments across devices.'
              : 'Sign in to keep your semester dashboard in sync.'}
          </p>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="text-xs font-semibold text-slate-500">
              Email
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="you@university.edu"
                autoComplete="email"
                required
                className="mt-2 w-full rounded-2xl bg-white/80 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Password
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, password: event.target.value }))
                }
                placeholder="At least 6 characters…"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                minLength={6}
                required
                className="mt-2 w-full rounded-2xl bg-white/80 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-2xl bg-red-100/70 px-3 py-2 text-xs text-red-500"
              >
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-2xl bg-amber-100/70 px-3 py-2 text-xs text-amber-700">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="rounded-2xl bg-accent px-5 py-2 text-sm font-semibold text-white shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy ? 'Please wait…' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            {isSignUp ? 'Already have an account?' : "Don't have an account yet?"}{' '}
            <button
              type="button"
              onClick={() =>
                onToggleView(isSignUp ? AUTH_VIEWS.signIn : AUTH_VIEWS.signUp)
              }
              className="font-semibold text-accent"
            >
              {isSignUp ? 'Sign in' : 'Create one'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
