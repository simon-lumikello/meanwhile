/**
 * The settings dialog's quick search: a static index of every setting, matched by words
 * rather than exact names. Each entry's `id` is the `data-setting-id` anchor on the row
 * that holds it, so a result can switch to its section and scroll the row into view.
 */

export type SettingsTab = 'swimlanes' | 'display' | 'ambient' | 'radar' | 'backup'

export interface SettingsSearchEntry {
  /** The row's `data-setting-id` anchor. */
  id: string
  section: SettingsTab
  label: string
  description: string
  /** Synonyms and related words people might search for instead of the label. */
  keywords: string[]
  /**
   * The anchor to land on when this row isn't rendered, e.g. the night dimmer switch for
   * settings that show only while it is on.
   */
  fallback?: { id: string; hint: string }
}

export const SETTINGS_SECTION_LABELS: Record<SettingsTab, string> = {
  swimlanes: 'Lanes',
  display: 'Display',
  ambient: 'Ambient',
  radar: 'Weather Map',
  backup: 'Backup',
}

const NIGHT_DIMMER_FALLBACK = { id: 'night-dimmer', hint: 'Turn on the Ambient Night Dimmer to see this setting.' }
const WEATHER_LANE_FALLBACK = { id: 'lanes-add', hint: 'Add a weather lane to see this setting.' }
const LANE_FALLBACK = { id: 'lanes-add', hint: 'Add a lane to see this setting.' }
const CALENDAR_LANE_FALLBACK = { id: 'lanes-add', hint: 'Add a calendar lane to see this setting.' }

