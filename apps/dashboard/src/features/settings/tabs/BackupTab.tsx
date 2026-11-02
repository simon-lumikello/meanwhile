import React, { useState, useRef } from 'react'
import {
  Download,
  Upload,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  HardDrive,
  FileCode,
  Server,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@simon-lumikello/meanwhile-ui/react'
import type { DashboardConfig } from '@dashboard/features/settings/types'
import { exportConfigAsJson, importConfigFromJson } from '@dashboard/features/settings/storage'
import { DEFAULT_CONFIG } from '@dashboard/features/settings/defaultConfig'
import { useCopyFeedback } from '@dashboard/hooks/useCopyFeedback'

interface BackupTabProps {
  editingConfig: DashboardConfig
  setEditingConfig: React.Dispatch<React.SetStateAction<DashboardConfig>>
  onOpenPrivacy: () => void
  onOpenSelfHost?: () => void
}

export const BackupTab: React.FC<BackupTabProps> = ({
  editingConfig,
  setEditingConfig,
  onOpenPrivacy,
  onOpenSelfHost,
}) => {
  const [importJsonText, setImportJsonText] = useState('')
  const [importStatus, setImportStatus] = useState<{ text: string; isError: boolean } | null>(null)
  const { feedback, copy } = useCopyFeedback(2500)
  const copied = feedback?.copied === true
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCopyJson = async () => {
    if (!(await copy('config', exportConfigAsJson(editingConfig)))) {
      setImportStatus({ text: 'Failed to copy to clipboard. Please download JSON instead.', isError: true })
    }
  }

  const handleDownloadJson = () => {
    const json = exportConfigAsJson(editingConfig)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meanwhile-config-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImportText = () => {
    if (!importJsonText.trim()) {
      setImportStatus({ text: 'Please paste configuration JSON first.', isError: true })
      return
    }
    try {
      const parsed = importConfigFromJson(importJsonText)
      setEditingConfig(parsed)
      setImportStatus({ text: 'Configuration imported. Press Apply to save it.', isError: false })
      setImportJsonText('')
    } catch (error: unknown) {
      setImportStatus({ text: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`, isError: true })
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const parsed = importConfigFromJson(text)
        setEditingConfig(parsed)
        setImportStatus({
          text: `Backup file "${file.name}" imported. Press Apply to save it.`,
          isError: false,
        })
      } catch (error: unknown) {
        setImportStatus({ text: `Failed to import file: ${error instanceof Error ? error.message : 'Unknown error'}`, isError: true })
      }
    }
    reader.readAsText(file)
  }

  const handleResetDefaults = () => {
    if (confirm('Reset dashboard configuration to factory default settings? All custom calendars and layout tweaks will be cleared when you press Apply.')) {
      setEditingConfig(DEFAULT_CONFIG)
      setImportStatus({ text: 'Defaults loaded. Press Apply to save them, or Cancel to keep your settings.', isError: false })
    }
  }

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Download size={16} className="text-indigo-500" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Export Configuration</h4>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Save a complete backup of your calendar sources, custom colors, weather configuration, and display preferences. Backups include imported .ics calendar contents and secret calendar URLs; keep them private.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            onClick={handleCopyJson}
            icon={copied ? <Check className="text-emerald-500" /> : <Copy />}
          >
            {copied ? <span className="text-emerald-600 dark:text-emerald-400">Copied to Clipboard!</span> : 'Copy JSON to Clipboard'}
          </Button>

          <Button onClick={handleDownloadJson} icon={<Download />}>
            Download Backup File (.json)
          </Button>
        </div>
      </div>

      {/* Import Section */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Upload size={16} className="text-indigo-500" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Import Configuration</h4>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Restore from an existing JSON backup file or paste your configuration payload directly below.
        </p>

        <div className="pt-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()} icon={<FileCode />} className="mb-3">
            Upload Backup File (.json)
          </Button>
        </div>

        <textarea
          value={importJsonText}
          onChange={(e) => setImportJsonText(e.target.value)}
          placeholder="Or paste configuration JSON here..."
          rows={4}
          className="w-full bg-white dark:bg-slate-950 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-200 border border-slate-200 dark:border-white/10 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed"
        />

        <div className="flex items-center justify-between gap-3">
          <Button tone="primary" onClick={handleImportText} disabled={!importJsonText.trim()} icon={<Upload />}>
            Import Pasted Config
          </Button>

          {importStatus && (
            <span
              className={`text-xs font-medium ${
                importStatus.isError
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {importStatus.text}
            </span>
          )}
        </div>
      </div>

      {/* Privacy & Storage Guarantee */}
      <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-500/20 space-y-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-indigo-600 dark:text-indigo-400" />
          <h4 className="text-xs font-bold text-slate-900 dark:text-white">
            Client-Side Privacy & Storage Architecture
          </h4>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
          All configuration, imported .ics calendars, custom calendar URLs, and preferences are stored exclusively on your device in browser <code className="px-1 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-[10px] font-mono font-bold">localStorage</code>. Zero telemetry, cookies, or remote analytics are collected.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
          >
            <HardDrive size={13} />
            <span>Privacy Policy</span>
          </button>
          {onOpenSelfHost && (
            <button
              type="button"
              onClick={onOpenSelfHost}
              className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
            >
              <Server size={13} />
              <span>Self-Hosting Guide</span>
            </button>
          )}
        </div>
      </div>

      {/* Reset to Defaults */}
      <div className="pt-2 border-t border-slate-200 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
          <AlertTriangle size={13} />
          <span className="text-[11px]">Looking for a clean slate?</span>
        </div>
        <Button variant="ghost" tone="danger" onClick={handleResetDefaults} icon={<RefreshCw />}>
          Reset All to Defaults
        </Button>
      </div>
    </div>
  )
}
