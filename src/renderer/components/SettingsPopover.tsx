import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { DotsThree, Bell, ArrowsOutSimple, Moon, Keyboard, Circle, FolderOpen, Power } from '@phosphor-icons/react'
import { useThemeStore } from '../theme'
import { useSessionStore } from '../stores/sessionStore'
import { usePopoverLayer } from './PopoverLayer'
import { useColors } from '../theme'

const DEFAULT_ACCENT = '#d97757'

function RowToggle({
  checked,
  onChange,
  colors,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  colors: ReturnType<typeof useColors>
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
      style={{
        background: checked ? colors.accent : colors.surfaceSecondary,
        border: `1px solid ${checked ? colors.accent : colors.containerBorder}`,
      }}
    >
      <span
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all"
        style={{
          left: checked ? 18 : 2,
          background: '#fff',
        }}
      />
    </button>
  )
}

// ─── Electron accelerator format helpers ───

function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.metaKey) parts.push('Command')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  let key = e.key
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(key)) return null
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  else {
    const map: Record<string, string> = {
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      Escape: 'Escape', Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete',
      Tab: 'Tab', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    }
    key = map[key] || key
  }

  if (parts.length === 0) return null
  parts.push(key)
  return parts.join('+')
}

function displayAccelerator(acc: string): string {
  return acc
    .replace('Command', '⌘')
    .replace('Control', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replace(/\+/g, ' ')
}

// ─── Keybind row ───

const PRIMARY_KEY = 'clui-shortcut-primary'
const SECONDARY_KEY = 'clui-shortcut-secondary'

function loadSaved(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}

function KeybindRow({
  colors,
  label,
  storageKey,
  fallback,
  which,
}: {
  colors: ReturnType<typeof useColors>
  label: string
  storageKey: string
  fallback: string
  which: 'primary' | 'secondary'
}) {
  const [shortcut, setShortcut] = useState(() => loadSaved(storageKey, fallback))
  const [capturing, setCapturing] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const captureRef = useRef<HTMLButtonElement>(null)

  // Restore saved shortcut into main process on mount
  useEffect(() => {
    const saved = loadSaved(storageKey, fallback)
    if (saved !== fallback) {
      window.clui.setShortcut({ [which]: saved }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { cancel(); return }
      const acc = keyEventToAccelerator(e)
      if (acc) setPending(acc)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing])

  const startCapture = () => {
    setPending(null)
    setError(null)
    setCapturing(true)
    captureRef.current?.focus()
  }

  const saveShortcut = async () => {
    if (!pending) return
    const res = await window.clui.setShortcut({ [which]: pending })
    const result = res[which]
    if (result?.ok) {
      setShortcut(pending)
      try { localStorage.setItem(storageKey, pending) } catch {}
      setCapturing(false)
      setPending(null)
      setError(null)
    } else {
      setError(result?.error || 'Failed to register shortcut')
    }
  }

  const cancel = () => {
    setCapturing(false)
    setPending(null)
    setError(null)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] font-medium" style={{ color: colors.textSecondary }}>
          {label}
        </div>
        {!capturing ? (
          <button
            onClick={startCapture}
            className="text-[11px] font-mono px-2 py-0.5 rounded transition-colors"
            style={{
              background: colors.surfaceSecondary,
              color: colors.textSecondary,
              border: `1px solid ${colors.containerBorder}`,
            }}
            title="Click to set shortcut"
          >
            {displayAccelerator(shortcut)}
          </button>
        ) : (
          <button
            ref={captureRef}
            className="text-[11px] font-mono px-2 py-0.5 rounded outline-none"
            style={{
              background: colors.accentLight,
              color: pending ? colors.accent : colors.textTertiary,
              border: `1px solid ${colors.accent}`,
              minWidth: 80,
              textAlign: 'center',
            }}
            onBlur={() => { if (!pending) cancel() }}
          >
            {pending ? displayAccelerator(pending) : '…'}
          </button>
        )}
      </div>
      {capturing && (
        <div className="flex flex-col gap-1">
          <div className="text-[10px]" style={{ color: colors.textTertiary }}>
            Press a combo with a modifier key
          </div>
          {error && <div className="text-[10px]" style={{ color: colors.statusError }}>{error}</div>}
          {pending && (
            <div className="flex gap-1.5">
              <button onClick={saveShortcut} className="text-[11px] px-2 py-0.5 rounded" style={{ background: colors.accent, color: '#fff' }}>
                Save
              </button>
              <button onClick={cancel} className="text-[11px] px-2 py-0.5 rounded" style={{ background: colors.surfaceSecondary, color: colors.textSecondary, border: `1px solid ${colors.containerBorder}` }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function KeybindsSection({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Keyboard size={14} style={{ color: colors.textTertiary }} />
        <div className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>Show window</div>
      </div>
      <KeybindRow colors={colors} label="Primary" storageKey={PRIMARY_KEY} fallback="Alt+Space" which="primary" />
      <KeybindRow colors={colors} label="Secondary" storageKey={SECONDARY_KEY} fallback="CommandOrControl+Shift+K" which="secondary" />
    </div>
  )
}

// ─── Accent color row ───

const PRESETS = [
  '#d97757',
  '#e05c6a',
  '#d4a017',
  '#6ab04c',
  '#3b9edd',
  '#9b59b6',
  '#e67e22',
]

function AccentRow({ colors }: { colors: ReturnType<typeof useColors> }) {
  const accentColor = useThemeStore((s) => s.accentColor)
  const setAccentColor = useThemeStore((s) => s.setAccentColor)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Circle size={14} weight="fill" style={{ color: colors.textTertiary }} />
        <div className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>
          Accent color
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => setAccentColor(preset)}
            className="w-5 h-5 rounded-full transition-all"
            title={preset}
            style={{
              background: preset,
              outline: accentColor === preset ? `2px solid ${preset}` : '2px solid transparent',
              outlineOffset: 2,
              transform: accentColor === preset ? 'scale(1.15)' : 'scale(1)',
            }}
          />
        ))}
        {/* Custom color picker */}
        <button
          onClick={() => inputRef.current?.click()}
          className="w-5 h-5 rounded-full flex items-center justify-center transition-all overflow-hidden relative"
          title="Custom color"
          style={{
            background: PRESETS.includes(accentColor) ? colors.surfaceSecondary : accentColor,
            border: `1px dashed ${colors.containerBorder}`,
            outline: !PRESETS.includes(accentColor) ? `2px solid ${accentColor}` : '2px solid transparent',
            outlineOffset: 2,
          }}
        >
          {PRESETS.includes(accentColor) && (
            <span style={{ fontSize: 10, color: colors.textTertiary, lineHeight: 1 }}>+</span>
          )}
          <input
            ref={inputRef}
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            tabIndex={-1}
          />
        </button>
      </div>
      {accentColor !== DEFAULT_ACCENT && (
        <button
          onClick={() => setAccentColor(DEFAULT_ACCENT)}
          className="text-[10px] self-start"
          style={{ color: colors.textTertiary }}
        >
          Reset to default
        </button>
      )}
    </div>
  )
}

/* ─── Settings popover ─── */

export function SettingsPopover() {
  const soundEnabled = useThemeStore((s) => s.soundEnabled)
  const setSoundEnabled = useThemeStore((s) => s.setSoundEnabled)
  const themeMode = useThemeStore((s) => s.themeMode)
  const setThemeMode = useThemeStore((s) => s.setThemeMode)
  const expandedUI = useThemeStore((s) => s.expandedUI)
  const setExpandedUI = useThemeStore((s) => s.setExpandedUI)
  const useLastFolder = useThemeStore((s) => s.useLastFolder)
  const setUseLastFolder = useThemeStore((s) => s.setUseLastFolder)
  const [autoStart, setAutoStartState] = useState<boolean | null>(null)
  const [startMinimized, setStartMinimizedState] = useState(false)
  const isExpanded = useSessionStore((s) => s.isExpanded)

  // Load auto-start state from OS on mount
  useEffect(() => {
    window.clui.getAutoStart()
      .then(({ enabled, startMinimized: sm }) => { setAutoStartState(enabled); setStartMinimizedState(sm) })
      .catch(() => setAutoStartState(false))
  }, [])

  const handleAutoStart = async (next: boolean) => {
    setAutoStartState(next)
    await window.clui.setAutoStart({ enabled: next, startMinimized }).catch(() => {})
  }

  const handleStartMinimized = async (next: boolean) => {
    setStartMinimizedState(next)
    await window.clui.setAutoStart({ enabled: autoStart ?? false, startMinimized: next }).catch(() => {})
  }
  const popoverLayer = usePopoverLayer()
  const colors = useColors()

  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number; maxHeight?: number }>({ right: 0 })

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const gap = 6
    const margin = 8
    const right = window.innerWidth - rect.right

    if (isExpanded) {
      const top = rect.bottom + gap
      setPos({
        top,
        right,
        maxHeight: Math.max(120, window.innerHeight - top - margin),
      })
      return
    }

    setPos({
      bottom: window.innerHeight - rect.top + gap,
      right,
      maxHeight: undefined,
    })
  }, [isExpanded])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onResize = () => updatePos()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, updatePos])

  useEffect(() => {
    if (!open) return
    let raf = 0
    const tick = () => {
      updatePos()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [open, expandedUI, isExpanded, updatePos])

  const handleToggle = () => {
    if (!open) updatePos()
    setOpen((o) => !o)
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
        style={{ color: colors.textTertiary }}
        title="Settings"
      >
        <DotsThree size={16} weight="bold" />
      </button>

      {popoverLayer && open && createPortal(
        <motion.div
          ref={popoverRef}
          data-clui-ui
          initial={{ opacity: 0, y: isExpanded ? -4 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: isExpanded ? -4 : 4 }}
          transition={{ duration: 0.12 }}
          className="rounded-xl"
          style={{
            position: 'fixed',
            ...(pos.top != null ? { top: pos.top } : {}),
            ...(pos.bottom != null ? { bottom: pos.bottom } : {}),
            right: pos.right,
            width: 240,
            pointerEvents: 'auto',
            background: colors.popoverBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: colors.popoverShadow,
            border: `1px solid ${colors.popoverBorder}`,
            ...(pos.maxHeight != null ? { maxHeight: pos.maxHeight, overflowY: 'auto' as const } : {}),
          }}
        >
          <div className="p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <ArrowsOutSimple size={14} style={{ color: colors.textTertiary }} />
                <div className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>
                  Full width
                </div>
              </div>
              <RowToggle checked={expandedUI} onChange={setExpandedUI} colors={colors} label="Toggle full width panel" />
            </div>

            <div style={{ height: 1, background: colors.popoverBorder }} />

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Bell size={14} style={{ color: colors.textTertiary }} />
                <div className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>
                  Notification sound
                </div>
              </div>
              <RowToggle checked={soundEnabled} onChange={setSoundEnabled} colors={colors} label="Toggle notification sound" />
            </div>

            <div style={{ height: 1, background: colors.popoverBorder }} />

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Moon size={14} style={{ color: colors.textTertiary }} />
                <div className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>
                  Dark theme
                </div>
              </div>
              <RowToggle
                checked={themeMode === 'dark'}
                onChange={(next) => setThemeMode(next ? 'dark' : 'light')}
                colors={colors}
                label="Toggle dark theme"
              />
            </div>

            <div style={{ height: 1, background: colors.popoverBorder }} />

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FolderOpen size={14} style={{ color: colors.textTertiary }} />
                <div className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>
                  Restore last folder
                </div>
              </div>
              <RowToggle checked={useLastFolder} onChange={setUseLastFolder} colors={colors} label="Restore last folder on startup" />
            </div>

            <div style={{ height: 1, background: colors.popoverBorder }} />

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Power size={14} style={{ color: colors.textTertiary }} />
                  <div className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>
                    Launch at login
                  </div>
                </div>
                {autoStart !== null
                  ? <RowToggle checked={autoStart} onChange={handleAutoStart} colors={colors} label="Launch at login" />
                  : <span className="text-[11px]" style={{ color: colors.textTertiary }}>…</span>
                }
              </div>
              {autoStart && (
                <div className="flex items-center justify-between gap-3 pl-5">
                  <div className="text-[11px]" style={{ color: colors.textSecondary }}>
                    Start minimized
                  </div>
                  <RowToggle checked={startMinimized} onChange={handleStartMinimized} colors={colors} label="Start minimized" />
                </div>
              )}
            </div>

            <div style={{ height: 1, background: colors.popoverBorder }} />

            <AccentRow colors={colors} />

            <div style={{ height: 1, background: colors.popoverBorder }} />

            <KeybindsSection colors={colors} />
          </div>
        </motion.div>,
        popoverLayer,
      )}
    </>
  )
}
