import { useEffect, useRef, useState, type CSSProperties } from "react"
import {
  ChevronRightIcon,
  ClipboardPasteIcon,
  FolderOpenIcon,
  MinusIcon,
  XIcon,
} from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import type { BatchState } from "@/hooks/use-tvdl"
import { useTvdl } from "@/hooks/use-tvdl"
import { cn } from "@/lib/utils"
import { tvdl, type EpisodeOption } from "@/lib/tvdl"

const TVWIKI_URL = /^https?:\/\/(?:www\.)?tvwiki/i

function WindowControls() {
  return (
    <div
      className="absolute top-0.5 right-2 z-[9999] flex"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      <button
        type="button"
        className="grid size-5 place-items-center rounded text-[#666] transition-colors hover:bg-black/5 hover:text-black"
        style={{ WebkitAppRegion: "no-drag", zIndex: 10000, pointerEvents: "auto" } as CSSProperties}
        onClick={() => tvdl.minimize()}
        aria-label="최소화"
      >
        <MinusIcon className="size-3" />
      </button>
      <button
        type="button"
        className="grid size-5 place-items-center rounded text-[#666] transition-colors hover:bg-red-500 hover:text-white"
        style={{ WebkitAppRegion: "no-drag", zIndex: 10000, pointerEvents: "auto" } as CSSProperties}
        onClick={() => tvdl.close()}
        aria-label="닫기"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  )
}

function InfoBox({
  title,
  url,
  invalidUrl,
  disabled,
  onUrlChange,
  onPaste,
  onTextPaste,
  onSubmit,
}: {
  title: string
  url: string
  invalidUrl: boolean
  disabled: boolean
  onUrlChange: (value: string) => void
  onPaste: () => void
  onTextPaste: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="rounded-[16px] bg-[#d4d4d4] p-4">
      <h1 className="mb-2 truncate text-sm font-semibold text-[#202020]" title={title}>
        {title}
      </h1>
      <div className="mb-2 h-px bg-black/15" />
      <div
        className={cn(
          "no-drag group/url relative flex h-7 overflow-hidden rounded-[4px] border bg-white/55 transition-colors",
          invalidUrl ? "border-red-500/70" : "border-[#a8a8a8] focus-within:border-[#666]"
        )}
      >
        <input
          id="video-url"
          type="url"
          value={url}
          disabled={disabled}
          onChange={(event) => onUrlChange(event.target.value)}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text")
            if (!pasted) return
            event.preventDefault()
            onTextPaste(pasted)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit()
          }}
          placeholder="https://tvwiki.com/……"
          spellCheck={false}
          aria-invalid={invalidUrl || undefined}
          className="no-drag min-w-0 flex-1 bg-transparent px-2 text-[10px] text-[#555] outline-none placeholder:text-[#999] disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onPaste}
          disabled={disabled}
          className="no-drag absolute inset-y-0 right-0 grid w-7 place-items-center border-l border-black/10 bg-[#e7e7e7] text-[#777] opacity-0 transition-opacity hover:bg-white group-hover/url:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
          aria-label="클립보드에서 링크 붙여넣기"
          title="붙여넣기"
        >
          <ClipboardPasteIcon className="size-3" />
        </button>
      </div>
      {invalidUrl && <p className="mt-1 text-[10px] text-red-700">tvwiki 링크를 확인해 주세요.</p>}
    </div>
  )
}

function StatusSection({
  probe,
  log,
  onProbeChange,
}: {
  probe: boolean
  log: string[]
  onProbeChange: (value: boolean) => void
}) {
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [log])

  return (
    <div className="mt-2 min-h-0">
      <label htmlFor="probe" className="no-drag flex cursor-pointer items-center gap-2 py-1 text-[#262626]">
        <Checkbox
          id="probe"
          checked={probe}
          onCheckedChange={(value) => onProbeChange(value === true)}
          className="no-drag size-4 rounded-[3px] border-[#666] bg-white text-white dark:bg-white dark:data-checked:border-[#222] dark:data-checked:bg-[#222]"
        />
        <span className="min-w-0 flex-1 whitespace-nowrap text-[12px] font-semibold">
          검증만 (2개 앞 세그먼트)
        </span>
        <ChevronRightIcon className="size-3.5 shrink-0 text-[#333]" />
      </label>
      <div
        ref={logRef}
        className="ml-6 mt-1 max-h-[68px] overflow-y-auto pr-1 text-[10px] leading-4 text-[#858585]"
        aria-live="polite"
      >
        {log.length === 0 ? (
          <p>링크 추출 대기 중</p>
        ) : (
          log.map((line, index) => (
            <p key={`${index}-${line}`} className="break-all font-mono">
              {line}
            </p>
          ))
        )}
      </div>
    </div>
  )
}

