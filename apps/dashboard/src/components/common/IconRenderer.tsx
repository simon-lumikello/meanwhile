import React from 'react'
import {
  User,
  Heart,
  GraduationCap,
  Briefcase,
  Calendar,
  CloudSun,
  Activity,
  BookOpen,
  Music,
  Dumbbell,
  Smile,
  Star,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const iconMap: Record<string, LucideIcon> = {
  User,
  Heart,
  GraduationCap,
  Briefcase,
  Calendar,
  CloudSun,
  Activity,
  BookOpen,
  Music,
  Dumbbell,
  Smile,
  Star,
}

interface IconRendererProps {
  name: string
  className?: string
  size?: number
}

export const IconRenderer: React.FC<IconRendererProps> = ({ name, className = '', size = 18 }) => {
  const IconComponent = iconMap[name] || Calendar

  return <IconComponent className={className} size={size} />
}
