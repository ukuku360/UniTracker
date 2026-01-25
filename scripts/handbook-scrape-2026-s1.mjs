import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import * as cheerio from 'cheerio'

const DEFAULT_SEARCH_URL =
  'https://handbook.unimelb.edu.au/search?area_of_study%5B%5D=all&attendance_mode%5B%5D=all&campus%5B%5D=all&org_unit%5B%5D=all&page=1&query=mast&sort=_score%7Cdesc&study_periods%5B%5D=all&subject_level_type%5B%5D=undergraduate&types%5B%5D=subject&year=2026'

const args = process.argv.slice(2)
const argMap = new Map()
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (!arg.startsWith('--')) continue
  const key = arg.replace(/^--/, '')
  const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true
  argMap.set(key, value)
}

const searchUrl =
  argMap.get('search') || process.env.HANDBOOK_SEARCH_URL || DEFAULT_SEARCH_URL
const outputPath =
  argMap.get('output') ||
  path.join(process.cwd(), 'public', 'data', 'handbook-2026-s1.json')
const maxPagesArg = Number(
  argMap.get('max-pages') || process.env.HANDBOOK_MAX_PAGES || 0,
)
const concurrency = Number(argMap.get('concurrency') || 4)
const delayMs = Number(argMap.get('delay-ms') || 200)
const onlySemester1 = !argMap.has('all-semesters')
const baseUrl = new URL('https://handbook.unimelb.edu.au')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const cleanText = (value) => {
  const text =
    typeof value === 'string'
      ? value
      : value === undefined || value === null
        ? ''
        : String(value)
  return text
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const extractEmails = (value) => {
  if (!value) return []
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)
  return matches ? [...new Set(matches.map((email) => email.trim()))] : []
}

const fetchWithRetry = async (url, { retries = 3 } = {}) => {
  let attempt = 0
  while (attempt <= retries) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent':
            'UniTrackerScraper/1.0',
        },
      })
      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) {
          throw new Error(`HTTP ${response.status}`)
        }
        return await response.text()
      }
      return await response.text()
    } catch (error) {
      attempt += 1
      if (attempt > retries) {
        throw error
      }
      await sleep(500 * attempt)
    }
  }
  return ''
}

const parseMaxPage = (html) => {
  const pages = [...html.matchAll(/page=(\d+)/g)].map((match) => Number(match[1]))
  if (!pages.length) return 1
  return Math.max(...pages)
}

const parseSearchPage = (html) => {
  const $ = cheerio.load(html)
  const items = []
  $('.search-result-item').each((_, item) => {
    const code = cleanText($(item).find('.search-result-item__code').text())
    if (!code) return
    const nameText = cleanText($(item).find('.search-result-item__name').text())
    const name = cleanText(nameText.replace(code, '')) || nameText
    const href = $(item).find('a.search-result-item__anchor').attr('href')
    const offered = cleanText(
      $(item).find('.search-result-item__meta-primary').text(),
    )
    items.push({
      code: code.toUpperCase(),
      name,
      href,
      offered,
    })
  })
  return items
}

const parseOverview = ($) => {
  const wrapper = $('.course__overview-wrapper').first()
  if (!wrapper.length) return []
  const parts = []
  wrapper.children().each((_, child) => {
    const element = $(child)
    if (element.hasClass('course__overview-box')) return
    const text = cleanText(element.text())
    if (!text) return
    const split = text.split(/\n\n+/).map((chunk) => cleanText(chunk))
    split.forEach((chunk) => {
      if (chunk) parts.push(chunk)
    })
  })
  return parts
}

const parseAvailability = ($) => {
  const boxText = cleanText($('.course__overview-box').text())
  return boxText
}

const parseAssessmentTables = ($, semesterLabel = 'Semester 1') => {
  const headings = $('h3, h4').filter((_, el) =>
    $(el).text().toLowerCase().includes(semesterLabel.toLowerCase()),
  )
  if (!headings.length) return []
  const heading = headings.first()
  const tables = []
  let node = heading.next()
  while (node.length) {
    if (node.is('h2') || node.is('h3') || node.is('h4')) break
    if (node.is('table')) {
      const headers = []
      node
        .find('thead th')
        .each((_, th) => headers.push(cleanText($(th).text())))
      if (!headers.length) {
        node
          .find('tr')
          .first()
          .find('th, td')
          .each((_, cell) => headers.push(cleanText($(cell).text())))
      }
      const rows = []
      node.find('tbody tr').each((_, row) => {
        const cells = $(row).find('td')
        if (!cells.length) return
        const rowData = {}
        cells.each((index, cell) => {
          const key = headers[index] || `Column ${index + 1}`
          rowData[key] = cleanText($(cell).text())
        })
        rows.push(rowData)
      })
      if (rows.length) {
        tables.push({
          columns: headers,
          rows,
        })
      }
    }
    node = node.next()
  }
  return tables
}

