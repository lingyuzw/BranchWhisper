export interface ServiceDraft {
  id: string;
  cwd: string;
  health_url: string;
  startup_wait_sec: number;
  command: string;
}
