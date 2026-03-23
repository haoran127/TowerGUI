/**
 * Number and time formatting utilities for SLG games.
 */

const SUFFIXES = [
  { threshold: 1e12, suffix: 'T', divisor: 1e12 },
  { threshold: 1e9,  suffix: 'B', divisor: 1e9  },
  { threshold: 1e6,  suffix: 'M', divisor: 1e6  },
  { threshold: 1e4,  suffix: 'K', divisor: 1e3  },
];

/**
 * Abbreviate a large number: 1234567 → "1.2M", 999 → "999"
 */
export function formatNumber(value: number, decimals: number = 1): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  for (const { threshold, suffix, divisor } of SUFFIXES) {
    if (abs >= threshold) {
      const n = abs / divisor;
      return sign + n.toFixed(decimals).replace(/\.0+$/, '') + suffix;
    }
  }

  return sign + (Number.isInteger(value) ? value.toString() : value.toFixed(decimals).replace(/\.0+$/, ''));
}

/**
 * Format seconds to human readable duration.
 * - Short: "2h 30m", "45s", "3d 2h"
 * - Long:  "2 hours 30 minutes"
 */
export function formatDuration(totalSeconds: number, style: 'short' | 'long' = 'short'): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return style === 'short' ? '0s' : '0 seconds';

  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  if (style === 'long') {
    const parts: string[] = [];
    if (d > 0) parts.push(`${d} day${d > 1 ? 's' : ''}`);
    if (h > 0) parts.push(`${h} hour${h > 1 ? 's' : ''}`);
    if (m > 0) parts.push(`${m} minute${m > 1 ? 's' : ''}`);
    if (s > 0 || parts.length === 0) parts.push(`${s} second${s !== 1 ? 's' : ''}`);
    return parts.join(' ');
  }

  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 && m < 10 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

/**
 * Format seconds to countdown timer: "02:30:45" or "1d 02:30:45"
 */
export function formatCountdown(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '00:00';

  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');

  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/**
 * Format resource with sign: "+1,200" / "-500"
 */
export function formatResource(value: number, showSign: boolean = false): string {
  const abs = Math.abs(value);
  const formatted = abs >= 10000 ? formatNumber(abs) : abs.toLocaleString('en-US');
  if (showSign) return (value >= 0 ? '+' : '-') + formatted;
  return value < 0 ? '-' + formatted : formatted;
}

/**
 * Format percentage: 0.856 → "85.6%"
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return (value * 100).toFixed(decimals).replace(/\.0+$/, '') + '%';
}

/**
 * Format power/combat value: 1234567 → "1,234,567"
 */
export function formatPower(value: number): string {
  return Math.floor(value).toLocaleString('en-US');
}

/**
 * Format date relative: "刚刚", "5分钟前", "2小时前", "昨天", "3天前"
 */
export function formatTimeAgo(timestamp: number, now?: number): string {
  const current = now || Date.now();
  const diff = Math.max(0, (current - timestamp) / 1000);

  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 172800) return '昨天';
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * Format coordinate for world map: "(123, 456)"
 */
export function formatCoord(x: number, y: number): string {
  return `(${Math.floor(x)}, ${Math.floor(y)})`;
}
