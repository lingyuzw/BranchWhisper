export interface DiagnosticsMatchItem {
  role?: string;
  name?: string;
  provider?: string;
}

export interface DiagnosticsMatchService {
  id?: string;
  role?: string;
  provider?: string;
  label?: string;
  description?: string;
  health_url?: string;
}

export function normalized(value: unknown): string;
export function roleAliases(role: string): string[];
export function serviceRoleText(service: DiagnosticsMatchService | null | undefined): string;
export function diagnosticRoleText(item: DiagnosticsMatchItem | null | undefined): string;
export function findDiagnosticItemForRole<T extends DiagnosticsMatchItem>(role: string, items: T[]): T | null;
export function findServiceForDiagnosticRole<T extends DiagnosticsMatchService>(
  role: string,
  item: DiagnosticsMatchItem | null | undefined,
  services: T[],
): T | null;