function SidebarSettings({
  outdir,
  concurrency,
  disabled,
  onOutdirChange,
  onConcurrencyChange,
}: {
  outdir: string
  concurrency: number
  disabled: boolean
  onOutdirChange: (value: string) => void
  onConcurrencyChange: (value: number) => void
}) {
  return (
    <div className="mt-auto space-y-1.5 pt-2 text-[10px] text-[#686868]">
      <button
        type="button"
        disabled={disabled}
        onClick={async () => {
          const directory = await tvdl.chooseFolder()
          if (directory) onOutdirChange(directory)
        }}
        className="no-drag flex items-center gap-1 transition-colors hover:text-[#222] disabled:opacity-45"
      >
        <FolderOpenIcon className="size-3" />
        저장 위치
      </button>
      <p className="truncate" title={outdir}>
        {outdir || "불러오는 중…"}
      </p>
      <label className="flex items-center gap-2">
        <span className="shrink-0 tabular-nums">병렬 {concurrency}</span>
        <input
          type="range"
          min={1}
          max={16}
          value={concurrency}
          disabled={disabled}
          onChange={(event) => onConcurrencyChange(Number(event.target.value))}
          className="no-drag h-1 min-w-0 flex-1 cursor-pointer accent-[#333] disabled:cursor-default disabled:opacity-45"
          aria-label="병렬 다운로드 수"
        />
      </label>
    </div>
  )
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ""
  return `${Math.max(1, Math.round(seconds / 60))}분`
}