const parseSemesterEmails = ($, semesterLabel = 'Semester 1') => {
  const emails = new Set()
  const semesterHeading = $('h5')
    .filter((_, el) =>
      $(el).text().toLowerCase().includes(semesterLabel.toLowerCase()),
    )
    .first()
  if (semesterHeading.length) {
    let node = semesterHeading.next()
    while (node.length) {
      if (node.is('h5') || node.is('h3') || node.is('h2')) break
      extractEmails(node.text()).forEach((email) => emails.add(email))
      node = node.next()
    }
  }
  return [...emails]
}

const buildUrl = (href) => new URL(href, baseUrl).toString()

const asyncPool = async (limit, list, iterator) => {
  const results = []
  const executing = new Set()
  for (const item of list) {
    const promise = Promise.resolve().then(() => iterator(item))
    results.push(promise)
    executing.add(promise)
    const clean = () => executing.delete(promise)
    promise.then(clean).catch(clean)
    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }
  return Promise.all(results)
}

const run = async () => {
  const searchConfig = new URL(searchUrl)
  searchConfig.searchParams.set('page', '1')
  const firstPageHtml = await fetchWithRetry(searchConfig.toString())
  const maxPage = maxPagesArg || parseMaxPage(firstPageHtml)

  console.log(`Search pages: ${maxPage}`)
  const searchItems = []

  for (let page = 1; page <= maxPage; page += 1) {
    const pageUrl = new URL(searchConfig.toString())
    pageUrl.searchParams.set('page', String(page))
    const html = page === 1 ? firstPageHtml : await fetchWithRetry(pageUrl.toString())
    const items = parseSearchPage(html)
    if (!items.length) {
      console.log(`No items found on page ${page}. Stopping.`)
      break
    }
    items.forEach((item) => searchItems.push(item))
    console.log(`Page ${page}: ${items.length} items`)
    await sleep(delayMs)
  }

  const uniqueItems = new Map()
  searchItems.forEach((item) => {
    if (item.code) uniqueItems.set(item.code, item)
  })

  const itemsList = [...uniqueItems.values()]
  console.log(`Total unique subjects: ${itemsList.length}`)

  const results = []
  let processed = 0
  let skipped = 0

  await asyncPool(concurrency, itemsList, async (item) => {
    processed += 1
    const sem1Hint = /semester\s*1/i.test(item.offered || '')
    if (onlySemester1 && item.offered && !sem1Hint) {
      skipped += 1
      return
    }

    await sleep(delayMs)
    const subjectUrl = buildUrl(item.href || `/2026/subjects/${item.code.toLowerCase()}`)
    let subjectHtml
    try {
      subjectHtml = await fetchWithRetry(subjectUrl)
    } catch (error) {
      console.warn(`Failed to fetch subject ${item.code}:`, error.message)
      return
    }

    const $subject = cheerio.load(subjectHtml)
    const availability = parseAvailability($subject)
    const pointsMeta = $subject('meta[name=\"points\"]').attr('content')
    const creditPoints = pointsMeta ? Number(pointsMeta) : null
    if (onlySemester1 && availability && !/semester\s*1/i.test(availability)) {
      skipped += 1
      return
    }

    const overview = parseOverview($subject)

    await sleep(delayMs)
    const assessmentUrl = `${subjectUrl.replace(/\/$/, '')}/assessment`
    let assessmentTables = []
    let instructorEmails = []

    try {
      const assessmentHtml = await fetchWithRetry(assessmentUrl)
      const $assessment = cheerio.load(assessmentHtml)
      assessmentTables = parseAssessmentTables($assessment, 'Semester 1')
      instructorEmails = parseSemesterEmails($assessment, 'Semester 1')
    } catch (error) {
      console.warn(`Failed to fetch assessment ${item.code}:`, error.message)
    }

    if (!instructorEmails.length) {
      const datesUrl = `${subjectUrl.replace(/\/$/, '')}/dates-times`
      try {
        await sleep(delayMs)
        const datesHtml = await fetchWithRetry(datesUrl)
        const $dates = cheerio.load(datesHtml)
        instructorEmails = parseSemesterEmails($dates, 'Semester 1')
      } catch (error) {
        console.warn(`Failed to fetch dates-times ${item.code}:`, error.message)
      }
    }

    results.push({
      code: item.code,
      name: item.name,
      year: 2026,
      studyPeriod: 'Semester 1',
      creditPoints: Number.isFinite(creditPoints) ? creditPoints : null,
      overview,
      assessment: {
        tables: assessmentTables,
      },
      instructorEmails,
      availability,
      source: {
        subjectUrl,
        assessmentUrl,
      },
    })

    if (processed % 10 === 0) {
      console.log(`Processed ${processed}/${itemsList.length}`)
    }
  })

  results.sort((a, b) => a.code.localeCompare(b.code))

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  const version = crypto
    .createHash('sha256')
    .update(JSON.stringify(results))
    .digest('hex')
    .slice(0, 12)

  const payload = {
    generatedAt: new Date().toISOString(),
    version,
    source: {
      searchUrl: searchConfig.toString(),
      studyPeriod: 'Semester 1',
      year: 2026,
    },
    stats: {
      totalFound: itemsList.length,
      totalSaved: results.length,
      skipped,
    },
    items: results,
  }

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2))
  console.log(`Saved ${results.length} subjects to ${outputPath}`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
