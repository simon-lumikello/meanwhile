import type { CalendarEvent } from '@dashboard/features/timeline'

// ─── Day-of-week helpers ────────────────────────────────────────────────────


function isWeekend(date: Date) {
  const d = date.getDay()
  return d === 0 || d === 6
}

// ─── Rich demo event set ─────────────────────────────────────────────────────
// Each call generates events for the given date.
// Events vary naturally by day-of-week to make navigating days feel alive.

export function getMockEventsForDate(targetDate: Date): CalendarEvent[] {
  const year = targetDate.getFullYear()
  const month = targetDate.getMonth()
  const day = targetDate.getDate()
  const dow = targetDate.getDay() // 0 = Sun … 6 = Sat
  const weekend = isWeekend(targetDate)

  const now = new Date()
  const isToday =
    now.getFullYear() === year && now.getMonth() === month && now.getDate() === day

  const ev = (
    id: string,
    swimlaneId: string,
    title: string,
    location: string,
    startH: number,
    startM: number,
    endH: number,
    endM: number,
    isAllDay = false,
  ): CalendarEvent => ({
    id,
    swimlaneId,
    title,
    location,
    start: new Date(year, month, day, startH, startM),
    end: new Date(year, month, day, endH, endM),
    isAllDay,
  })

  const events: CalendarEvent[] = []

  // ── Dad's lane ─────────────────────────────────────────────────────────────
  if (!weekend) {
    // Weekday gym / run (Mon, Wed, Fri)
    if (dow === 1 || dow === 3 || dow === 5) {
      events.push(ev('mock-dad-gym', 'lane-dad', 'Morning Run & Gym', 'Fitness Center', 6, 45, 8, 0))
    }
    // Daily standup
    events.push(ev('mock-dad-standup', 'lane-dad', 'Team Standup', 'Google Meet', 9, 30, 9, 45))
    // Work block varies by day
    const workTitles = ['', 'Product Planning', 'Deep Work – API Design', 'Architecture Review', 'Code Review & Merges', 'Sprint Demo Prep', '', '']
    events.push(ev('mock-dad-work', 'lane-dad', workTitles[dow] || 'Focus Block', 'Home Office', 10, 0, 12, 30))
    // Afternoon work
    events.push(ev('mock-dad-work2', 'lane-dad', dow === 5 ? 'Week Wrap-up & Planning' : 'Focus Block', 'Home Office', 14, 0, 17, 30))
    // Tuesday: 1-1 with manager
    if (dow === 2) {
      events.push(ev('mock-dad-11', 'lane-dad', '1:1 with Manager', 'Zoom', 11, 0, 11, 45))
    }
    // Thursday: all-hands
    if (dow === 4) {
      events.push(ev('mock-dad-allhands', 'lane-dad', 'Company All-Hands', 'Zoom', 16, 0, 17, 0))
    }
  } else {
    // Weekend
    if (dow === 6) {
      // Saturday: longer outdoor activity
      events.push(ev('mock-dad-hike', 'lane-dad', 'Trail Run – City Park', 'Riverside Trail', 8, 0, 10, 0))
      events.push(ev('mock-dad-errands', 'lane-dad', 'Grocery & Errands', 'Supermarket', 11, 0, 12, 30))
    } else {
      // Sunday: relaxed
      events.push(ev('mock-dad-read', 'lane-dad', 'Coffee & Reading', 'Kitchen', 9, 0, 10, 30))
    }
  }

  // ── Mom's lane ─────────────────────────────────────────────────────────────
  if (!weekend) {
    // Yoga on Mon / Wed / Fri
    if (dow === 1 || dow === 3 || dow === 5) {
      events.push(ev('mock-mom-yoga', 'lane-mom', 'Morning Yoga Flow', 'Home Studio', 7, 30, 8, 30))
    }
    // Work varies by day
    const momWorkTitles = ['', 'Client Brief Review', 'UX Workshop – Wireframes', 'Stakeholder Presentation', 'Creative Sprint', 'Portfolio Review', '', '']
    events.push(ev('mock-mom-work', 'lane-mom', momWorkTitles[dow] || 'Design Session', 'Studio Loft', 9, 0, 12, 0))
    events.push(ev('mock-mom-work2', 'lane-mom', 'Client Project', 'Studio Loft', 13, 30, 16, 30))
    // Thursday: team check-in
    if (dow === 4) {
      events.push(ev('mock-mom-checkin', 'lane-mom', 'Design Team Check-in', 'Figma Huddle', 10, 0, 10, 30))
    }
    // Wednesday: therapy / wellness
    if (dow === 3) {
      events.push(ev('mock-mom-therapy', 'lane-mom', 'Wellness Appointment', 'City Health Clinic', 17, 0, 18, 0))
    }
  } else {
    if (dow === 6) {
      events.push(ev('mock-mom-market', 'lane-mom', 'Farmers Market', 'Town Square', 9, 0, 10, 30))
      events.push(ev('mock-mom-friend', 'lane-mom', 'Lunch with Sarah', 'Café Riviera', 12, 0, 13, 30))
    } else {
      events.push(ev('mock-mom-brunch', 'lane-mom', 'Family Brunch Prep', 'Kitchen', 10, 0, 11, 30))
    }
  }

  // ── Kids' lane ─────────────────────────────────────────────────────────────
  if (!weekend) {
    events.push(ev('mock-kids-bus', 'lane-kids', 'School Bus Pickup', 'Corner Stop', 8, 10, 8, 30))
    events.push(ev('mock-kids-school', 'lane-kids', 'School & Classes', 'Primary School', 8, 30, 14, 15))
    // After-school activity varies by day
    if (dow === 1 || dow === 4) {
      events.push(ev('mock-kids-soccer', 'lane-kids', 'Youth Soccer Practice', 'Sports Park Field 2', 16, 0, 17, 30))
    } else if (dow === 2) {
      events.push(ev('mock-kids-piano', 'lane-kids', 'Piano Lesson', 'Music School', 15, 30, 16, 15))
    } else if (dow === 5) {
      events.push(ev('mock-kids-library', 'lane-kids', 'Library & Reading Club', 'City Library', 15, 0, 16, 0))
    }
  } else {
    if (dow === 6) {
      events.push(ev('mock-kids-game', 'lane-kids', 'Soccer Match – Home Game', 'Sports Park', 10, 0, 12, 0))
      events.push(ev('mock-kids-playday', 'lane-kids', 'Playdate at Jamie\'s', 'Neighbour\'s Home', 14, 0, 17, 0))
    } else {
      events.push(ev('mock-kids-bike', 'lane-kids', 'Bike Ride & Park Time', 'Riverside Park', 11, 0, 13, 0))
    }
  }

  // ── Family shared lane ──────────────────────────────────────────────────────
  if (!weekend) {
    // Dinner every weeknight
    events.push(ev('mock-fam-dinner', 'lane-family', 'Family Dinner', 'Dining Room', 18, 30, 19, 30))
    // Monday: week kick-off chat
    if (dow === 1) {
      events.push(ev('mock-fam-week', 'lane-family', 'Weekly Family Check-in', 'Living Room', 19, 45, 20, 15))
    }
    // Friday: movie night
    if (dow === 5) {
      events.push(ev('mock-fam-movie', 'lane-family', 'Movie Night 🍿', 'Living Room', 20, 0, 22, 0))
    }
    // Wednesday: board games
    if (dow === 3) {
      events.push(ev('mock-fam-games', 'lane-family', 'Board Games Night', 'Living Room', 19, 30, 21, 0))
    }
  } else {
    if (dow === 6) {
      // Saturday: BBQ / outing
      events.push(ev('mock-fam-bbq', 'lane-family', 'Backyard BBQ & Hangout', 'Backyard', 17, 0, 20, 0))
    } else {
      // Sunday: prep week / relax
      events.push(ev('mock-fam-prep', 'lane-family', 'Week Prep & Meal Planning', 'Kitchen', 16, 0, 17, 30))
      events.push(ev('mock-fam-sunday', 'lane-family', 'Family Board Games', 'Living Room', 19, 0, 21, 0))
    }
  }

  // ── Dynamic "ongoing now" event for today ───────────────────────────────────
  // Shows the playhead split-muting effect immediately on first load.
  if (isToday) {
    const startMs = now.getTime() - 45 * 60 * 1000
    const endMs = now.getTime() + 45 * 60 * 1000
    events.push({
      id: 'mock-ongoing-focus',
      swimlaneId: 'lane-dad',
      title: weekend ? 'Relaxing at Home ☕' : 'Current Focus: Deep Work & Coding',
      location: 'Home Office',
      start: new Date(startMs),
      end: new Date(endMs),
      isAllDay: false,
    })
  }

  return events
}