export const SETTINGS_SEARCH_INDEX: readonly SettingsSearchEntry[] = [
  // Lanes
  { id: 'lanes-add', section: 'swimlanes', label: 'Add a lane', description: 'Add a calendar or weather lane to the timeline.', keywords: ['new', 'create', 'member', 'person', 'family', 'calendar', 'weather', 'row', 'swimlane'] },
  { id: 'lane-name', section: 'swimlanes', label: 'Lane name', description: 'The title shown at the start of each lane.', keywords: ['title', 'rename', 'person', 'member', 'label'], fallback: LANE_FALLBACK },
  { id: 'lane-icon', section: 'swimlanes', label: 'Lane icon', description: 'The symbol shown beside a lane’s name.', keywords: ['symbol', 'emoji', 'avatar', 'picture'], fallback: LANE_FALLBACK },
  { id: 'lane-order', section: 'swimlanes', label: 'Reorder, hide, or delete lanes', description: 'Move lanes up or down, hide them from the timeline, or remove them.', keywords: ['order', 'sort', 'move', 'up', 'down', 'arrange', 'show', 'hide', 'visibility', 'delete', 'remove'], fallback: LANE_FALLBACK },
  { id: 'lane-color', section: 'swimlanes', label: 'Lane colour', description: 'The colour of a lane and its events.', keywords: ['color', 'colour', 'swatch', 'palette', 'tint'], fallback: LANE_FALLBACK },
  { id: 'lane-type', section: 'swimlanes', label: 'Lane type', description: 'Make a lane a calendar or the weather lane.', keywords: ['kind', 'calendar', 'weather', 'convert'], fallback: LANE_FALLBACK },
  { id: 'calendar-source', section: 'swimlanes', label: 'Calendar source', description: 'A calendar’s feed URL or a local .ics file.', keywords: ['url', 'ical', 'ics', 'feed', 'link', 'google', 'icloud', 'outlook', 'subscribe', 'import', 'file', 'events'], fallback: CALENDAR_LANE_FALLBACK },
  { id: 'weather-provider', section: 'swimlanes', label: 'Weather provider', description: 'Where forecasts come from: FMI for Finland or Open-Meteo worldwide.', keywords: ['forecast', 'source', 'fmi', 'open-meteo', 'service'], fallback: WEATHER_LANE_FALLBACK },
  { id: 'weather-location', section: 'swimlanes', label: 'Weather location', description: 'Hand-pick a place or detect it from the device and network.', keywords: ['city', 'town', 'place', 'municipality', 'gps', 'auto', 'detect', 'where', 'coordinates'], fallback: WEATHER_LANE_FALLBACK },
  { id: 'rain-alerts', section: 'swimlanes', label: 'Precipitation alerts', description: 'Detect rain or snow approaching within 15 km (FMI radar in Finland).', keywords: ['rain', 'snow', 'shower', 'nowcast', 'warning', 'notification'], fallback: WEATHER_LANE_FALLBACK },

  // Display
  { id: 'theme', section: 'display', label: 'Interface theme', description: 'Dark, light, or follow the operating system.', keywords: ['dark', 'light', 'mode', 'system', 'appearance', 'color', 'colour', 'scheme'] },
  { id: 'orientation', section: 'display', label: 'Timeline orientation', description: 'Time flowing left to right or top to bottom.', keywords: ['direction', 'horizontal', 'vertical', 'layout', 'rotate', 'portrait', 'landscape'] },
  { id: 'clock-format', section: 'display', label: '24-hour clock format', description: 'Show times as 24:00 instead of 12 AM/PM.', keywords: ['time', '12h', '24h', 'am', 'pm', 'hours', 'military'] },
  { id: 'grid-lines', section: 'display', label: 'Grid line contrast', description: 'How strongly the hour marks show on the timeline.', keywords: ['hour', 'marks', 'lines', 'intensity', 'subtle', 'vivid', 'grid'] },
  { id: 'zebra-striping', section: 'display', label: 'Calendar zebra striping', description: 'Alternate background shading between lanes.', keywords: ['stripes', 'alternate', 'shading', 'rows', 'background'] },
  { id: 'mute-past-events', section: 'display', label: 'Mute past events', description: 'Dim finished events so current and upcoming ones stand out.', keywords: ['past', 'finished', 'completed', 'dim', 'fade', 'elapsed'] },
  { id: 'kiosk-mode', section: 'display', label: 'Always-on kiosk mode', description: 'Wall display features such as the reset-to-today countdown.', keywords: ['wall', 'display', 'fullscreen', 'always', 'tablet', 'screen'] },
  { id: 'idle-reset', section: 'display', label: 'Kiosk auto-reset to today', description: 'Return to today after a few idle minutes on another date.', keywords: ['idle', 'timeout', 'return', 'today', 'inactivity', 'minutes', 'reset'] },

  // Ambient
  { id: 'night-dimmer', section: 'ambient', label: 'Ambient night dimmer', description: 'The dimmed clock and weather screen shown at night.', keywords: ['night', 'dim', 'screensaver', 'sleep', 'lock', 'screen', 'ambient', 'idle', 'dark'] },
  { id: 'night-schedule', section: 'ambient', label: 'Night dimming schedule', description: 'When the night screen starts in the evening and ends in the morning.', keywords: ['hours', 'start', 'end', 'wake', 'bedtime', 'morning', 'evening', 'time'], fallback: NIGHT_DIMMER_FALLBACK },
  { id: 'dim-after-last-event', section: 'ambient', label: 'Show weather when events conclude', description: 'Show the clock and weather once the day’s last event has ended.', keywords: ['last', 'event', 'done', 'finished', 'evening', 'early'], fallback: NIGHT_DIMMER_FALLBACK },
  { id: 'week-ahead', section: 'ambient', label: 'Show the week ahead', description: 'Forecast cards for the five days after tomorrow.', keywords: ['week', 'forecast', 'days', 'cards', 'future'], fallback: NIGHT_DIMMER_FALLBACK },
  { id: 'background-dim', section: 'ambient', label: 'Lock screen background darkness', description: 'How dark the night screen’s background gets.', keywords: ['brightness', 'darkness', 'dim', 'level', 'black', 'opacity'], fallback: NIGHT_DIMMER_FALLBACK },
  { id: 'card-dim', section: 'ambient', label: 'Cards & clock visibility', description: 'How bright the clock, date, and cards are at night.', keywords: ['brightness', 'opacity', 'dim', 'clock', 'cards', 'level'], fallback: NIGHT_DIMMER_FALLBACK },
  { id: 'aurora-alerts', section: 'ambient', label: 'Aurora borealis alerts', description: 'A Northern Lights glow when space weather and clear skies align.', keywords: ['northern', 'lights', 'aurora', 'kp', 'noaa', 'space', 'weather'], fallback: NIGHT_DIMMER_FALLBACK },

  // Weather Map
  { id: 'map-on-timeline', section: 'radar', label: 'Weather map on timeline', description: 'A live weather map in the corner of the timeline.', keywords: ['radar', 'map', 'rain', 'show', 'corner', 'widget'] },
  { id: 'map-on-ambient', section: 'radar', label: 'Weather map on ambient screen', description: 'A weather map card beside the night screen’s forecasts.', keywords: ['radar', 'map', 'night', 'card'] },
  { id: 'map-size', section: 'radar', label: 'Weather map size', description: 'Standard or compact map on both screens.', keywords: ['radar', 'compact', 'standard', 'small', 'large'] },
  { id: 'map-flights', section: 'radar', label: 'Live flight traffic', description: 'Aircraft over the map, from adsb.lol.', keywords: ['planes', 'airplanes', 'aircraft', 'flights', 'adsb', 'aviation'] },

  // Backup
  { id: 'backup-export', section: 'backup', label: 'Export configuration', description: 'Copy or download a backup of every setting.', keywords: ['backup', 'save', 'download', 'copy', 'json', 'transfer', 'move'] },
  { id: 'backup-import', section: 'backup', label: 'Import configuration', description: 'Restore settings from a backup file or pasted JSON.', keywords: ['restore', 'upload', 'load', 'json', 'paste', 'transfer'] },
  { id: 'privacy-storage', section: 'backup', label: 'Privacy & storage', description: 'Where settings are kept, and the self-hosting guide.', keywords: ['privacy', 'data', 'localstorage', 'telemetry', 'self-host', 'docker'] },
  { id: 'backup-reset', section: 'backup', label: 'Reset all to defaults', description: 'Start over with the factory settings.', keywords: ['factory', 'clear', 'wipe', 'default', 'start', 'over', 'erase'] },
]

