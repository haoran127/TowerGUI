/**
 * Rich text parser: UBB/BBCode → Unity TMP rich text tags.
 * Supports: [color], [size], [b], [i], [u], [s], [url], [img], @mention, :emoji:, #channel
 */

export interface RichTextSegment {
  text: string;
  tags: string;
  closeTags: string;
}

export type LinkType = 'url' | 'mention' | 'channel' | 'item' | 'coord';

export interface RichTextLink {
  type: LinkType;
  value: string;
  display: string;
  start: number;
  end: number;
}

export interface ParsedRichText {
  tmpText: string;
  links: RichTextLink[];
  mentions: string[];
}

const UBB_RULES: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /\[color=(#[0-9a-fA-F]{6,8})\]([\s\S]*?)\[\/color\]/g, replace: '<color=$1>$2</color>' },
  { pattern: /\[size=(\d+)\]([\s\S]*?)\[\/size\]/g, replace: '<size=$1>$2</size>' },
  { pattern: /\[b\]([\s\S]*?)\[\/b\]/g, replace: '<b>$1</b>' },
  { pattern: /\[i\]([\s\S]*?)\[\/i\]/g, replace: '<i>$1</i>' },
  { pattern: /\[u\]([\s\S]*?)\[\/u\]/g, replace: '<u>$1</u>' },
  { pattern: /\[s\]([\s\S]*?)\[\/s\]/g, replace: '<s>$1</s>' },
  { pattern: /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/g, replace: '<link="$1"><color=#4488ff><u>$2</u></color></link>' },
  { pattern: /\[img\]([^\[]+)\[\/img\]/g, replace: '<sprite name="$1">' },
];

export function ubbToTMP(ubb: string): string {
  if (!ubb) return '';
  let result = ubb;
  for (const rule of UBB_RULES) {
    result = result.replace(rule.pattern, rule.replace);
  }
  return result;
}

export function htmlToTMP(html: string): string {
  if (!html) return '';
  let result = html;
  result = result.replace(/<span\s+style="color:\s*([^"]+)">/g, '<color=$1>');
  result = result.replace(/<\/span>/g, '</color>');
  result = result.replace(/<strong>/g, '<b>');
  result = result.replace(/<\/strong>/g, '</b>');
  result = result.replace(/<em>/g, '<i>');
  result = result.replace(/<\/em>/g, '</i>');
  result = result.replace(/<br\s*\/?>/g, '\n');
  return result;
}

export function stripTags(text: string): string {
  if (!text) return '';
  return text.replace(/<[^>]+>/g, '').replace(/\[[^\]]+\]/g, '');
}

// --- Emoji support ---

const DEFAULT_EMOJI_MAP: Record<string, string> = {
  smile: 'emoji_smile', grin: 'emoji_grin', laugh: 'emoji_laugh',
  wink: 'emoji_wink', cry: 'emoji_cry', angry: 'emoji_angry',
  heart: 'emoji_heart', thumbsup: 'emoji_thumbsup', thumbsdown: 'emoji_thumbsdown',
  fire: 'emoji_fire', star: 'emoji_star', check: 'emoji_check',
  cross: 'emoji_cross', crown: 'emoji_crown', sword: 'emoji_sword',
  shield: 'emoji_shield', gem: 'emoji_gem', gold: 'emoji_gold',
  trophy: 'emoji_trophy', flag: 'emoji_flag',
};

let customEmojiMap: Record<string, string> = {};

export function registerEmojis(map: Record<string, string>): void {
  customEmojiMap = { ...customEmojiMap, ...map };
}

function getEmojiSprite(name: string): string | null {
  return customEmojiMap[name] || DEFAULT_EMOJI_MAP[name] || null;
}

// --- @mention patterns ---

const MENTION_REGEX = /@(\w{1,32})/g;
const EMOJI_REGEX = /:(\w{1,32}):/g;
const CHANNEL_REGEX = /#(\w{1,32})/g;
const ITEM_LINK_REGEX = /\[item=(\d+)\]([^\[]*)\[\/item\]/g;
const COORD_REGEX = /\[coord=(\d+),(\d+)\]/g;

export interface RichTextOptions {
  mentionColor?: string;
  channelColor?: string;
  itemColor?: string;
  coordColor?: string;
}

const DEFAULTS: Required<RichTextOptions> = {
  mentionColor: '#FFD700',
  channelColor: '#87CEEB',
  itemColor: '#FF8C00',
  coordColor: '#90EE90',
};

/**
 * Full rich text parser: UBB + @mentions + :emoji: + #channel + [item] + [coord]
 * Returns TMP-formatted text and extracted link metadata for click handling.
 */
export function parseRichText(input: string, options?: RichTextOptions): ParsedRichText {
  if (!input) return { tmpText: '', links: [], mentions: [] };

  const opts = { ...DEFAULTS, ...options };
  const links: RichTextLink[] = [];
  const mentions: string[] = [];

  let result = ubbToTMP(input);

  result = result.replace(ITEM_LINK_REGEX, (_match, id, display) => {
    links.push({ type: 'item', value: id, display: display || `Item#${id}`, start: 0, end: 0 });
    return `<link="item:${id}"><color=${opts.itemColor}>[${display || `Item#${id}`}]</color></link>`;
  });

  result = result.replace(COORD_REGEX, (_match, x, y) => {
    const display = `(${x},${y})`;
    links.push({ type: 'coord', value: `${x},${y}`, display, start: 0, end: 0 });
    return `<link="coord:${x},${y}"><color=${opts.coordColor}>${display}</color></link>`;
  });

  result = result.replace(MENTION_REGEX, (_match, name) => {
    mentions.push(name);
    links.push({ type: 'mention', value: name, display: `@${name}`, start: 0, end: 0 });
    return `<link="mention:${name}"><color=${opts.mentionColor}><b>@${name}</b></color></link>`;
  });

  result = result.replace(CHANNEL_REGEX, (_match, name) => {
    links.push({ type: 'channel', value: name, display: `#${name}`, start: 0, end: 0 });
    return `<link="channel:${name}"><color=${opts.channelColor}>#${name}</color></link>`;
  });

  result = result.replace(EMOJI_REGEX, (_match, name) => {
    const sprite = getEmojiSprite(name);
    if (sprite) return `<sprite name="${sprite}">`;
    return `:${name}:`;
  });

  return { tmpText: result, links, mentions };
}

/**
 * Quick helper: parse + return only TMP string (for simple display)
 */
export function formatChat(input: string, options?: RichTextOptions): string {
  return parseRichText(input, options).tmpText;
}

/**
 * Extract all @mentions from text without formatting
 */
export function extractMentions(text: string): string[] {
  const mentions: string[] = [];
  let match: RegExpExecArray | null;
  const re = /@(\w{1,32})/g;
  while ((match = re.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}
