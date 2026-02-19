import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, hasFirebaseConfig } from '../lib/firebase'

export const COURSE_COLORS = [
  { name: 'Soft Blue', value: '#7aa2f7' },
  { name: 'Sage Green', value: '#7bc8a4' },
  { name: 'Dusty Rose', value: '#e6a4b4' },
  { name: 'Warm Amber', value: '#f4b183' },
  { name: 'Lavender', value: '#b39ddb' },
  { name: 'Seafoam', value: '#7fd1c2' },
  { name: 'Slate', value: '#9fb1c7' },
  { name: 'Muted Coral', value: '#f29c9c' },
]

export const ASSESSMENT_TYPES = [
  'Assignment',
  'Quiz',
  'Midterm',
  'Final',
  'Project',
]

export const MAX_COURSES = 8
export const DUE_SOON_DAYS = 7

const HANDBOOK_DATA_URL = '/data/handbook-2026-s1.json'

const HANDBOOK_API_BASE = (import.meta.env.VITE_HANDBOOK_API_BASE || '').trim()
const hasHandbookApi = Boolean(HANDBOOK_API_BASE)
const buildApiUrl = (path) =>
  HANDBOOK_API_BASE
    ? `${HANDBOOK_API_BASE.replace(/\/$/, '')}${path}`
    : path

const STORAGE_KEYS = {
  courses: 'unitracker-courses',
  assessments: 'unitracker-assessments',
  wamGoal: 'unitracker-wam-goal',
  handbookMeta: 'unitracker-handbook-meta',
  handbookCacheLegacy: 'unitracker-handbook-cache',
}

export const AUTH_VIEWS = {
  signIn: 'sign-in',
  signUp: 'sign-up',
}

export const createId = () =>
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

const removeLocal = (key) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch (error) {
    console.warn('Failed to remove storage key', error)
  }
}

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, { cache: 'no-store', ...options })
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return response.json()
}

const parseDateValue = (value) => {
  if (!value) return null
  if (value instanceof Date) return isValid(value) ? value : null
  if (typeof value === 'number') {
    const fromTimestamp = new Date(value)
    return isValid(fromTimestamp) ? fromTimestamp : null
  }
  const isoCandidate = parseISO(String(value))
  if (isValid(isoCandidate)) return isoCandidate
  const fallbackCandidate = new Date(value)
  return isValid(fallbackCandidate) ? fallbackCandidate : null
}

export const formatDateShort = (value) => {
  if (!value) return 'No date'
  const parsed = parseDateValue(value)
  if (!parsed) return String(value)
  return format(parsed, 'MMM d')
}

export const formatDateTime = (value) => {
  if (!value) return '--'
  const parsed = parseDateValue(value)
  if (!parsed) return String(value)
  return format(parsed, 'MMM d, yyyy · h:mm a')
}

export const getSafeDisplayName = (user) => {
  if (!user) return 'Student'
  const metadata = user.user_metadata || {}
  const firebaseDisplayName =
    user.displayName ||
    user.providerData?.find((provider) => provider?.displayName)?.displayName
  if (firebaseDisplayName) return firebaseDisplayName
  return (
    metadata.full_name ||
    metadata.name ||
    metadata.display_name ||
    user.email?.split('@')[0] ||
    'Student'
  )
}

export const toNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

export const normalizeCourseCode = (value) =>
  value ? value.replace(/\s+/g, '').toUpperCase() : ''

export const getColorFromCode = (code) => {
  if (!code) return COURSE_COLORS[0].value
  let hash = 0
  for (let index = 0; index < code.length; index += 1) {
    hash = (hash + code.charCodeAt(index)) % COURSE_COLORS.length
  }
  return COURSE_COLORS[hash].value
}

