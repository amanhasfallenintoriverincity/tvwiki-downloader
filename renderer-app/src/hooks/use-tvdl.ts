import { useCallback, useEffect, useRef, useState } from "react"

import {
  tvdl,
  type BatchDoneEvent,
  type BatchEvent,
  type CancelledEvent,
  type DoneEvent,
  type EpisodeEvent,
  type ErrorEvent,
  type MetaEvent,
  type ProgressEvent,
  type StageEvent,
} from "@/lib/tvdl"

export interface BatchState {
  titles: string[]
  current: number
  currentTitle: string
  /** 각 에피소드 결과: 'done' | 'error' | 미완료 */
  statuses: Array<"done" | "error" | undefined>
}

export interface DownloadState {
  running: boolean
  stages: string[]
  activeStage: string | null
  title: string
  segments: number
  duration: number
  percent: number
  progressText: string
  log: string[]
  donePath: string | null
  probeDone: boolean
  error: string | null
  batch: BatchState | null
  batchSummary: string | null
}

const INITIAL: DownloadState = {
  running: false,
  stages: [],
  activeStage: null,
  title: "",
  segments: 0,
  duration: 0,
  percent: 0,
  progressText: "",
  log: [],
  donePath: null,
  probeDone: false,
  error: null,
  batch: null,
  batchSummary: null,
}

/** preload이 push하는 IPC 이벤트를 상태로 묶는다. */
export function useTvdl() {
  const [state, setState] = useState<DownloadState>(INITIAL)
  const unsubRef = useRef<Array<() => void>>([])

  useEffect(() => {
    const push = (updater: (prev: DownloadState) => DownloadState) =>
      setState(updater)

    unsubRef.current = [
      tvdl.on<string[]>("stages", (stages) =>
        push((p) => ({ ...p, stages }))
      ),
      tvdl.on<StageEvent>("stage", ({ name }) =>
        push((p) => ({ ...p, activeStage: name }))
      ),
      tvdl.on<MetaEvent>("meta", (m) =>
        push((p) => ({ ...p, title: m.title, segments: m.segments, duration: m.duration }))
      ),
      tvdl.on<ProgressEvent>("progress", (e) =>
        push((p) => {
          if (e.remux != null) {
            const pct = Math.round(e.remux * 100)
            return { ...p, percent: pct, progressText: `변환 중 ${pct}%` }
          }
          if (e.total) {
            const pct = Math.round(((e.done ?? 0) / e.total) * 100)
            const speed = e.speed ? ` · ${(e.speed / 1048576).toFixed(1)} MB/s` : ""
            return {
              ...p,
              percent: pct,
              progressText: `${e.done}/${e.total} 세그먼트${speed}`,
            }
          }
          return p
        })
      ),
      tvdl.on<string>("log", (line) =>
        push((p) => ({ ...p, log: [...p.log.slice(-199), line] }))
      ),
      tvdl.on<DoneEvent>("done", (d) =>
        push((p) => {
          // 배치 진행 중에는 에피소드별 done이 전체 상태를 끝내지 않음
          const batchActive =
            p.batch !== null &&
            p.batch.statuses.some((s) => s === undefined)
          return {
            ...p,
            running: batchActive ? true : false,
            percent: batchActive ? 0 : 100,
            progressText: batchActive
              ? ""
              : d.probe
                ? "검증 완료"
                : "다운로드 완료",
            donePath: batchActive ? p.donePath : d.path,
            probeDone: batchActive ? p.probeDone : Boolean(d.probe),
          }
        })
      ),
      tvdl.on<ErrorEvent>("error", (e) =>
        push((p) => ({
          ...p,
          running: false,
          error: e.message,
          log: [...p.log.slice(-199), `오류: ${e.message}`],
        }))
      ),
      tvdl.on<CancelledEvent>("cancelled", (e) =>
        push((p) => ({
          ...p,
          running: false,
          activeStage: null,
          progressText: e.message,
          error: null,
          log: [...p.log.slice(-199), e.message],
        }))
      ),
      tvdl.on<BatchEvent>("batch", (b) =>
        push((p) => ({
          ...p,
          batch: {
            titles: b.episodes,
            current: -1,
            currentTitle: "",
            statuses: b.episodes.map(() => undefined),
          },
          batchSummary: null,
        }))
      ),
      tvdl.on<EpisodeEvent>("episode", (e) =>
        push((p) => {
          if (!p.batch) return p
          const statuses = [...p.batch.statuses]
          if (e.status) statuses[e.index] = e.status
          return {
            ...p,
            batch: {
              ...p.batch,
              current: e.status ? p.batch.current : e.index,
              currentTitle: e.status ? p.batch.currentTitle : e.title,
              statuses,
            },
          }
        })
      ),
      tvdl.on<BatchDoneEvent>("batchDone", (d) => {
        const ok = d.results.filter((r) => r.ok).length
        push((p) => ({
          ...p,
          running: false,
          batchSummary: `${ok}/${d.results.length}개 에피소드 저장 완료`,
          log: [
            ...p.log.slice(-199),
            `배치 완료: ${ok}/${d.results.length}개 성공`,
          ],
        }))
      }),
    ]
    return () => {
      for (const unsub of unsubRef.current) unsub()
      unsubRef.current = []
    }
  }, [])

  const start = useCallback(
    (opts: {
      url: string
      outdir: string
      concurrency: number
      probe: boolean
      selectedEpisodeUrls?: string[]
    }) => {
      setState((p) => ({
        ...INITIAL,
        stages: p.stages,
        running: true,
        percent: 0,
      }))
      tvdl.start(opts)
    },
    []
  )

  const cancel = useCallback(() => tvdl.cancel(), [])

  return { state, start, cancel }
}
