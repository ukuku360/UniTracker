import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { supabase } from './lib/supabase'

const COURSE_COLORS = [
  { name: 'Soft Blue', value: '#7aa2f7' },
  { name: 'Sage Green', value: '#7bc8a4' },
  { name: 'Dusty Rose', value: '#e6a4b4' },
  { name: 'Warm Amber', value: '#f4b183' },
  { name: 'Lavender', value: '#b39ddb' },
  { name: 'Seafoam', value: '#7fd1c2' },
  { name: 'Slate', value: '#9fb1c7' },
  { name: 'Muted Coral', value: '#f29c9c' },
]

const ASSESSMENT_TYPES = ['Assignment', 'Quiz', 'Midterm', 'Final', 'Project']

const HANDBOOK_DATA_URL = '/data/handbook-2026-s1.json'

const HANDBOOK_API_BASE = import.meta.env.VITE_HANDBOOK_API_BASE || ''
const buildApiUrl = (path) =>
  HANDBOOK_API_BASE
    ? `${HANDBOOK_API_BASE.replace(/\/$/, '')}${path}`
    : path

const STORAGE_KEYS = {
  courses: 'unitracker-courses',
  assessments: 'unitracker-assessments',
  wamGoal: 'unitracker-wam-goal',
  handbookCache: 'unitracker-handbook-cache',
}

const AUTH_VIEWS = {
  signIn: 'sign-in',
  signUp: 'sign-up',
}

const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const loadLocal = (key, fallback) => {
  if (typeof window === 'undefined') return fallback
  try {
    const stored = window.localStorage.getItem(key)
    return stored ? JSON.parse(stored) : fallback
  } catch (error) {
    console.warn('Failed to load from storage', error)
    return fallback
  }
}

const saveLocal = (key, value) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn('Failed to save to storage', error)
  }
}

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, { cache: 'no-store', ...options })
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return response.json()
}

const formatDateShort = (value) => {
  if (!value) return 'No date'
  try {
    return format(parseISO(value), 'MMM d')
  } catch {
    return value
  }
}

const formatDateTime = (value) => {
  if (!value) return '--'
  try {
    return format(parseISO(value), 'MMM d, yyyy · h:mm a')
  } catch {
    return value
  }
}

const toNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const normalizeCourseCode = (value) =>
  value ? value.replace(/\s+/g, '').toUpperCase() : ''

const getAssessmentDisplay = (row) => {
  const entries = Object.entries(row || {}).filter(([, value]) => value)
  if (!entries.length) {
    return { title: 'Assessment', details: [] }
  }
  const primary =
    entries.find(([key]) => /description/i.test(key)) || entries[0]
  const details = entries
    .filter(([key]) => key !== primary[0])
    .map(([label, value]) => ({ label, value }))
  return { title: primary[1], details }
}

