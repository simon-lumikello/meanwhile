import { describe, expect, it } from 'bun:test'
import type { SwimlaneConfig } from '@dashboard/features/settings'
import {
  resolveVisibleLanes,
  toggleMobileLane,
  toggleMobileLaneCount,
  canStepMobileLanes,
  stepMobileLanes,
  getEffectiveOrientation,
} from '@dashboard/features/timeline'

describe('Mobile Lane Slicing & Responsive Utilities', () => {
  const mockLanes: SwimlaneConfig[] = [
    {
      id: 'lane-1',
      title: 'Dad',
      type: 'google-calendar',
      enabled: true,
      icon: 'User',
      colorScheme: { primary: '#3b82f6', secondary: 'rgba(59, 130, 246, 0.16)', accent: '#60a5fa', text: '#ffffff' },
      source: { endpoint: '' },
    },
    {
      id: 'lane-2',
      title: 'Mom',
      type: 'google-calendar',
      enabled: true,
      icon: 'Heart',
      colorScheme: { primary: '#ec4899', secondary: 'rgba(236, 72, 153, 0.16)', accent: '#f472b6', text: '#ffffff' },
      source: { endpoint: '' },
    },
    {
      id: 'lane-3',
      title: 'Kids',
      type: 'google-calendar',
      enabled: true,
      icon: 'GraduationCap',
      colorScheme: { primary: '#10b981', secondary: 'rgba(16, 185, 129, 0.16)', accent: '#34d399', text: '#ffffff' },
      source: { endpoint: '' },
    },
    {
      id: 'lane-4',
      title: 'Weather',
      type: 'weather',
      enabled: true,
      icon: 'CloudSun',
      colorScheme: { primary: '#06b6d4', secondary: 'rgba(6, 182, 212, 0.16)', accent: '#22d3ee', text: '#ffffff' },
      source: { endpoint: '' },
    },
  ]

  it('returns all lanes when isMobile is false (Desktop invariant)', () => {
    const visible = resolveVisibleLanes({
      swimlanes: mockLanes,
      isMobile: false,
      fallbackIndex: 0,
      mobileLaneCount: 1,
    })
    expect(visible.length).toBe(4)
    expect(visible.map((l) => l.id)).toEqual(['lane-1', 'lane-2', 'lane-3', 'lane-4'])
  })

  it('returns exactly 1 lane when in 1-Lane mobile mode', () => {
    const visibleFirst = resolveVisibleLanes({
      swimlanes: mockLanes,
      isMobile: true,
      fallbackIndex: 0,
      mobileLaneCount: 1,
    })
    expect(visibleFirst.length).toBe(1)
    expect(visibleFirst[0].id).toBe('lane-1')

    const visibleSecond = resolveVisibleLanes({
      swimlanes: mockLanes,
      isMobile: true,
      fallbackIndex: 1,
      mobileLaneCount: 1,
    })
    expect(visibleSecond.length).toBe(1)
    expect(visibleSecond[0].id).toBe('lane-2')

    const visibleLast = resolveVisibleLanes({
      swimlanes: mockLanes,
      isMobile: true,
      fallbackIndex: 3,
      mobileLaneCount: 1,
    })
    expect(visibleLast.length).toBe(1)
    expect(visibleLast[0].id).toBe('lane-4')
  })

  it('returns exactly 2 lanes when in 2-Lanes mobile mode (adjacent fallback)', () => {
    const visiblePair1 = resolveVisibleLanes({
      swimlanes: mockLanes,
      isMobile: true,
      fallbackIndex: 0,
      mobileLaneCount: 2,
    })
    expect(visiblePair1.length).toBe(2)
    expect(visiblePair1.map((l) => l.id)).toEqual(['lane-1', 'lane-2'])

    const visiblePair2 = resolveVisibleLanes({
      swimlanes: mockLanes,
      isMobile: true,
      fallbackIndex: 1,
      mobileLaneCount: 2,
    })
    expect(visiblePair2.length).toBe(2)
    expect(visiblePair2.map((l) => l.id)).toEqual(['lane-2', 'lane-3'])

    // Boundary condition: selecting the very last lane clamps to previous pair
    const visiblePairLast = resolveVisibleLanes({
      swimlanes: mockLanes,
      isMobile: true,
      fallbackIndex: 3,
      mobileLaneCount: 2,
    })
    expect(visiblePairLast.length).toBe(2)
    expect(visiblePairLast.map((l) => l.id)).toEqual(['lane-3', 'lane-4'])
  })

  it('supports selecting non-adjacent lanes simultaneously in 2-Lane mode (e.g. first and last)', () => {
    // Select first ('lane-1') and last ('lane-4') lane
    const visible = resolveVisibleLanes({
      swimlanes: mockLanes,
      isMobile: true,
      mobileLaneCount: 2,
      selectedLaneIds: ['lane-1', 'lane-4'],
    })
    expect(visible.length).toBe(2)
    expect(visible[0].id).toBe('lane-1')
    expect(visible[1].id).toBe('lane-4')
    expect(visible.map((l) => l.title)).toEqual(['Dad', 'Weather'])
  })

  it('preserves natural left-to-right configured order regardless of selection order', () => {
    // Even if user clicked lane-4 first then lane-1, natural order lane-1 -> lane-4 is preserved
    const visible = resolveVisibleLanes({
      swimlanes: mockLanes,
      isMobile: true,
      mobileLaneCount: 2,
      selectedLaneIds: ['lane-4', 'lane-1'],
    })
    expect(visible.length).toBe(2)
    expect(visible.map((l) => l.id)).toEqual(['lane-1', 'lane-4'])
  })

  it('clamps safely when fallbackIndex is out of range', () => {
    const negativeClamped = resolveVisibleLanes({
      swimlanes: mockLanes,
      isMobile: true,
      fallbackIndex: -5,
      mobileLaneCount: 1,
    })
    expect(negativeClamped.length).toBe(1)
    expect(negativeClamped[0].id).toBe('lane-1')

    const overflowClamped = resolveVisibleLanes({
      swimlanes: mockLanes,
      isMobile: true,
      fallbackIndex: 99,
      mobileLaneCount: 1,
    })
    expect(overflowClamped.length).toBe(1)
    expect(overflowClamped[0].id).toBe('lane-4')
  })
})