export interface SettingsSearchResult {
  entry: SettingsSearchEntry
  score: number
}

const normalize = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '')

const words = (text: string) => normalize(text).split(/[^a-z0-9]+/).filter(Boolean)

/** True when `a` and `b` are at most one insertion, deletion, substitution, or swap apart. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)
  }
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a]
  return longer.slice(i + 1) === shorter.slice(i)
}

/** How well one query term matches a list of words: a whole word beats a prefix beats a typo. */
function termScore(term: string, candidates: string[]): number {
  let best = 0
  for (const word of candidates) {
    if (word === term) return 1
    // A prefix in the label (3 × 0.6) ranks below a whole keyword (2 × 1): "dark" finds the theme before "darkness".
    if (word.startsWith(term)) best = Math.max(best, term.length >= 2 ? 0.6 : 0.4)
    else if (term.length >= 3 && word.includes(term)) best = Math.max(best, 0.4)
    // Typos only for longer terms against words of a similar length (prefixes of long words included).
    else if (term.length >= 4 && (withinOneEdit(term, word) || withinOneEdit(term, word.slice(0, term.length)))) best = Math.max(best, 0.3)
  }
  return best
}

/**
 * The settings that match every word of `query`, best first. A match in the label counts
 * most, then a keyword, then the description or section name, so people find a setting
 * by what it does even when they don't remember what it is called.
 */
export function searchSettings(
  query: string,
  entries: readonly SettingsSearchEntry[] = SETTINGS_SEARCH_INDEX,
): SettingsSearchResult[] {
  const terms = words(query)
  if (terms.length === 0) return []
  const results: SettingsSearchResult[] = []
  for (const entry of entries) {
    const fields: [string[], number][] = [
      [words(entry.label), 3],
      [entry.keywords.flatMap(words), 2],
      [[...words(entry.description), ...words(SETTINGS_SECTION_LABELS[entry.section])], 1],
    ]
    let score = 0
    let matchedAll = true
    for (const term of terms) {
      const best = Math.max(...fields.map(([candidates, weight]) => termScore(term, candidates) * weight))
      if (best === 0) {
        matchedAll = false
        break
      }
      score += best
    }
    if (matchedAll) results.push({ entry, score })
  }
  // Stable: equal scores keep the index order, which follows the dialog's own order.
  return results.sort((a, b) => b.score - a.score)
}