const sortByDueDate = (items) => {
  const sorter = (a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')
  return Array.prototype.toSorted ? items.toSorted(sorter) : [...items].sort(sorter)
}

const getCourseAverage = (assessments) => {
  const completed = assessments.filter(
    (assessment) => assessment.completed && assessment.score !== null,
  )
  const totalWeight = completed.reduce(
    (sum, assessment) => sum + Number(assessment.weight || 0),
    0,
  )
  if (!totalWeight) return null
  const weightedScore = completed.reduce(
    (sum, assessment) =>
      sum + Number(assessment.score || 0) * Number(assessment.weight || 0),
    0,
  )
  return weightedScore / totalWeight
}

const getGoalRequirement = (assessments, target) => {
  const targetValue = toNumberOrNull(target)
  let completedWeight = 0
  let remainingWeight = 0
  let completedScoreSum = 0

  assessments.forEach((assessment) => {
    const weight = Number(assessment.weight || 0)
    if (!weight) return
    const scored =
      assessment.completed && assessment.score !== null && assessment.score !== undefined
    if (scored) {
      completedWeight += weight
      completedScoreSum += Number(assessment.score || 0) * weight
    } else {
      remainingWeight += weight
    }
  })

  const totalWeight = completedWeight + remainingWeight
  const currentAverage = completedWeight ? completedScoreSum / completedWeight : null

  if (targetValue === null) {
    return {
      status: 'no-target',
      target: null,
      currentAverage,
      totalWeight,
      remainingWeight,
    }
  }

  if (!totalWeight) {
    return {
      status: 'no-assessments',
      target: targetValue,
      currentAverage,
      totalWeight,
      remainingWeight,
    }
  }

  if (!remainingWeight) {
    return {
      status: 'complete',
      target: targetValue,
      currentAverage,
      totalWeight,
      remainingWeight,
    }
  }

  const required = (targetValue * totalWeight - completedScoreSum) / remainingWeight

  return {
    status: 'active',
    target: targetValue,
    currentAverage,
    totalWeight,
    remainingWeight,
    required,
  }
}

function App() {
  const hasSupabaseConfig = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  )
  const [authView, setAuthView] = useState(AUTH_VIEWS.signIn)
  const [authStatus, setAuthStatus] = useState('loading')
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [user, setUser] = useState(null)
  const [dataStatus, setDataStatus] = useState('idle')
  const hasLoadedRemoteRef = useRef(false)
  const saveTimeoutRef = useRef(null)

  const [courses, setCourses] = useState(() =>
    loadLocal(STORAGE_KEYS.courses, []),
  )
  const [assessments, setAssessments] = useState(() =>
    loadLocal(STORAGE_KEYS.assessments, []),
  )
  const [wamGoal, setWamGoal] = useState(() =>
    loadLocal(STORAGE_KEYS.wamGoal, ''),
  )
  const [monthCursor, setMonthCursor] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), 'yyyy-MM-dd'),
  )
  const [courseModal, setCourseModal] = useState({
    open: false,
    mode: 'add',
    course: null,
  })
  const [courseDetailId, setCourseDetailId] = useState(null)
  const [assessmentModal, setAssessmentModal] = useState({
    open: false,
    mode: 'add',
    assessment: null,
    courseId: null,
  })
  const [profileOpen, setProfileOpen] = useState(false)

  const [handbookStatus, setHandbookStatus] = useState('idle')
  const [handbookError, setHandbookError] = useState('')
  const [handbookData, setHandbookData] = useState([])
  const [handbookMeta, setHandbookMeta] = useState(null)
  const [handbookQuery, setHandbookQuery] = useState('')

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setAuthStatus('ready')
      return
    }
    let isMounted = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return
        setUser(data?.session?.user ?? null)
        setAuthStatus('ready')
      })
      .catch(() => {
        if (!isMounted) return
        setAuthStatus('ready')
      })

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      },
    )

    return () => {
      isMounted = false
      authListener?.subscription?.unsubscribe()
    }
  }, [hasSupabaseConfig])

  const persistUserData = useCallback(
    async (payload) => {
      if (!user) return
      const { error } = await supabase.from('user_data').upsert(
        {
          user_id: user.id,
          courses: payload.courses,
          assessments: payload.assessments,
          wam_goal: payload.wamGoal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      if (error) {
        console.warn('Failed to sync data', error)
      }
    },
    [user],
  )

  useEffect(() => {
    if (user || !hasSupabaseConfig) return
    setCourses(loadLocal(STORAGE_KEYS.courses, []))
    setAssessments(loadLocal(STORAGE_KEYS.assessments, []))
    setWamGoal(loadLocal(STORAGE_KEYS.wamGoal, ''))
    setDataStatus('idle')
    hasLoadedRemoteRef.current = false
  }, [user, hasSupabaseConfig, persistUserData])

  useEffect(() => {
    if (user || !hasSupabaseConfig) return
    saveLocal(STORAGE_KEYS.courses, courses)
  }, [courses, user, hasSupabaseConfig])

  useEffect(() => {
    if (user || !hasSupabaseConfig) return
    saveLocal(STORAGE_KEYS.assessments, assessments)
  }, [assessments, user, hasSupabaseConfig])

  useEffect(() => {
    if (user || !hasSupabaseConfig) return
    saveLocal(STORAGE_KEYS.wamGoal, wamGoal)
  }, [wamGoal, user, hasSupabaseConfig])

  useEffect(() => {
    if (!user || !hasSupabaseConfig) return
    let isActive = true
    setDataStatus('loading')

    const localSnapshot = {
      courses: loadLocal(STORAGE_KEYS.courses, []),
      assessments: loadLocal(STORAGE_KEYS.assessments, []),
      wamGoal: loadLocal(STORAGE_KEYS.wamGoal, ''),
    }

    const loadRemote = async () => {
      const { data, error } = await supabase
        .from('user_data')
        .select('courses, assessments, wam_goal')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!isActive) return

      if (error) {
        console.warn('Failed to load remote data', error)
        setCourses(localSnapshot.courses)
        setAssessments(localSnapshot.assessments)
        setWamGoal(localSnapshot.wamGoal)
      } else if (data) {
        setCourses(data.courses ?? [])
        setAssessments(data.assessments ?? [])
        setWamGoal(data.wam_goal ?? '')
      } else if (
        localSnapshot.courses.length ||
        localSnapshot.assessments.length ||
        localSnapshot.wamGoal
      ) {
        setCourses(localSnapshot.courses)
        setAssessments(localSnapshot.assessments)
        setWamGoal(localSnapshot.wamGoal)
        await persistUserData(localSnapshot)
      } else {
        setCourses([])
        setAssessments([])
        setWamGoal('')
      }

      hasLoadedRemoteRef.current = true
      setDataStatus('ready')
    }

    loadRemote()

    return () => {
      isActive = false
    }
  }, [user, hasSupabaseConfig, persistUserData])

  useEffect(() => {
    if (!user) {
      setProfileOpen(false)
    }
  }, [user])

  const loadHandbookData = useCallback(
    async ({ force = false } = {}) => {
      if (!user) return
      setHandbookStatus('loading')
      setHandbookError('')

      const cached = loadLocal(STORAGE_KEYS.handbookCache, null)
      let meta = null

      if (!force) {
        try {
          meta = await fetchJson(buildApiUrl('/api/handbook/meta'))
        } catch (error) {
          meta = null
        }
      }

      if (
        !force &&
        meta?.version &&
        cached?.version === meta.version &&
        cached?.items?.length
      ) {
        setHandbookData(cached.items)
        setHandbookMeta({
          generatedAt: meta.generatedAt || cached.generatedAt,
          total: cached.items.length,
          version: meta.version,
          cachedAt: cached.cachedAt || null,
        })
        setHandbookStatus('ready')
        return
      }

      try {
        let payload = null
        try {
          payload = await fetchJson(buildApiUrl('/api/handbook'))
        } catch (error) {
          payload = await fetchJson(HANDBOOK_DATA_URL)
        }

        const items = Array.isArray(payload?.items) ? payload.items : []
        const version = payload?.version || meta?.version || null
        const generatedAt = payload?.generatedAt || meta?.generatedAt || null

        setHandbookData(items)
        setHandbookMeta({
          generatedAt,
          total: items.length,
          version,
        })
        setHandbookStatus('ready')

        saveLocal(STORAGE_KEYS.handbookCache, {
          version,
          generatedAt,
          items,
          cachedAt: new Date().toISOString(),
        })
      } catch (error) {
        console.warn('Failed to load handbook data', error)
        if (cached?.items?.length) {
          setHandbookData(cached.items)
          setHandbookMeta({
            generatedAt: cached.generatedAt || null,
            total: cached.items.length,
            version: cached.version || null,
            cachedAt: cached.cachedAt || null,
          })
          setHandbookStatus('ready')
        } else {
          setHandbookStatus('error')
          setHandbookError('Handbook data not available. Run the scraper first.')
        }
      }
    },
    [user],
  )

  const refreshHandbookData = useCallback(async () => {
    if (!user) return
    setHandbookStatus('loading')
    setHandbookError('')
    try {
      await fetchJson(buildApiUrl('/api/handbook/refresh'), {
        method: 'POST',
      })
      await loadHandbookData({ force: true })
    } catch (error) {
      console.warn('Failed to refresh handbook data', error)
      await loadHandbookData({ force: true })
    }
  }, [user, loadHandbookData])

  useEffect(() => {
    if (!user) return
    loadHandbookData()
  }, [user, loadHandbookData])

  useEffect(() => {
    if (!user || !hasSupabaseConfig || !hasLoadedRemoteRef.current) return
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      persistUserData({ courses, assessments, wamGoal })
    }, 500)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [courses, assessments, wamGoal, user, hasSupabaseConfig, persistUserData])

  const courseMap = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  )

  const handbookIndex = useMemo(() => {
    const map = new Map()
    handbookData.forEach((item) => {
      if (item?.code) {
        map.set(item.code.toUpperCase(), item)
      }
    })
    return map
  }, [handbookData])

  const normalizedHandbookQuery = normalizeCourseCode(handbookQuery)
  const handbookResult = normalizedHandbookQuery
    ? handbookIndex.get(normalizedHandbookQuery)
    : null

  const assessmentsByCourse = useMemo(() => {
    const grouped = new Map()
    courses.forEach((course) => {
      grouped.set(course.id, [])
    })
    assessments.forEach((assessment) => {
      const list = grouped.get(assessment.courseId)
      if (list) {
        list.push(assessment)
      } else {
        grouped.set(assessment.courseId, [assessment])
      }
    })
    grouped.forEach((list, courseId) => {
      grouped.set(courseId, sortByDueDate(list))
    })
    return grouped
  }, [assessments, courses])

  const courseAverages = useMemo(() => {
    const averages = new Map()
    courses.forEach((course) => {
      averages.set(
        course.id,
        getCourseAverage(assessmentsByCourse.get(course.id) || []),
      )
    })
    return averages
  }, [assessmentsByCourse, courses])

  const wamGoalNumber = toNumberOrNull(wamGoal)

  const wamData = useMemo(() => {
    let weightedSum = 0
    let totalCredits = 0
    courses.forEach((course) => {
      const average = courseAverages.get(course.id)
      if (average === null || Number.isNaN(average)) return
      const credits = Number(course.creditPoints || 0)
      if (!credits) return
      weightedSum += average * credits
      totalCredits += credits
    })
    return {
      wam: totalCredits ? weightedSum / totalCredits : null,
      totalCredits,
    }
  }, [courseAverages, courses])

  const projectedWam = useMemo(() => {
    let weightedSum = 0
    let totalCredits = 0
    courses.forEach((course) => {
      const target = toNumberOrNull(course.targetMark ?? wamGoalNumber)
      if (target === null || Number.isNaN(target)) return
      const credits = Number(course.creditPoints || 0)
      if (!credits) return
      weightedSum += target * credits
      totalCredits += credits
    })
    return totalCredits ? weightedSum / totalCredits : null
  }, [courses, wamGoalNumber])

  const assessmentsByDate = useMemo(() => {
    const grouped = new Map()
    assessments.forEach((assessment) => {
      if (!assessment.dueDate) return
      const list = grouped.get(assessment.dueDate)
      if (list) {
        list.push(assessment)
      } else {
        grouped.set(assessment.dueDate, [assessment])
      }
    })
    return grouped
  }, [assessments])

  const selectedDateAssessments = assessmentsByDate.get(selectedDate) || []
  const completedAssessmentCount = useMemo(
    () => assessments.filter((assessment) => assessment.completed).length,
    [assessments],
  )
  const upcomingAssessmentCount =
    assessments.length - completedAssessmentCount

  const handleSaveCourse = (payload) => {
    const { mode: payloadMode, ...courseData } = payload
    if (payloadMode === 'edit') {
      setCourses((prev) =>
        prev.map((course) =>
          course.id === courseData.id ? courseData : course,
        ),
      )
    } else {
      setCourses((prev) => [...prev, courseData])
    }
  }

  const handleDeleteCourse = (courseId) => {
    setCourses((prev) => prev.filter((course) => course.id !== courseId))
    setAssessments((prev) =>
      prev.filter((assessment) => assessment.courseId !== courseId),
    )
  }

  const handleSaveAssessment = (payload) => {
    const { mode: payloadMode, ...assessmentData } = payload
    if (payloadMode === 'edit') {
      setAssessments((prev) =>
        prev.map((assessment) =>
          assessment.id === assessmentData.id ? assessmentData : assessment,
        ),
      )
    } else {
      setAssessments((prev) => [...prev, assessmentData])
    }
  }

  const handleDeleteAssessment = (assessmentId) => {
    setAssessments((prev) =>
      prev.filter((assessment) => assessment.id !== assessmentId),
    )
  }

  const handleAuthSubmit = async ({ email, password, mode }) => {
    if (!hasSupabaseConfig) return
    setAuthError('')
    setAuthNotice('')
    setAuthBusy(true)
    const isSignUp = mode === AUTH_VIEWS.signUp
    const { data, error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setAuthError(error.message)
    } else if (isSignUp && !data?.session) {
      setAuthNotice('Check your email to confirm your account, then sign in.')
    }
    setAuthBusy(false)
  }

  const handleSignOut = async () => {
    if (!hasSupabaseConfig) return
    await supabase.auth.signOut()
  }

  const openAddCourse = () => {
    if (courses.length >= 8) {
      window.alert('Limit reached: up to 8 courses per semester.')
      return
    }
    setCourseModal({ open: true, mode: 'add', course: null })
  }

  const openAddCourseWithHandbook = (subject) => {
    if (courses.length >= 8) {
      window.alert('Limit reached: up to 8 courses per semester.')
      return
    }
    if (!subject) {
      setCourseModal({ open: true, mode: 'add', course: null })
      return
    }
    setCourseModal({
      open: true,
      mode: 'add',
      course: {
        name: subject.name || '',
        creditPoints: subject.creditPoints ?? '',
        code: subject.code || '',
        color: COURSE_COLORS[0].value,
      },
    })
  }

  const openEditCourse = (course) => {
    setCourseModal({ open: true, mode: 'edit', course })
  }

  const openAddAssessment = (courseId) => {
    setAssessmentModal({
      open: true,
      mode: 'add',
      assessment: null,
      courseId,
    })
  }

  const openEditAssessment = (assessment) => {
    setAssessmentModal({
      open: true,
      mode: 'edit',
      assessment,
      courseId: assessment.courseId,
    })
  }

  const { monthStart, calendarDays } = useMemo(() => {
    const start = startOfMonth(monthCursor)
    const end = endOfMonth(start)
    const calendarStart = startOfWeek(start, { weekStartsOn: 1 })
    const calendarEnd = endOfWeek(end, { weekStartsOn: 1 })

    const days = []
    let day = calendarStart
    while (day <= calendarEnd) {
      days.push(day)
      day = addDays(day, 1)
    }

    return { monthStart: start, calendarDays: days }
  }, [monthCursor])

  if (authStatus === 'loading') {
    return <LoadingScreen label="Checking your session…" />
  }

  if (!hasSupabaseConfig) {
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
        onToggleView={(nextView) => {
          setAuthView(nextView)
          setAuthError('')
          setAuthNotice('')
        }}
      />
    )
  }

  if (dataStatus === 'loading') {
    return <LoadingScreen label="Loading your dashboard…" />
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
            <h1 className="text-3xl font-semibold text-slate-800">
              Semester 1, 2026
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Track courses, assessments, and your WAM in one calm space.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden max-w-[180px] text-right text-xs text-slate-500 sm:block">
              <p className="uppercase tracking-[0.2em] text-[10px] text-slate-400">
                Signed in
              </p>
              <p className="truncate font-semibold text-slate-600">
                {user?.email}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm active:translate-y-0 active:shadow-neu-inset"
            >
              Sign Out
            </button>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm active:translate-y-0 active:shadow-neu-inset"
            >
              Profile
            </button>
            <button
              type="button"
              onClick={openAddCourse}
              className="rounded-2xl bg-accent px-5 py-2 text-sm font-semibold text-white shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm active:translate-y-0 active:shadow-neu-inset"
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
                            courseMap.get(assessment.courseId)?.color ||
                            '#cbd5f5',
                        }}
                      />
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-slate-700">
                          {assessment.title}
                        </p>
                        <p className="text-xs text-slate-400">
                          {courseMap.get(assessment.courseId)?.name ||
                            'Course'}{' '}
                          · {assessment.type}
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

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="flex flex-col gap-5">
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-600">Courses</h2>
                <span className="text-xs text-slate-400">
                  {courses.length}/4
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
                    const courseAssessments =
                      assessmentsByCourse.get(course.id) || []
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
                    const hasCourseTarget =
                      course.targetMark !== null &&
                      course.targetMark !== undefined
                    const targetValue = toNumberOrNull(
                      course.targetMark ?? wamGoalNumber,
                    )
                    const targetSource = hasCourseTarget
                      ? 'Course target'
                      : wamGoalNumber !== null
                        ? 'WAM goal'
                        : ''
                    const goalStats = getGoalRequirement(
                      courseAssessments,
                      targetValue,
                    )
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
                          <div className="flex items-center gap-2">
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
                                if (
                                  window.confirm(
                                    `Delete ${course.name}? This removes all assessments.`,
                                  )
                                ) {
                                  handleDeleteCourse(course.id)
                                }
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
                      } ${
                        isCurrentMonth ? 'text-slate-700' : 'text-slate-400'
                      }`}
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
                                courseMap.get(assessment.courseId)?.color ||
                                '#cbd5f5',
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

            <section className="rounded-3xl bg-white/70 p-6 shadow-neu">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-700">
                    Handbook lookup
                  </h2>
                  <p className="text-xs text-slate-400">
                    2026 Semester 1 ·{' '}
                    {handbookMeta?.total || 0} subjects
                  </p>
                  {handbookMeta?.generatedAt && (
                    <p className="text-[11px] text-slate-400">
                      Updated {formatDateTime(handbookMeta.generatedAt)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={refreshHandbookData}
                  disabled={handbookStatus === 'loading'}
                  className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {handbookStatus === 'loading' ? 'Refreshing…' : 'Refresh'}
                </button>
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
                      setHandbookQuery(event.target.value.toUpperCase())
                    }
                    placeholder="e.g. MAST10006"
                    autoComplete="off"
                    className="w-full rounded-2xl bg-white/80 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  />
                </label>
                <button
                  type="submit"
                  className="self-end rounded-2xl bg-accent px-5 py-2 text-xs font-semibold text-white shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm"
                >
                  Find
                </button>
              </form>

              {handbookStatus === 'loading' && (
                <p className="mt-4 text-xs text-slate-400">
                  Loading handbook data…
                </p>
              )}

              {handbookStatus === 'error' && (
                <p className="mt-4 rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-500">
                  {handbookError}
                </p>
              )}

              {handbookStatus === 'ready' && !normalizedHandbookQuery && (
                <p className="mt-4 text-xs text-slate-400">
                  Enter a subject code to see the overview, assessment, and
                  instructor email(s).
                </p>
              )}

              {handbookStatus === 'ready' &&
                normalizedHandbookQuery &&
                !handbookResult && (
                  <p className="mt-4 text-xs text-slate-400">
                    No Semester 1 match found for {normalizedHandbookQuery}.
                  </p>
                )}

              {handbookResult && (
                <div className="mt-5 space-y-6">
                  <div className="rounded-2xl bg-white/80 p-4 shadow-neu">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-slate-800">
                          {handbookResult.name}
                        </h3>
                        <p className="text-xs text-slate-400">
                          {handbookResult.code} ·{' '}
                          {handbookResult.studyPeriod || 'Semester 1'} 2026
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {handbookResult.instructorEmails?.length > 0 && (
                          <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                            {handbookResult.instructorEmails.length} instructor
                            {handbookResult.instructorEmails.length === 1
                              ? ''
                              : 's'}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => openAddCourseWithHandbook(handbookResult)}
                          className="rounded-2xl bg-accent px-3 py-2 text-[11px] font-semibold text-white shadow-neu transition hover:-translate-y-0.5 hover:shadow-neu-sm"
                        >
                          Add course
                        </button>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Overview
                      </p>
                      <div className="mt-2 space-y-2">
                        {handbookResult.overview?.length ? (
                          handbookResult.overview.map((paragraph, index) => (
                            <p
                              key={`${handbookResult.code}-overview-${index}`}
                              className="text-xs text-slate-500 whitespace-pre-line"
                            >
                              {paragraph}
                            </p>
                          ))
                        ) : (
                          <p className="text-xs text-slate-400">
                            No overview available.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Assessment
                      </p>
                      <div className="mt-3 space-y-3">
                        {handbookResult.assessment?.tables?.length ? (
                          handbookResult.assessment.tables.map((table, tableIndex) => (
                            <div
                              key={`${handbookResult.code}-table-${tableIndex}`}
                              className="space-y-3 rounded-2xl bg-white/70 p-4 shadow-neu"
                            >
                              {table.rows.map((row, rowIndex) => {
                                const { title, details } = getAssessmentDisplay(row)
                                return (
                                  <div
                                    key={`${handbookResult.code}-row-${tableIndex}-${rowIndex}`}
                                    className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                                  >
                                    <p className="text-sm font-semibold text-slate-700">
                                      {title}
                                    </p>
                                    {details.length > 0 && (
                                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
                                        {details.map((detail) => (
                                          <span
                                            key={`${handbookResult.code}-${detail.label}-${rowIndex}`}
                                            className="rounded-full bg-white/70 px-2 py-1"
                                          >
                                            {detail.label}: {detail.value}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-400">
                            No assessment data available.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Instructor email
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {handbookResult.instructorEmails?.length ? (
                          handbookResult.instructorEmails.map((email) => (
                            <span
                              key={`${handbookResult.code}-${email}`}
                              className="rounded-full bg-white/70 px-3 py-1 text-[11px] text-slate-500 shadow-neu"
                            >
                              {email}
                            </span>
                          ))
                        ) : (
                          <p className="text-xs text-slate-400">
                            No instructor email listed for Semester 1.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
          onClose={() =>
            setCourseModal({ open: false, mode: 'add', course: null })
          }
          onSave={(payload) => {
            handleSaveCourse(payload)
            setCourseModal({ open: false, mode: 'add', course: null })
          }}
          onDelete={(courseId) => {
            handleDeleteCourse(courseId)
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
          <h1 className="mt-3 text-2xl font-semibold text-slate-800">
            {label}
          </h1>
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
            Connect Supabase to enable accounts
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Add your Supabase project URL and anon key in a `.env.local` file,
            then restart the dev server.
          </p>
          <div className="mt-4 rounded-2xl bg-white/80 p-4 text-xs text-slate-500 shadow-neu">
            <p className="font-semibold text-slate-600">Required keys</p>
            <p className="mt-2">VITE_SUPABASE_URL=</p>
            <p>VITE_SUPABASE_ANON_KEY=</p>
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
              {busy
                ? 'Please wait…'
                : isSignUp
                  ? 'Create Account'
                  : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            {isSignUp
              ? 'Already have an account?'
              : "Don't have an account yet?"}{' '}
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

function ProfileModal({
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

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.display_name ||
    user?.email?.split('@')[0] ||
    'Student'
  const provider =
    user?.app_metadata?.provider ||
    user?.app_metadata?.providers?.[0] ||
    'email'
  const lastSignIn = user?.last_sign_in_at || user?.last_sign_in
  const confirmedAt = user?.email_confirmed_at || user?.confirmed_at
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
              {user?.email}
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
                {user?.id || '--'}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Provider:</span>{' '}
                {provider}
              </p>
              <p>
                <span className="font-semibold text-slate-600">
                  Email verified:
                </span>{' '}
                {confirmedAt ? 'Yes' : 'No'}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Created:</span>{' '}
                {formatDateTime(user?.created_at)}
              </p>
              <p>
                <span className="font-semibold text-slate-600">
                  Last sign-in:
                </span>{' '}
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
                <span className="font-semibold text-slate-600">Courses:</span>{' '}
                {courseCount}
              </p>
              <p>
                <span className="font-semibold text-slate-600">
                  Assessments:
                </span>{' '}
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
            Your dashboard is backed up to Supabase while you stay signed in.
          </p>
        </div>
      </div>
    </div>
  )
}

function CourseDetailModal({
  course,
  assessments,
  average,
  wamGoalNumber,
  onClose,
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-neu"
          >
            Close
          </button>
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
              <p className="mt-2 text-xs text-slate-400">
                No upcoming assessments.
              </p>
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
                      <p className="break-words font-semibold">
                        {assessment.title}
                      </p>
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
                  <p className="text-[11px] text-slate-400">
                    +{upcoming.length - 4} more
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white/70 p-4 shadow-neu">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Completed
            </p>
            {completed.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">
                Nothing graded yet.
              </p>
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
                      <p className="break-words font-semibold">
                        {assessment.title}
                      </p>
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
                  <p className="text-[11px] text-slate-400">
                    +{completed.length - 3} more
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function CourseModal({ open, mode, course, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => ({
    code: course?.code || '',
    name: course?.name || '',
    creditPoints: course?.creditPoints || '',
    targetMark: course?.targetMark ?? '',
    color: course?.color || COURSE_COLORS[0].value,
  }))
  const [error, setError] = useState('')

  if (!open) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('Course name is required.')
      return
    }
    if (!form.creditPoints || Number(form.creditPoints) <= 0) {
      setError('Credit points must be a positive number.')
      return
    }
    const targetValue = toNumberOrNull(form.targetMark)
    if (targetValue !== null && (targetValue < 0 || targetValue > 100)) {
      setError('Target mark must be between 0 and 100.')
      return
    }

    const codeValue = normalizeCourseCode(form.code)

    const payload = {
      id: course?.id || createId(),
      code: codeValue || '',
      name: form.name.trim(),
      creditPoints: Number(form.creditPoints),
      targetMark: targetValue,
      color: form.color,
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
              Choose a name, credit points, and a signature color.
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
            Subject code (optional)
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
            <span className="mt-1 block text-[11px] text-slate-400">
              Used to match handbook data.
            </span>
          </label>

          <label className="text-xs font-semibold text-slate-500">
            Course name
            <input
              name="courseName"
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="e.g. Data Structures…"
              autoComplete="off"
              className="mt-2 w-full rounded-2xl bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>

          <label className="text-xs font-semibold text-slate-500">
            Credit points
            <input
              name="creditPoints"
              type="number"
              value={form.creditPoints}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, creditPoints: event.target.value }))
              }
              placeholder="e.g. 6…"
              inputMode="numeric"
              autoComplete="off"
              className="mt-2 w-full rounded-2xl bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-neu focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>

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

          <div>
            <p className="text-xs font-semibold text-slate-500">Course color</p>
            <div className="mt-3 grid grid-cols-4 gap-3">
              {COURSE_COLORS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, color: option.value }))
                  }
                  aria-label={`Select ${option.name}`}
                  className={`flex h-10 items-center justify-center rounded-2xl border ${
                    form.color === option.value
                      ? 'border-accent shadow-neu-inset'
                      : 'border-transparent shadow-neu'
                  } bg-white/70`}
                >
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: option.value }}
                  />
                </button>
              ))}
            </div>
          </div>

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
                onClick={() => onDelete(course.id)}
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

function AssessmentModal({
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
    dueDate: assessment?.dueDate || format(new Date(), 'yyyy-MM-dd'),
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
    if (!form.weight || Number(form.weight) <= 0) {
      setError('Weight must be a positive number.')
      return
    }

    const payload = {
      id: assessment?.id || createId(),
      courseId: form.courseId,
      title: form.title.trim(),
      type: form.type,
      dueDate: form.dueDate,
      weight: Number(form.weight),
      score: form.score === '' ? null : Number(form.score),
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
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
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
              Due date
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

export default App