function EpisodeList({
  episodes,
  batch,
  duration,
  selectedUrls,
  disabled,
  onSelectionChange,
}: {
  episodes: EpisodeOption[]
  batch: BatchState | null
  duration: number
  selectedUrls: Set<string>
  disabled: boolean
  onSelectionChange: (url: string, selected: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {episodes.map((episode, index) => {
        const batchIndex = batch?.titles.indexOf(episode.title) ?? -1
        const status = batchIndex >= 0 ? batch?.statuses[batchIndex] : undefined
        const isCurrent = batch?.currentTitle === episode.title && !status
        const isSelected = selectedUrls.has(episode.url)
        const rightLabel =
          status === "done"
            ? "완료"
            : status === "error"
              ? "실패"
              : isCurrent
                ? formatDuration(duration) || "진행 중"
                : ""

        return (
          <div
            key={episode.url}
            data-episode-index={index}
            onClick={() => !disabled && onSelectionChange(episode.url, !isSelected)}
            className={cn(
              "no-drag flex h-9 shrink-0 items-center justify-between gap-2 rounded-[4px] border px-2 text-[#252525] transition-colors",
              disabled ? "cursor-default" : "cursor-pointer hover:bg-[#fafafa]",
              isCurrent ? "border-[#555] bg-[#fafafa]" : "border-[#b7b7b7] bg-white",
              isSelected && !isCurrent && "bg-[#f7f7f7]",
              status === "error" && "border-red-300"
            )}
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Checkbox
                checked={isSelected}
                disabled={disabled}
                onCheckedChange={(checked) => onSelectionChange(episode.url, checked === true)}
                onClick={(event) => event.stopPropagation()}
                aria-label={`${episode.title} ${rightLabel || (isSelected ? "선택" : "선택 안 함")}`}
                className="no-drag size-3.5 rounded-[3px] border-[#777] bg-white text-white opacity-100 dark:bg-white dark:data-checked:border-[#222] dark:data-checked:bg-[#222] disabled:opacity-100"
              />
              <span className="truncate text-[11px] font-semibold" title={episode.title}>
                {episode.title}
              </span>
            </div>
            <span
              className={cn(
                "shrink-0 text-[10px] text-[#777]",
                status === "error" && "text-red-700"
              )}
            >
              {rightLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CompactProgress({
  stages,
  activeStage,
  percent,
  text,
  error,
}: {
  stages: string[]
  activeStage: string | null
  percent: number
  text: string
  error: string | null
}) {
  const activeIndex = stages.indexOf(activeStage ?? "")

  return (
    <div className="mt-3 space-y-1.5" aria-live="polite">
      <div className="flex items-center gap-1.5">
        {stages.map((stage, index) => (
          <span
            key={stage}
            title={stage}
            className={cn(
              "size-1.5 rounded-full bg-[#d2d2d2]",
              index < activeIndex && "bg-[#888]",
              index === activeIndex && "bg-[#222]"
            )}
          />
        ))}
        <span className="ml-1 truncate text-[10px] text-[#777]">{activeStage || text}</span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-[#e5e5e5]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full rounded-full bg-[#333] transition-[width]"
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      {error && <p className="truncate text-[10px] text-red-700" title={error}>{error}</p>}
    </div>
  )
}

function DownloadAction({
  running,
  disabled,
  label,
  onAction,
}: {
  running: boolean
  disabled: boolean
  label: string
  onAction: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onAction}
      className={cn(
        "no-drag mr-7 inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-[#2563eb] px-4 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8] focus-visible:ring-2 focus-visible:ring-[#2563eb]/40 disabled:cursor-default disabled:opacity-45",
        running && "bg-red-600 hover:bg-red-700"
      )}
      aria-label={label}
    >
      {label}
    </button>
  )
}

function CornerMark() {
  return (
    <div
      className="pointer-events-none absolute right-3 bottom-3 size-6 rounded-br-lg border-r-[3px] border-b-[3px] border-[#171717]"
      aria-hidden="true"
    />
  )
}

export function App() {
  const { state, start, cancel } = useTvdl()
  const [url, setUrl] = useState("")
  const [outdir, setOutdir] = useState("")
  const [probe, setProbe] = useState(false)
  const [concurrency, setConcurrency] = useState(8)
  const [episodes, setEpisodes] = useState<EpisodeOption[]>([])
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())
  const [inspecting, setInspecting] = useState(false)
  const [inspectError, setInspectError] = useState<string | null>(null)

  useEffect(() => {
    tvdl.getDefaultDir().then(setOutdir)
  }, [])

  const trimmedUrl = url.trim()
  const invalidUrl = trimmedUrl.length > 0 && !TVWIKI_URL.test(trimmedUrl)
  const selectedEpisodeUrls = episodes
    .filter((episode) => selectedUrls.has(episode.url))
    .map((episode) => episode.url)
  const canInspect = trimmedUrl.length > 0 && !invalidUrl
  const canStart = canInspect && outdir.length > 0 && selectedEpisodeUrls.length > 0

  const clearEpisodeList = () => {
    setEpisodes([])
    setSelectedUrls(new Set())
    setInspectError(null)
  }

  const handleInspect = async (candidate = url) => {
    const nextUrl = candidate.trim()
    clearEpisodeList()
    if (!nextUrl || !TVWIKI_URL.test(nextUrl)) {
      if (nextUrl) setInspectError("tvwiki 링크를 확인해 주세요.")
      return
    }

    setInspecting(true)
    try {
      const loaded = await tvdl.inspectEpisodes(nextUrl)
      setEpisodes(loaded)
      setSelectedUrls(new Set(loaded.map((episode) => episode.url)))
    } catch (error) {
      setInspectError(error instanceof Error ? error.message : String(error))
    } finally {
      setInspecting(false)
    }
  }

  const handleStart = () => {
    if (state.running || !canStart) return
    start({
      url: trimmedUrl,
      outdir,
      concurrency,
      probe,
      selectedEpisodeUrls,
    })
  }

  const handleAction = () => {
    if (state.running) {
      cancel()
      return
    }
    if (episodes.length > 0) {
      handleStart()
      return
    }
    void handleInspect()
  }

  const handleSelectionChange = (episodeUrl: string, selected: boolean) => {
    setSelectedUrls((previous) => {
      const next = new Set(previous)
      if (selected) next.add(episodeUrl)
      else next.delete(episodeUrl)
      return next
    })
  }

  const showProgress = state.running || state.error !== null || state.percent > 0
  const actionLabel = state.running
    ? "다운로드 취소"
    : inspecting
      ? "목록 불러오는 중…"
      : episodes.length > 0
        ? "선택 다운로드"
        : "목록 불러오기"
  const actionDisabled = state.running
    ? false
    : inspecting
      ? true
      : episodes.length > 0
        ? !canStart
        : !canInspect
  const title = "TVWiki 다운로더"

  return (
    <div
      className="relative flex h-svh w-svw overflow-hidden bg-transparent"
    >
      <main
        className="relative flex h-full w-full overflow-hidden rounded-[24px] bg-white"
        aria-label="TVWiki 에피소드 관리"
      >
        <div
          className="absolute left-0 top-0 h-8 w-[calc(100%-80px)] z-0"
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
          aria-hidden="true"
        />
        <WindowControls />
        <aside className="flex w-[40.414%] shrink-0 flex-col bg-[#e5e5e5] p-6 text-[#222]">
          <InfoBox
            title={title}
            url={url}
            invalidUrl={invalidUrl}
            disabled={state.running || inspecting}
            onUrlChange={(nextUrl) => {
              setUrl(nextUrl)
              clearEpisodeList()
            }}
            onPaste={async () => {
              try {
                const pasted = await navigator.clipboard.readText()
                setUrl(pasted)
                await handleInspect(pasted)
              } catch {
                // Electron clipboard 권한이 없으면 입력란을 그대로 둔다.
              }
            }}
            onTextPaste={(pasted) => {
              setUrl(pasted)
              void handleInspect(pasted)
            }}
            onSubmit={() => void handleInspect()}
          />
          <StatusSection probe={probe} log={state.log} onProbeChange={setProbe} />
          <SidebarSettings
            outdir={outdir}
            concurrency={concurrency}
            disabled={state.running || inspecting}
            onOutdirChange={setOutdir}
            onConcurrencyChange={setConcurrency}
          />
        </aside>

        <section className="relative flex min-w-0 flex-1 flex-col bg-white p-6 text-[#222]">
          {inspecting && <p className="mt-3 text-[10px] text-[#777]">에피소드 목록을 불러오는 중…</p>}
          {inspectError && <p className="mt-3 text-[10px] text-red-700">{inspectError}</p>}
          {showProgress && (
            <CompactProgress
              stages={state.stages}
              activeStage={state.activeStage}
              percent={state.percent}
              text={state.progressText}
              error={state.error}
            />
          )}
          <div className={cn("min-h-0 flex-1 overflow-y-auto pr-0.5", showProgress || inspecting || inspectError ? "mt-3" : episodes.length > 0 ? "mt-4" : "mt-0")}>
            {episodes.length > 0 && (
              <EpisodeList
                episodes={episodes}
                batch={state.batch}
                duration={state.duration}
                selectedUrls={selectedUrls}
                disabled={state.running || inspecting}
                onSelectionChange={handleSelectionChange}
              />
            )}
          </div>
          <div className="mt-3 flex min-h-7 items-center gap-2 text-[10px] text-[#777]">
            <div className="min-w-0 flex-1 truncate">
              {state.batchSummary || state.progressText || (episodes.length > 0 ? `${selectedEpisodeUrls.length}/${episodes.length}개 선택` : "")}
            </div>
            {state.donePath && (
              <button
                type="button"
                onClick={() => tvdl.showInFolder(state.donePath!)}
                className="no-drag ml-2 inline-flex items-center gap-1 font-medium text-[#333] hover:underline"
              >
                <FolderOpenIcon className="size-3" />
                열기
              </button>
            )}
            <DownloadAction
              running={state.running}
              disabled={actionDisabled}
              label={actionLabel}
              onAction={handleAction}
            />
          </div>
          <CornerMark />
        </section>
      </main>
    </div>
  )
}

export default App