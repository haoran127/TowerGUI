using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;

namespace TowerUI
{
    /// <summary>
    /// TMP rich text builder and parser for SLG chat/messages.
    /// Converts custom markup to TMP tags and extracts clickable link metadata.
    /// </summary>
    public static class TowerRichText
    {
        public enum LinkType { Url, Mention, Channel, Item, Coord }

        public struct RichLink
        {
            public LinkType type;
            public string value;
            public string display;
        }

        public struct ParseResult
        {
            public string tmpText;
            public List<RichLink> links;
        }

        public static string MentionColor = "#FFD700";
        public static string ChannelColor = "#87CEEB";
        public static string ItemColor = "#FF8C00";
        public static string CoordColor = "#90EE90";
        public static string UrlColor = "#4488FF";

        private static readonly Regex MentionRe = new Regex(@"@(\w{1,32})", RegexOptions.Compiled);
        private static readonly Regex ChannelRe = new Regex(@"#(\w{1,32})", RegexOptions.Compiled);
        private static readonly Regex ItemRe = new Regex(@"\[item=(\d+)\]([^\[]*)\[/item\]", RegexOptions.Compiled);
        private static readonly Regex CoordRe = new Regex(@"\[coord=(\d+),(\d+)\]", RegexOptions.Compiled);
        private static readonly Regex UrlRe = new Regex(@"\[url=([^\]]+)\]([^\[]*)\[/url\]", RegexOptions.Compiled);
        private static readonly Regex EmojiRe = new Regex(@":(\w{1,32}):", RegexOptions.Compiled);

        private static readonly Dictionary<string, string> _emojiMap = new();

        /// <summary>
        /// Register custom emoji names to TMP sprite names.
        /// </summary>
        public static void RegisterEmojis(Dictionary<string, string> map)
        {
            foreach (var kv in map) _emojiMap[kv.Key] = kv.Value;
        }

        /// <summary>
        /// Parse rich text input and convert to TMP format.
        /// </summary>
        public static ParseResult Parse(string input)
        {
            if (string.IsNullOrEmpty(input))
                return new ParseResult { tmpText = "", links = new List<RichLink>() };

            var links = new List<RichLink>();
            string result = input;

            result = UrlRe.Replace(result, m =>
            {
                links.Add(new RichLink { type = LinkType.Url, value = m.Groups[1].Value, display = m.Groups[2].Value });
                return $"<link=\"url:{m.Groups[1].Value}\"><color={UrlColor}><u>{m.Groups[2].Value}</u></color></link>";
            });

            result = ItemRe.Replace(result, m =>
            {
                string id = m.Groups[1].Value;
                string display = string.IsNullOrEmpty(m.Groups[2].Value) ? $"Item#{id}" : m.Groups[2].Value;
                links.Add(new RichLink { type = LinkType.Item, value = id, display = display });
                return $"<link=\"item:{id}\"><color={ItemColor}>[{display}]</color></link>";
            });

            result = CoordRe.Replace(result, m =>
            {
                string coord = $"{m.Groups[1].Value},{m.Groups[2].Value}";
                string display = $"({m.Groups[1].Value},{m.Groups[2].Value})";
                links.Add(new RichLink { type = LinkType.Coord, value = coord, display = display });
                return $"<link=\"coord:{coord}\"><color={CoordColor}>{display}</color></link>";
            });

            result = MentionRe.Replace(result, m =>
            {
                string name = m.Groups[1].Value;
                links.Add(new RichLink { type = LinkType.Mention, value = name, display = $"@{name}" });
                return $"<link=\"mention:{name}\"><color={MentionColor}><b>@{name}</b></color></link>";
            });

            result = ChannelRe.Replace(result, m =>
            {
                string name = m.Groups[1].Value;
                links.Add(new RichLink { type = LinkType.Channel, value = name, display = $"#{name}" });
                return $"<link=\"channel:{name}\"><color={ChannelColor}>#{name}</color></link>";
            });

            result = EmojiRe.Replace(result, m =>
            {
                string name = m.Groups[1].Value;
                if (_emojiMap.TryGetValue(name, out var sprite))
                    return $"<sprite name=\"{sprite}\">";
                return m.Value;
            });

            return new ParseResult { tmpText = result, links = links };
        }

        /// <summary>
        /// Quick format: returns TMP string only.
        /// </summary>
        public static string Format(string input) => Parse(input).tmpText;

        // --- Builder pattern for programmatic rich text ---

        public static RichTextBuilder Builder() => new RichTextBuilder();

        public class RichTextBuilder
        {
            private readonly StringBuilder _sb = new();

            public RichTextBuilder Text(string text) { _sb.Append(text); return this; }
            public RichTextBuilder Color(string hex, string text) { _sb.Append($"<color={hex}>{text}</color>"); return this; }
            public RichTextBuilder Bold(string text) { _sb.Append($"<b>{text}</b>"); return this; }
            public RichTextBuilder Italic(string text) { _sb.Append($"<i>{text}</i>"); return this; }
            public RichTextBuilder Size(int size, string text) { _sb.Append($"<size={size}>{text}</size>"); return this; }
            public RichTextBuilder Sprite(string name) { _sb.Append($"<sprite name=\"{name}\">"); return this; }
            public RichTextBuilder Newline() { _sb.Append('\n'); return this; }

            public RichTextBuilder Damage(int amount)
            {
                _sb.Append($"<color=#FF4444><b>-{amount}</b></color>");
                return this;
            }

            public RichTextBuilder Heal(int amount)
            {
                _sb.Append($"<color=#44FF44><b>+{amount}</b></color>");
                return this;
            }

            public RichTextBuilder Resource(string name, long amount, string iconSprite = null)
            {
                if (iconSprite != null) _sb.Append($"<sprite name=\"{iconSprite}\">");
                _sb.Append($"<color=#FFD700>{name}</color> ");
                _sb.Append(TowerFormatUtils.FormatResource(amount, true));
                return this;
            }

            public override string ToString() => _sb.ToString();
        }
    }
}