describe('toggleMobileLane logic', () => {
  it('single-selects in 1-lane mode', () => {
    expect(toggleMobileLane(['lane-1'], 'lane-3', 1)).toEqual(['lane-3'])
    expect(toggleMobileLane(['lane-3'], 'lane-4', 1)).toEqual(['lane-4'])
  })

  it('toggles lane off when already selected in 2-lane mode and >1 lane is selected', () => {
    // Tessa & Markus selected, clicking Tessa deselects Tessa leaving Markus
    const result = toggleMobileLane(['lane-2', 'lane-3'], 'lane-2', 2)
    expect(result).toEqual(['lane-3'])
  })

  it('prevents deselecting the only selected lane (maintaining >= 1 lane)', () => {
    const result = toggleMobileLane(['lane-2'], 'lane-2', 2)
    expect(result).toEqual(['lane-2'])
  })

  it('adds lane when unselected and only 1 lane is selected in 2-lane mode', () => {
    const result = toggleMobileLane(['lane-3'], 'lane-1', 2)
    expect(result).toEqual(['lane-3', 'lane-1'])
  })

  it('replaces oldest selected lane (FIFO) when 2 lanes are already selected', () => {
    // Current: [lane-2, lane-3]. User clicks lane-1 (Dad / first lane)
    // lane-2 is dropped, lane-3 kept, lane-1 added
    const result = toggleMobileLane(['lane-2', 'lane-3'], 'lane-1', 2)
    expect(result).toEqual(['lane-3', 'lane-1'])
  })
})

describe('toggleMobileLaneCount logic', () => {
  const mockLanes = [
    { id: 'lane-1', enabled: true } as SwimlaneConfig,
    { id: 'lane-2', enabled: true } as SwimlaneConfig,
    { id: 'lane-3', enabled: true } as SwimlaneConfig,
  ]

  it('switches from 1 to 2 lanes by selecting an adjacent companion', () => {
    const res = toggleMobileLaneCount(1, ['lane-1'], mockLanes)
    expect(res.newCount).toBe(2)
    expect(res.newSelectedIds).toEqual(['lane-1', 'lane-2'])
  })

  it('switches from 2 to 1 lane by retaining the first selected lane', () => {
    const res = toggleMobileLaneCount(2, ['lane-1', 'lane-3'], mockLanes)
    expect(res.newCount).toBe(1)
    expect(res.newSelectedIds).toEqual(['lane-1'])
  })
})

describe('stepMobileLanes and canStepMobileLanes', () => {
  const mockLanes = [
    { id: 'lane-1', enabled: true } as SwimlaneConfig,
    { id: 'lane-2', enabled: true } as SwimlaneConfig,
    { id: 'lane-3', enabled: true } as SwimlaneConfig,
    { id: 'lane-4', enabled: true } as SwimlaneConfig,
  ]

  it('steps 1 lane left and right in 1-lane mode', () => {
    expect(canStepMobileLanes(mockLanes, ['lane-1'], 'prev', 1)).toBe(false)
    expect(canStepMobileLanes(mockLanes, ['lane-1'], 'next', 1)).toBe(true)
    expect(stepMobileLanes(mockLanes, ['lane-1'], 'next', 1)).toEqual(['lane-2'])
    expect(stepMobileLanes(mockLanes, ['lane-2'], 'prev', 1)).toEqual(['lane-1'])
  })

  it('steps 2 lanes when adjacent in 2-lane mode', () => {
    expect(stepMobileLanes(mockLanes, ['lane-1', 'lane-2'], 'next', 2)).toEqual(['lane-2', 'lane-3'])
    expect(stepMobileLanes(mockLanes, ['lane-2', 'lane-3'], 'prev', 2)).toEqual(['lane-1', 'lane-2'])
  })

  it('steps correctly when first and last lanes are selected', () => {
    // First and fourth lanes: [lane-1, lane-4]
    expect(canStepMobileLanes(mockLanes, ['lane-1', 'lane-4'], 'prev', 2)).toBe(true)
    expect(canStepMobileLanes(mockLanes, ['lane-1', 'lane-4'], 'next', 2)).toBe(true)
  })
})

describe('getEffectiveOrientation responsive orientation locking', () => {
  it('locks to vertical flow when on mobile in portrait regardless of configured orientation', () => {
    // Even if configured as 'horizontal', portrait mobile must always render 'vertical' flow
    expect(getEffectiveOrientation('horizontal', true)).toBe('vertical')
    expect(getEffectiveOrientation('vertical', true)).toBe('vertical')
  })

  it('preserves configured orientation in landscape and desktop modes', () => {
    // In landscape/desktop (isMobilePortrait === false), orientation can be freely toggled
    expect(getEffectiveOrientation('horizontal', false)).toBe('horizontal')
    expect(getEffectiveOrientation('vertical', false)).toBe('vertical')
  })
})
