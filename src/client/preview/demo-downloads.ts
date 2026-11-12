/**
 * Preview-only CSV downloads. In the preview bundle the two admin CSV exports are
 * generated in the browser from the demo world instead of hitting the server, so
 * reviewing them never requires a production database. Outside the preview bundle
 * `tryDownloadPreviewCsv` returns false and the caller falls back to the real path.
 */

import { adminAudit, adminUsers } from './demo-data-admin.ts';

const csvEscape = (value: unknown): string => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const buildCsv = (header: string[], rows: unknown[][]): string =>
  [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');

/** CSV matching `GET /_admin/users.csv`. */
export function demoUsersCsv(): string {
  return buildCsv(
    ['id', 'username', 'role', 'active', 'jobType', 'readyForMission', 'averageRating'],
    adminUsers.map((u) => [u.id, u.username, u.role, u.active, u.jobTypeLabel ?? '', u.readyForMission, u.averageRating])
  );
}

/** CSV matching `GET /_admin/audit.csv`. */
export function demoAuditCsv(): string {
  return buildCsv(
    ['trackingCode', 'createdAt', 'actorUsername', 'action', 'target', 'ip'],
    adminAudit.map((row) => [row.trackingCode, new Date(row.createdAt).toISOString(), row.actorUsername ?? '', row.action, row.target, row.ip])
  );
}

const PREVIEW_HANDLED = new Set(['/_admin/users.csv', '/_admin/audit.csv']);

/**
 * Handles a preview download for a known CSV URL.
 *
 * @param href The CSV URL the user clicked.
 * @returns True when the preview handled the download (caller must stop propagation),
 *   false in production builds where the real server should answer.
 */
export function tryDownloadPreviewCsv(href: string): boolean {
  if (import.meta.env.VITE_PREVIEW_DEMO !== 'true') return false;
  if (!PREVIEW_HANDLED.has(href)) return false;
  const content = href.endsWith('users.csv') ? demoUsersCsv() : demoAuditCsv();
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = href.split('/').pop() ?? 'export.csv';
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}
