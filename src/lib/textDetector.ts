import { ClipType } from '../types';

export interface TextAnalysis {
  type: ClipType;
  charCount: number;
  wordCount: number;
  lineCount: number;
  metadata: {
    language?: string;
    hexColor?: string;
    domain?: string;
    isValidJson?: boolean;
    formattedJson?: string;
  };
}

// Regex patterns
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_COLOR_REGEX = /^rgba?\((\s*\d+\s*,){2}\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i;
const HSL_COLOR_REGEX = /^hsla?\(\s*\d+\s*(deg)?,\s*\d+%\s*,\s*\d+%(,\s*[\d.]+\s*)?\)$/i;

const URL_REGEX = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:[0-9]+)?(\/[^\s]*)?$/i;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const CODE_INDICATORS = [
  /import\s+.*\s+from\s+['"].*['"]/,
  /export\s+(default\s+)?(function|const|class|interface|type)/,
  /function\s+\w+\s*\(.*\)/,
  /const\s+\w+\s*=\s*(\(.*\)|function)/,
  /class\s+\w+(\s+extends\s+\w+)?\s*\{/,
  /<\s*[a-zA-Z][a-zA-Z0-9]*(\s+[^>]*)?>[\s\S]*<\/\s*[a-zA-Z][a-zA-Z0-9]*>/, // HTML/JSX
  /SELECT\s+.*\s+FROM\s+/i,
  /CREATE\s+TABLE\s+/i,
  /curl\s+-X|docker\s+run|npm\s+install|cargo\s+run|git\s+(checkout|commit|push|pull)/i,
  /def\s+\w+\s*\(.*\):/,
  /fn\s+\w+\s*\(.*\)\s*(->\s*.*)?\s*\{/, // Rust
];

export function analyzeText(rawText: string): TextAnalysis {
  const text = rawText.trim();
  const charCount = rawText.length;
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const lineCount = rawText.split('\n').length;

  const metadata: TextAnalysis['metadata'] = {};

  // 1. Color Check
  if (HEX_COLOR_REGEX.test(text)) {
    metadata.hexColor = text;
    return { type: 'color', charCount, wordCount, lineCount, metadata };
  }
  if (RGB_COLOR_REGEX.test(text) || HSL_COLOR_REGEX.test(text)) {
    metadata.hexColor = text;
    return { type: 'color', charCount, wordCount, lineCount, metadata };
  }

  // 2. Email Check
  if (EMAIL_REGEX.test(text)) {
    return { type: 'email', charCount, wordCount, lineCount, metadata };
  }

  // 3. URL Check
  if (URL_REGEX.test(text) && !text.includes('\n')) {
    try {
      const urlStr = text.startsWith('http') ? text : `https://${text}`;
      const parsed = new URL(urlStr);
      metadata.domain = parsed.hostname;
      return { type: 'url', charCount, wordCount, lineCount, metadata };
    } catch {
      // Not a valid URL despite regex
    }
  }

  // 4. JSON Check
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text);
      metadata.isValidJson = true;
      metadata.formattedJson = JSON.stringify(parsed, null, 2);
      metadata.language = 'JSON';
      return { type: 'json', charCount, wordCount, lineCount, metadata };
    } catch {
      // not JSON
    }
  }

  // 5. Code Check
  for (const indicator of CODE_INDICATORS) {
    if (indicator.test(text)) {
      if (text.includes('import ') || text.includes('const ') || text.includes('interface ')) {
        metadata.language = 'TypeScript/JavaScript';
      } else if (text.includes('fn ') || text.includes('let mut ')) {
        metadata.language = 'Rust';
      } else if (text.includes('def ') || text.includes('elif ')) {
        metadata.language = 'Python';
      } else if (/curl|docker|npm|git/i.test(text)) {
        metadata.language = 'Shell/Bash';
      } else if (/SELECT|FROM|WHERE/i.test(text)) {
        metadata.language = 'SQL';
      } else if (/<[a-z][\s\S]*>/i.test(text)) {
        metadata.language = 'HTML/JSX';
      } else {
        metadata.language = 'Code';
      }
      return { type: 'code', charCount, wordCount, lineCount, metadata };
    }
  }

  // Default to text
  return { type: 'text', charCount, wordCount, lineCount, metadata };
}
