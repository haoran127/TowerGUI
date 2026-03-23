using System;
using System.Text;

namespace TowerUI
{
    /// <summary>
    /// Number, time, and resource formatting utilities for SLG games.
    /// </summary>
    public static class TowerFormatUtils
    {
        // --- Number formatting ---

        /// <summary>
        /// Abbreviate large numbers: 1234567 → "1.2M", 999 → "999"
        /// </summary>
        public static string FormatNumber(double value, int decimals = 1)
        {
            double abs = Math.Abs(value);
            string sign = value < 0 ? "-" : "";

            if (abs >= 1_000_000_000_000) return sign + Round(abs / 1_000_000_000_000, decimals) + "T";
            if (abs >= 1_000_000_000)     return sign + Round(abs / 1_000_000_000, decimals) + "B";
            if (abs >= 1_000_000)         return sign + Round(abs / 1_000_000, decimals) + "M";
            if (abs >= 10_000)            return sign + Round(abs / 1_000, decimals) + "K";

            return sign + ((long)abs).ToString();
        }

        public static string FormatNumber(long value) => FormatNumber((double)value);

        /// <summary>
        /// Format with comma separators: 1234567 → "1,234,567"
        /// </summary>
        public static string FormatPower(long value)
        {
            return value.ToString("N0");
        }

        /// <summary>
        /// Format with sign: +1,200 / -500
        /// </summary>
        public static string FormatResource(long value, bool showSign = false)
        {
            long abs = Math.Abs(value);
            string formatted = abs >= 10000 ? FormatNumber(abs) : abs.ToString("N0");
            if (showSign) return (value >= 0 ? "+" : "-") + formatted;
            return value < 0 ? "-" + formatted : formatted;
        }

        /// <summary>
        /// Format percentage: 0.856 → "85.6%"
        /// </summary>
        public static string FormatPercent(float value, int decimals = 1)
        {
            return (value * 100f).ToString("F" + decimals).TrimEnd('0').TrimEnd('.') + "%";
        }

        private static string Round(double value, int decimals)
        {
            return value.ToString("F" + decimals).TrimEnd('0').TrimEnd('.');
        }

        // --- Time formatting ---

        /// <summary>
        /// Short duration: "2h 30m", "45s", "3d 2h"
        /// </summary>
        public static string FormatDuration(int totalSeconds)
        {
            if (totalSeconds <= 0) return "0s";
            int d = totalSeconds / 86400;
            int h = (totalSeconds % 86400) / 3600;
            int m = (totalSeconds % 3600) / 60;
            int s = totalSeconds % 60;

            if (d > 0) return h > 0 ? $"{d}d {h}h" : $"{d}d";
            if (h > 0) return m > 0 ? $"{h}h {m}m" : $"{h}h";
            if (m > 0) return s > 0 && m < 10 ? $"{m}m {s}s" : $"{m}m";
            return $"{s}s";
        }

        /// <summary>
        /// Countdown timer: "02:30:45" or "1d 02:30:45"
        /// </summary>
        public static string FormatCountdown(int totalSeconds)
        {
            if (totalSeconds <= 0) return "00:00";
            int d = totalSeconds / 86400;
            int h = (totalSeconds % 86400) / 3600;
            int m = (totalSeconds % 3600) / 60;
            int s = totalSeconds % 60;

            if (d > 0) return $"{d}d {h:D2}:{m:D2}:{s:D2}";
            if (h > 0) return $"{h:D2}:{m:D2}:{s:D2}";
            return $"{m:D2}:{s:D2}";
        }

        /// <summary>
        /// Countdown from a target UTC timestamp.
        /// </summary>
        public static string FormatCountdownTo(long targetUnixSeconds)
        {
            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            int remaining = (int)(targetUnixSeconds - now);
            return remaining > 0 ? FormatCountdown(remaining) : "00:00";
        }

        /// <summary>
        /// Relative time: "刚刚", "5分钟前", "2小时前", "昨天", "3天前"
        /// </summary>
        public static string FormatTimeAgo(long unixSeconds)
        {
            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            long diff = Math.Max(0, now - unixSeconds);

            if (diff < 60)    return "刚刚";
            if (diff < 3600)  return $"{diff / 60}分钟前";
            if (diff < 86400) return $"{diff / 3600}小时前";
            if (diff < 172800) return "昨天";
            if (diff < 604800) return $"{diff / 86400}天前";

            var dt = DateTimeOffset.FromUnixTimeSeconds(unixSeconds).LocalDateTime;
            return $"{dt.Month}/{dt.Day}";
        }

        // --- Coordinate ---

        public static string FormatCoord(int x, int y) => $"({x}, {y})";
    }
}
