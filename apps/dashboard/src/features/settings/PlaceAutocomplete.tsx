import { useState } from 'react'
import { LocationSearch } from '@simon-lumikello/meanwhile-ui/react'
import type { LocationSearchResult } from '@simon-lumikello/meanwhile-weather/providers'
import { useLocationSearchQuery } from '@simon-lumikello/meanwhile-weather/query'

export type GeocodingResult = LocationSearchResult

interface Props {
  value: string
  onSelect: (result: GeocodingResult) => void
  /** Provider id – FMI restricts to Finnish places, Open-Meteo is worldwide */
  providerId?: string
}

export function PlaceAutocomplete({ value, onSelect, providerId }: Props) {
  const [query, setQuery] = useState('')
  const search = useLocationSearchQuery({ query, providerId })

  return (
    <LocationSearch
      size="sm"
      className="w-48"
      label="Search place"
      placeholder={providerId === 'fmi' ? 'e.g. Jyväskylä, Tampere…' : 'e.g. Helsinki, Berlin…'}
      value={value}
      onSearch={setQuery}
      results={search.data}
      isLoading={search.isFetching}
      isError={search.isError}
      onSelect={onSelect}
    />
  )
}
