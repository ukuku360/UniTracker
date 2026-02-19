import { formatDateTime, getSafeDisplayName } from '../../hooks/useDashboardDomain'

export default function ProfileModal({
  open,
  user,
  dataStatus,
  courseCount,
  assessmentCount,
  completedCount,
  upcomingCount,
  wam,
  wamGoal,
  onClose,
}) {
  if (!open) return null

  const displayName = getSafeDisplayName(user)
  const provider =
    user?.providerData?.[0]?.providerId ||
    user?.app_metadata?.provider ||
    user?.app_metadata?.providers?.[0] ||
    'email'
  const userId = user?.uid || user?.id
  const createdAt = user?.metadata?.creationTime || user?.created_at
  const lastSignIn =
    user?.metadata?.lastSignInTime || user?.last_sign_in_at || user?.last_sign_in
  const emailVerified =
    typeof user?.emailVerified === 'boolean'
      ? user.emailVerified
      : Boolean(user?.email_confirmed_at || user?.confirmed_at)
  const syncLabel = dataStatus === 'ready' ? 'Synced' : 'Syncing'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 backdrop-blur-sm overscroll-contain">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        aria-describedby="profile-modal-description"
        className="w-full max-w-lg rounded-3xl border border-white/50 bg-white/80 p-6 shadow-glass backdrop-blur-md"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Profile
            </p>
            <h3
              id="profile-modal-title"
              className="mt-2 text-xl font-semibold text-slate-800"
            >
              {displayName}
            </h3>
            <p
              id="profile-modal-description"
              className="mt-1 text-xs text-slate-400"
            >
              Account details are private.
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

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl bg-white/70 p-4 shadow-neu">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Account
            </p>
            <div className="mt-3 space-y-2 text-xs text-slate-500">
              <p>
                <span className="font-semibold text-slate-600">User ID:</span>{' '}
                {userId || '--'}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Provider:</span>{' '}
                {provider}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Email verified:</span>{' '}
                {emailVerified ? 'Yes' : 'No'}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Created:</span>{' '}
                {formatDateTime(createdAt)}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Last sign-in:</span>{' '}
                {formatDateTime(lastSignIn)}
              </p>
            </div>
          </section>

          <section className="rounded-2xl bg-white/70 p-4 shadow-neu">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Progress
            </p>
            <div className="mt-3 space-y-2 text-xs text-slate-500">
              <p>
                <span className="font-semibold text-slate-600">Courses:</span> {courseCount}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Assessments:</span>{' '}
                {assessmentCount}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Completed:</span>{' '}
                {completedCount}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Upcoming:</span>{' '}
                {upcomingCount}
              </p>
              <p>
                <span className="font-semibold text-slate-600">WAM:</span>{' '}
                {wam === null ? '--' : wam.toFixed(2)}
              </p>
              <p>
                <span className="font-semibold text-slate-600">WAM goal:</span>{' '}
                {wamGoal === null ? '--' : `${wamGoal.toFixed(1)}%`}
              </p>
            </div>
          </section>
        </div>

        <div className="mt-4 rounded-2xl bg-white/70 p-4 text-xs text-slate-500 shadow-neu">
          <p>
            <span className="font-semibold text-slate-600">Sync status:</span>{' '}
            {syncLabel}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Your dashboard is backed up to Firebase while you stay signed in.
          </p>
        </div>
      </div>
    </div>
  )
}
