import type { SwimlaneConfig, TimelineOrientation } from '@dashboard/features/settings'

export interface ResolveVisibleLanesParams {
  swimlanes: SwimlaneConfig[]
  isMobile: boolean
  mobileLaneCount?: 1 | 2
  selectedLaneIds?: string[]
  fallbackIndex?: number
}

/**
 * Resolves the visible swimlanes for display.
 * - On desktop: returns all enabled swimlanes.
 * - On mobile: returns 1 or 2 swimlanes based on user selection.
 *   When 2 lanes are selected, any two lanes (even non-adjacent like first & last)
 *   can be displayed, preserving their natural configured left-to-right order.
 */
export function resolveVisibleLanes({
  swimlanes,
  isMobile,
  mobileLaneCount = 1,
  selectedLaneIds,
  fallbackIndex = 0,
}: ResolveVisibleLanesParams): SwimlaneConfig[] {
  const active = swimlanes.filter((l) => l.enabled)
  if (!isMobile || active.length <= 1) return active

  // Explicit selected lane IDs provided: preserve natural swimlane order
  if (selectedLaneIds && selectedLaneIds.length > 0) {
    const matched = active.filter((l) => selectedLaneIds.includes(l.id))
    if (matched.length > 0) {
      return matched.slice(0, mobileLaneCount)
    }
  }

  // Fallback: index-based slicing (backward compatible)
  const idx = Math.max(0, Math.min(fallbackIndex, active.length - 1))
  if (mobileLaneCount === 2) {
    if (idx + 1 < active.length) {
      return [active[idx], active[idx + 1]]
    } else if (idx > 0) {
      return [active[idx - 1], active[idx]]
    }
  }
  return [active[idx]]
}

/**
 * Handles toggling a lane in mobile view.
 * - In 1-lane mode: single-selects the clicked lane.
 * - In 2-lane mode:
 *   - If already selected and >1 lane is active: toggles it off.
 *   - If already selected and it's the only selected lane: keeps it selected (cannot have 0 lanes).
 *   - If unselected and <2 lanes selected: adds it.
 *   - If unselected and 2 lanes already selected: replaces the oldest selected lane (FIFO).
 */
export function toggleMobileLane(
  currentSelectedIds: string[],
  clickedLaneId: string,
  laneCount: 1 | 2
): string[] {
  if (laneCount === 1) {
    return [clickedLaneId]
  }

  const isAlreadySelected = currentSelectedIds.includes(clickedLaneId)

  if (isAlreadySelected) {
    // Only deselect if at least 1 other lane remains selected
    if (currentSelectedIds.length > 1) {
      return currentSelectedIds.filter((id) => id !== clickedLaneId)
    }
    return currentSelectedIds
  }

  // Adding an unselected lane:
  if (currentSelectedIds.length < 2) {
    return [...currentSelectedIds, clickedLaneId]
  }

  // If 2 are already selected, replace the oldest selection (FIFO)
  return [currentSelectedIds[1], clickedLaneId]
}

/**
 * Handles toggling between 1-lane and 2-lane view mode.
 */
export function toggleMobileLaneCount(
  currentCount: 1 | 2,
  currentSelectedIds: string[],
  activeLanes: SwimlaneConfig[]
): { newCount: 1 | 2; newSelectedIds: string[] } {
  if (currentCount === 1) {
    if (activeLanes.length <= 1) {
      return { newCount: 2, newSelectedIds: currentSelectedIds }
    }
    const currentId = currentSelectedIds[0] || activeLanes[0]?.id
    const currentIdx = activeLanes.findIndex((l) => l.id === currentId)
    let secondId: string
    if (currentIdx !== -1 && currentIdx < activeLanes.length - 1) {
      secondId = activeLanes[currentIdx + 1].id
    } else if (currentIdx > 0) {
      secondId = activeLanes[currentIdx - 1].id
    } else {
      secondId = activeLanes[1].id
    }
    return {
      newCount: 2,
      newSelectedIds: [currentId, secondId],
    }
  } else {
    const keepId = currentSelectedIds[0] || activeLanes[0]?.id
    return {
      newCount: 1,
      newSelectedIds: keepId ? [keepId] : [],
    }
  }
}

/**
 * Checks if mobile lanes can step in the given direction.
 */
export function canStepMobileLanes(
  activeLanes: SwimlaneConfig[],
  currentSelectedIds: string[],
  direction: 'prev' | 'next',
  laneCount: 1 | 2
): boolean {
  if (activeLanes.length <= 1) return false
  const activeIds = activeLanes.map((l) => l.id)
  const currentIndices = currentSelectedIds
    .map((id) => activeIds.indexOf(id))
    .filter((idx) => idx !== -1)
    .sort((a, b) => a - b)

  if (currentIndices.length === 0) return false

  if (laneCount === 1 || currentIndices.length === 1) {
    const idx = currentIndices[0]
    return direction === 'prev' ? idx > 0 : idx < activeLanes.length - 1
  }

  const [i, j] = currentIndices
  if (direction === 'prev') {
    return i > 0 || j > 1
  } else {
    return j < activeLanes.length - 1 || i < j - 1
  }
}

/**
 * Steps the mobile lane selection in the given direction.
 */
export function stepMobileLanes(
  activeLanes: SwimlaneConfig[],
  currentSelectedIds: string[],
  direction: 'prev' | 'next',
  laneCount: 1 | 2
): string[] {
  if (activeLanes.length === 0) return []
  if (activeLanes.length === 1) return [activeLanes[0].id]

  const activeIds = activeLanes.map((l) => l.id)
  const currentIndices = currentSelectedIds
    .map((id) => activeIds.indexOf(id))
    .filter((idx) => idx !== -1)
    .sort((a, b) => a - b)

  if (currentIndices.length === 0) {
    return laneCount === 2 && activeLanes.length >= 2
      ? [activeLanes[0].id, activeLanes[1].id]
      : [activeLanes[0].id]
  }

  if (laneCount === 1 || currentIndices.length === 1) {
    const idx = currentIndices[0]
    if (direction === 'prev') {
      const nextIdx = Math.max(0, idx - 1)
      return [activeLanes[nextIdx].id]
    } else {
      const nextIdx = Math.min(activeLanes.length - 1, idx + 1)
      return [activeLanes[nextIdx].id]
    }
  }

  // 2 lanes selected: indices [i, j] with i < j
  const [i, j] = currentIndices
  if (direction === 'prev') {
    if (i > 0) {
      return [activeLanes[i - 1].id, activeLanes[j - 1].id]
    } else if (j > 1) {
      return [activeLanes[0].id, activeLanes[j - 1].id]
    }
    return currentSelectedIds
  } else {
    if (j < activeLanes.length - 1) {
      return [activeLanes[i + 1].id, activeLanes[j + 1].id]
    } else if (i < j - 1) {
      return [activeLanes[i + 1].id, activeLanes[j].id]
    }
    return currentSelectedIds
  }
}

/**
 * Resolves the effective timeline orientation.
 * On mobile portrait viewports, always locks to 'vertical' flow so time
 * scrolls naturally top-to-bottom and lanes are columns side-by-side.
 * In landscape and desktop viewports, allows toggling between 'horizontal' and 'vertical'.
 */
export function getEffectiveOrientation(
  configuredOrientation: TimelineOrientation,
  isMobilePortrait: boolean
): TimelineOrientation {
  if (isMobilePortrait) {
    return 'vertical'
  }
  return configuredOrientation
}
