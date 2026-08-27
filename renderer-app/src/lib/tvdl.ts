/** preload이 노출하는 window.tvdl API 타입 정의 */
export interface ProgressEvent {
  done?: number
  total?: number
  bytes?: number
  speed?: number
  remux?: number
  probe?: boolean
}

export interface MetaEvent {
  title: string
  segments: number
  duration: number
}

export interface DoneEvent {
  path: string
  probe?: boolean
}

export interface ErrorEvent {
  message: string
}

export interface CancelledEvent {
  message: string
}

export interface EpisodeOption {
  url: string
  title: string
}

export interface StageEvent {
  name: string
  at: number
}

export interface BatchEvent {
  episodes: string[]
}

export interface EpisodeEvent {
  index: number
  total: number
  title: string
  status?: "done" | "error"
  error?: string
}

export interface BatchDoneEvent {
  results: Array<{ title: string; ok: boolean; path?: string; error?: string }>
}

export interface TvdlApi {
  inspectEpisodes(url: string): Promise<EpisodeOption[]>
  start(opts: {
    url: string
    outdir: string
    concurrency: number
    probe: boolean
    selectedEpisodeUrls?: string[]
  }): void
  cancel(): void
  chooseFolder(): Promise<string | null>
  showInFolder(path: string): void
  getDefaultDir(): Promise<string>
  minimize(): void
  close(): void
  on<T>(channel: string, cb: (data: T) => void): () => void
}

/** 개발 모드(일반 브라우저)에서는 window.tvdl이 없으므로 스텁으로 대체. */
const stub: TvdlApi = {
  inspectEpisodes: async () => [],
  start: () => console.warn("tvdl: preload API 없음 (개발 모드)"),
  cancel: () => {},
  chooseFolder: async () => null,
  showInFolder: () => {},
  getDefaultDir: async () => "",
  minimize: () => {},
  close: () => {},
  on: () => () => {},
}

export const tvdl: TvdlApi =
  (window as unknown as { tvdl?: TvdlApi }).tvdl ?? stub