export const sortByDueDate = (items) => {
  const sorter = (a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')
  return Array.prototype.toSorted ? items.toSorted(sorter) : [...items].sort(sorter)
}

const getDaysUntilDue = (value) => {
  if (!value) return null
  try {
    const dueDate = parseISO(value)
    if (!isValid(dueDate)) return null
    return differenceInCalendarDays(dueDate, new Date())
  } catch {
    return null
  }
}

export const getCourseAverage = (assessments) => {
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

export const getGoalRequirement = (assessments, target) => {
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

const HANDBOOK_DESCRIPTION_FIELDS = [/description/i, /task/i, /assessment/i, /title/i, /name/i]
const HANDBOOK_TIMING_FIELDS = [/timing/i, /due/i, /date/i, /week/i]
const HANDBOOK_WEIGHT_FIELDS = [/percentage/i, /weight/i]

const normalizeText = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

const pickRowValue = (row, patterns) => {
  if (!row || typeof row !== 'object') return ''
  const entries = Object.entries(row)
  for (const [label, value] of entries) {
    if (!patterns.some((pattern) => pattern.test(label))) continue
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

const parseWeightFromText = (value) => {
  const text = normalizeText(value)
  if (!text) return null
  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/)
  if (percentMatch) return Number(percentMatch[1])
  const numberMatch = text.match(/(\d+(?:\.\d+)?)/)
  return numberMatch ? Number(numberMatch[1]) : null
}

const parseDueDateFromText = (value, fallbackYear) => {
  const text = normalizeText(value)
  if (!text) return ''
  const normalized = text.replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1')

  const directMs = Date.parse(normalized)
  if (Number.isFinite(directMs)) {
    return format(new Date(directMs), 'yyyy-MM-dd')
  }

  const dayMonthYear = normalized.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/)
  if (!dayMonthYear) return ''

  const day = Number(dayMonthYear[1])
  const month = Number(dayMonthYear[2])
  const yearRaw = dayMonthYear[3] ? Number(dayMonthYear[3]) : fallbackYear
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw
  const candidate = new Date(year, month - 1, day)
  if (!isValid(candidate)) return ''
  return format(candidate, 'yyyy-MM-dd')
}

const normalizeImportedTitle = (value) => {
  const text = normalizeText(value)
  if (!text) return 'Assessment'
  const cleaned = text
    .replace(/\s*\d+\s*words?\s*(?:\(equivalent\))?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  const source = cleaned || text
  return source.length > 110 ? `${source.slice(0, 107)}...` : source
}

const inferAssessmentType = (title) => {
  const text = normalizeText(title).toLowerCase()
  if (/\bfinal\b/.test(text)) return 'Final'
  if (/\bmid\s*-?\s*term\b|\bmidsemester\b|\bmid\s*-?\s*semester\b/.test(text)) {
    return 'Midterm'
  }
  if (/\bquiz\b|\btest\b/.test(text)) return 'Quiz'
  if (/\bproject\b|\bportfolio\b|\bpresentation\b/.test(text)) return 'Project'
  return 'Assignment'
}

const mapHandbookSubjectToAssessments = (subject) => {
  const tables = Array.isArray(subject?.assessment?.tables)
    ? subject.assessment.tables
    : []
  if (!tables.length) return []

  const fallbackYear = Number(subject?.year) || new Date().getFullYear()
  const drafts = []

  tables.forEach((table) => {
    const rows = Array.isArray(table?.rows) ? table.rows : []
    rows.forEach((row, index) => {
      const description =
        pickRowValue(row, HANDBOOK_DESCRIPTION_FIELDS) || `Assessment ${index + 1}`
      const timing = pickRowValue(row, HANDBOOK_TIMING_FIELDS)
      const weightRaw = pickRowValue(row, HANDBOOK_WEIGHT_FIELDS)
      const weight = parseWeightFromText(weightRaw)
      if (!Number.isFinite(weight) || weight <= 0) return

      const title = normalizeImportedTitle(description)
      drafts.push({
        title,
        type: inferAssessmentType(title),
        dueDate: parseDueDateFromText(timing, fallbackYear),
        weight,
      })
    })
  })

  return drafts
}

const assessmentSignature = (assessment) => {
  const title = normalizeText(assessment.title).toLowerCase()
  const type = normalizeText(assessment.type).toLowerCase()
  const weight = Number(assessment.weight || 0).toFixed(2)
  const dueDate = assessment.dueDate || ''
  return `${assessment.courseId}|${title}|${type}|${weight}|${dueDate}`
}

const formatFirebaseAuthError = (error, mode) => {
  const rawCode = String(error?.code || '').toLowerCase()
  const rawMessage = String(error?.message || '')
  const upperMessage = rawMessage.toUpperCase()

  if (rawCode === 'auth/configuration-not-found' || upperMessage.includes('CONFIGURATION_NOT_FOUND')) {
    return 'Firebase Authentication is not initialized. In Firebase Console, open Authentication, click Get started, then enable Email/Password.'
  }

  if (rawCode === 'auth/operation-not-allowed') {
    return 'Email/Password sign-in is disabled. Enable it in Firebase Console -> Authentication -> Sign-in method.'
  }

  if (
    rawCode === 'auth/invalid-credential' ||
    rawCode === 'auth/invalid-login-credentials' ||
    rawCode === 'auth/wrong-password' ||
    rawCode === 'auth/user-not-found'
  ) {
    return mode === AUTH_VIEWS.signUp
      ? 'Unable to create account with these details.'
      : 'Invalid email or password.'
  }

  if (rawCode === 'auth/email-already-in-use') {
    return 'This email is already in use. Try signing in instead.'
  }

  if (rawCode === 'auth/invalid-email') {
    return 'Invalid email address format.'
  }

  if (rawCode === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a moment and try again.'
  }

  if (rawCode === 'auth/network-request-failed') {
    return 'Network request failed. Check your connection and try again.'
  }

  const cleanedMessage = rawMessage
    .replace(/^Firebase:\s*/i, '')
    .replace(/\s*\(auth\/[^)]+\)\.?$/i, '')
    .trim()

  if (cleanedMessage && cleanedMessage.toLowerCase() !== 'error') {
    return cleanedMessage
  }
  return 'Authentication failed.'
}

export const useDashboardDomain = () => {
  const [authView, setAuthView] = useState(AUTH_VIEWS.signIn)
  const [authStatus, setAuthStatus] = useState('loading')
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [user, setUser] = useState(null)
  const [dataStatus, setDataStatus] = useState('idle')
  const hasLoadedRemoteRef = useRef(false)
  const saveTimeoutRef = useRef(null)
  const deleteCourseTimeoutRef = useRef(null)

  const handbookResultRef = useRef(null)

  const [courses, setCourses] = useState(() => loadLocal(STORAGE_KEYS.courses, []))
  const [assessments, setAssessments] = useState(() =>
    loadLocal(STORAGE_KEYS.assessments, []),
  )
  const [wamGoal, setWamGoal] = useState(() => loadLocal(STORAGE_KEYS.wamGoal, ''))
  const [monthCursor, setMonthCursor] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [courseModal, setCourseModal] = useState({
    open: false,
    mode: 'add',
    course: null,
  })
  const [courseDetailId, setCourseDetailId] = useState(null)
  const [deleteCoursePrompt, setDeleteCoursePrompt] = useState(null)
  const [deleteCourseBusy, setDeleteCourseBusy] = useState(false)
  const [assessmentModal, setAssessmentModal] = useState({
    open: false,
    mode: 'add',
    assessment: null,
    courseId: null,
  })
  const [profileOpen, setProfileOpen] = useState(false)
  const [handbookDetail, setHandbookDetail] = useState(null)

  const [handbookStatus, setHandbookStatus] = useState('idle')
  const [handbookError, setHandbookError] = useState('')
  const [handbookData, setHandbookData] = useState([])
  const [handbookMeta, setHandbookMeta] = useState(null)
  const [handbookQuery, setHandbookQuery] = useState('')

  useEffect(() => {
    if (!hasFirebaseConfig || !auth) {
      setAuthStatus('ready')
      return
    }

    let isMounted = true
    let unsubscribe = () => {}

    const initAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence)
      } catch (error) {
        console.warn('Failed to apply auth persistence', error)
      }

      unsubscribe = onAuthStateChanged(auth, (nextUser) => {
        if (!isMounted) return
        setUser(nextUser || null)
        setAuthStatus('ready')
      })
    }

    initAuth().catch((error) => {
      console.warn('Failed to initialize auth', error)
      if (!isMounted) return
      setAuthStatus('ready')
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (deleteCourseTimeoutRef.current) {
        clearTimeout(deleteCourseTimeoutRef.current)
      }
    }
  }, [])

  const persistUserData = useCallback(
    async (payload) => {
      if (!user || !db) return
      try {
        await setDoc(
          doc(db, 'user_data', user.uid),
          {
            courses: payload.courses,
            assessments: payload.assessments,
            wam_goal: payload.wamGoal,
            updated_at: new Date().toISOString(),
          },
          { merge: true },
        )
      } catch (error) {
        console.warn('Failed to sync data', error)
      }
    },
    [user],
  )

  useEffect(() => {
    if (user || !hasFirebaseConfig) return
    setCourses(loadLocal(STORAGE_KEYS.courses, []))
    setAssessments(loadLocal(STORAGE_KEYS.assessments, []))
    setWamGoal(loadLocal(STORAGE_KEYS.wamGoal, ''))
    setHandbookMeta(null)
    setDataStatus('idle')
    hasLoadedRemoteRef.current = false
  }, [user])

  useEffect(() => {
    if (user || !hasFirebaseConfig) return
    saveLocal(STORAGE_KEYS.courses, courses)
  }, [courses, user])

  useEffect(() => {
    if (user || !hasFirebaseConfig) return
    saveLocal(STORAGE_KEYS.assessments, assessments)
  }, [assessments, user])

  useEffect(() => {
    if (user || !hasFirebaseConfig) return
    saveLocal(STORAGE_KEYS.wamGoal, wamGoal)
  }, [wamGoal, user])

  useEffect(() => {
    if (!user || !hasFirebaseConfig || !db) return
    let isActive = true
    setDataStatus('loading')

    const localSnapshot = {
      courses: loadLocal(STORAGE_KEYS.courses, []),
      assessments: loadLocal(STORAGE_KEYS.assessments, []),
      wamGoal: loadLocal(STORAGE_KEYS.wamGoal, ''),
    }

    const loadRemote = async () => {
      try {
        const remoteDoc = await getDoc(doc(db, 'user_data', user.uid))
        if (!isActive) return

        if (remoteDoc.exists()) {
          const data = remoteDoc.data() || {}
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
      } catch (error) {
        if (!isActive) return
        console.warn('Failed to load remote data', error)
        setCourses(localSnapshot.courses)
        setAssessments(localSnapshot.assessments)
        setWamGoal(localSnapshot.wamGoal)
      }

      if (!isActive) return
      hasLoadedRemoteRef.current = true
      setDataStatus('ready')
    }

    loadRemote()

    return () => {
      isActive = false
    }
  }, [user, persistUserData])

  useEffect(() => {
    if (!user) {
      setProfileOpen(false)
    }
  }, [user])

  useEffect(() => {
    removeLocal(STORAGE_KEYS.handbookCacheLegacy)
  }, [])

  const loadHandbookData = useCallback(
    async ({ force = false } = {}) => {
      if (!user) return
      setHandbookStatus('loading')
      setHandbookError('')

      const cachedMeta = loadLocal(STORAGE_KEYS.handbookMeta, null)
      let meta = null

      if (hasHandbookApi && !force) {
        try {
          meta = await fetchJson(buildApiUrl('/api/handbook/meta'))
        } catch {
          meta = null
        }
      }

      try {
        let payload = null
        if (hasHandbookApi) {
          try {
            payload = await fetchJson(buildApiUrl('/api/handbook'))
          } catch {
            payload = await fetchJson(HANDBOOK_DATA_URL)
          }
        } else {
          payload = await fetchJson(HANDBOOK_DATA_URL)
        }

        const items = Array.isArray(payload?.items) ? payload.items : []
        const version = payload?.version || meta?.version || null
        const generatedAt = payload?.generatedAt || meta?.generatedAt || null
        const studyPeriod = payload?.source?.studyPeriod || null
        const year = payload?.source?.year || null

        setHandbookData(items)
        setHandbookMeta({
          version,
          generatedAt,
          studyPeriod,
          year,
        })
        setHandbookStatus('ready')

        saveLocal(STORAGE_KEYS.handbookMeta, {
          version,
          generatedAt,
          studyPeriod,
          year,
          cachedAt: new Date().toISOString(),
        })
      } catch (error) {
        console.warn('Failed to load handbook data', error)
        if (cachedMeta) {
          setHandbookMeta(cachedMeta)
          setHandbookStatus('error')
          setHandbookError('Handbook data is temporarily unavailable.')
        } else {
          setHandbookMeta(null)
          setHandbookStatus('error')
          setHandbookError('Handbook data not available. Run the scraper first.')
        }
      }
    },
    [user],
  )

  useEffect(() => {
    if (!user) return
    loadHandbookData()
  }, [user, loadHandbookData])

  useEffect(() => {
    if (!user || !hasFirebaseConfig || !db || !hasLoadedRemoteRef.current) return
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
  }, [courses, assessments, wamGoal, user, persistUserData])

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

  const openHandbookDetailFromCourse = useCallback(
    (course) => {
      if (!course?.code) return false
      const normalizedCode = normalizeCourseCode(course.code)
      const matched = handbookIndex.get(normalizedCode)
      if (!matched) return false
      setHandbookDetail(matched)
      return true
    },
    [handbookIndex],
  )

  const normalizedHandbookQuery = normalizeCourseCode(handbookQuery)
  const handbookResult = normalizedHandbookQuery
    ? handbookIndex.get(normalizedHandbookQuery)
    : null

  useEffect(() => {
    if (!handbookResult || !handbookResultRef.current) return
    handbookResultRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, [handbookResult])

  useEffect(() => {
    if (!handbookResult) {
      setHandbookDetail(null)
    }
  }, [handbookResult])

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
      averages.set(course.id, getCourseAverage(assessmentsByCourse.get(course.id) || []))
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

  const semesterTitle =
    handbookMeta?.studyPeriod && handbookMeta?.year
      ? `${handbookMeta.studyPeriod}, ${handbookMeta.year}`
      : 'Current Semester'
  const handbookSubtitle =
    handbookMeta?.studyPeriod && handbookMeta?.year
      ? `${handbookMeta.year} ${handbookMeta.studyPeriod}`
      : 'Latest available data'

  const plannerSnapshot = useMemo(() => {
    const overdue = []
    const dueSoon = []
    const atRiskCourses = []

    assessments.forEach((assessment) => {
      if (assessment.completed || !assessment.dueDate) return
      const daysUntil = getDaysUntilDue(assessment.dueDate)
      if (daysUntil === null) return
      const item = { assessment, daysUntil }
      if (daysUntil < 0) {
        overdue.push(item)
      } else if (daysUntil <= DUE_SOON_DAYS) {
        dueSoon.push(item)
      }
    })

    courses.forEach((course) => {
      const goalStats = getGoalRequirement(
        assessmentsByCourse.get(course.id) || [],
        toNumberOrNull(course.targetMark ?? wamGoalNumber),
      )
      if (goalStats.status === 'active' && goalStats.required > 100) {
        atRiskCourses.push({
          course,
          required: goalStats.required,
          remainingWeight: goalStats.remainingWeight,
        })
      }
    })

    overdue.sort((a, b) => a.daysUntil - b.daysUntil)
    dueSoon.sort((a, b) => a.daysUntil - b.daysUntil)
    atRiskCourses.sort((a, b) => b.required - a.required)

    return {
      overdue,
      dueSoon,
      atRiskCourses,
    }
  }, [assessments, assessmentsByCourse, courses, wamGoalNumber])

  const primaryUrgentItem =
    plannerSnapshot.overdue[0] || plannerSnapshot.dueSoon[0] || null
  const primaryRiskCourse = plannerSnapshot.atRiskCourses[0] || null

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
  const upcomingAssessmentCount = assessments.length - completedAssessmentCount

  const handleSaveCourse = (payload) => {
    const { mode: payloadMode, ...courseData } = payload
    if (payloadMode === 'edit') {
      setCourses((prev) =>
        prev.map((course) => (course.id === courseData.id ? courseData : course)),
      )
    } else {
      if (courses.length >= MAX_COURSES) {
        window.alert(`Limit reached: up to ${MAX_COURSES} courses per semester.`)
        return
      }
      setCourses((prev) => [...prev, courseData])
    }
  }

  const handleDeleteCourse = (courseId) => {
    setCourses((prev) => prev.filter((course) => course.id !== courseId))
    setAssessments((prev) =>
      prev.filter((assessment) => assessment.courseId !== courseId),
    )
  }

  const openDeleteCoursePrompt = (course) => {
    if (!course) return
    if (deleteCourseTimeoutRef.current) {
      clearTimeout(deleteCourseTimeoutRef.current)
      deleteCourseTimeoutRef.current = null
    }
    setDeleteCourseBusy(false)
    setDeleteCoursePrompt(course)
  }

  const cancelDeleteCourse = () => {
    if (deleteCourseTimeoutRef.current) {
      clearTimeout(deleteCourseTimeoutRef.current)
      deleteCourseTimeoutRef.current = null
    }
    setDeleteCourseBusy(false)
    setDeleteCoursePrompt(null)
  }

  const confirmDeleteCourse = () => {
    if (!deleteCoursePrompt) return
    setDeleteCourseBusy(true)
    const targetId = deleteCoursePrompt.id
    deleteCourseTimeoutRef.current = setTimeout(() => {
      handleDeleteCourse(targetId)
      setDeleteCoursePrompt(null)
      setDeleteCourseBusy(false)
      deleteCourseTimeoutRef.current = null
    }, 350)
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

  const importHandbookAssessmentsForCourse = useCallback(
    (courseId) => {
      const course = courseMap.get(courseId)
      if (!course) {
        return { status: 'course-not-found', imported: 0, skipped: 0, total: 0 }
      }

      const subject = handbookIndex.get(normalizeCourseCode(course.code))
      if (!subject) {
        return {
          status: 'subject-not-found',
          imported: 0,
          skipped: 0,
          total: 0,
          courseCode: course.code,
        }
      }

      const drafts = mapHandbookSubjectToAssessments(subject)
      if (!drafts.length) {
        return {
          status: 'no-importable-rows',
          imported: 0,
          skipped: 0,
          total: 0,
          courseCode: course.code,
        }
      }

      const existingSignatures = new Set(
        assessments
          .filter((assessment) => assessment.courseId === courseId)
          .map(assessmentSignature),
      )
      const seenDraftSignatures = new Set()
      const imported = []

      drafts.forEach((draft) => {
        const candidate = {
          id: createId(),
          courseId,
          title: draft.title,
          type: draft.type,
          dueDate: draft.dueDate,
          weight: draft.weight,
          score: null,
          completed: false,
        }

        const signature = assessmentSignature(candidate)
        if (existingSignatures.has(signature) || seenDraftSignatures.has(signature)) {
          return
        }

        seenDraftSignatures.add(signature)
        imported.push(candidate)
      })

      if (!imported.length) {
        return {
          status: 'no-new-items',
          imported: 0,
          skipped: drafts.length,
          total: drafts.length,
          courseCode: course.code,
        }
      }

      setAssessments((prev) => [...prev, ...imported])
      return {
        status: 'imported',
        imported: imported.length,
        skipped: drafts.length - imported.length,
        total: drafts.length,
        courseCode: course.code,
      }
    },
    [assessments, courseMap, handbookIndex],
  )

  const handleAuthSubmit = async ({ email, password, mode }) => {
    if (!hasFirebaseConfig || !auth) return
    setAuthError('')
    setAuthNotice('')
    setAuthBusy(true)

    try {
      const isSignUp = mode === AUTH_VIEWS.signUp
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password)
        setAuthNotice('Account created. You are now signed in.')
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Auth error', error?.code, error?.message)
      }
      setAuthError(formatFirebaseAuthError(error, mode))
    }
    setAuthBusy(false)
  }

  const switchAuthView = (nextView) => {
    setAuthView(nextView)
    setAuthError('')
    setAuthNotice('')
  }

  const handleSignOut = async () => {
    if (!hasFirebaseConfig || !auth) return
    await signOut(auth)
  }

  const openAddCourse = () => {
    if (courses.length >= MAX_COURSES) {
      window.alert(`Limit reached: up to ${MAX_COURSES} courses per semester.`)
      return
    }
    setCourseModal({ open: true, mode: 'add', course: null })
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

  const displayName = getSafeDisplayName(user)
  const showDisplayName = displayName && displayName !== 'Student'

  return {
    hasFirebaseConfig,
    authView,
    setAuthView,
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
  }
}
