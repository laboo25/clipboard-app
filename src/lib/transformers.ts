export type TransformerAction =
  | 'trim'
  | 'uppercase'
  | 'lowercase'
  | 'titlecase'
  | 'camelcase'
  | 'kebabcase'
  | 'slugify'
  | 'format-json'
  | 'minify-json'
  | 'remove-duplicates'
  | 'remove-empty-lines'
  | 'strip-html'
  | 'base64-encode'
  | 'base64-decode';

export interface TransformerOption {
  id: TransformerAction;
  label: string;
  description: string;
  badge?: string;
}

export const TRANSFORMER_OPTIONS: TransformerOption[] = [
  { id: 'trim', label: 'Trim Whitespace', description: 'Strip leading & trailing whitespace' },
  { id: 'uppercase', label: 'UPPERCASE', description: 'Convert entire text to uppercase' },
  { id: 'lowercase', label: 'lowercase', description: 'Convert entire text to lowercase' },
  { id: 'titlecase', label: 'Title Case', description: 'Capitalize First Letter Of Each Word' },
  { id: 'camelcase', label: 'camelCase', description: 'Convert to camelCaseIdentifier' },
  { id: 'slugify', label: 'slug-url', description: 'URL-friendly lowercase hyphenated slug' },
  { id: 'format-json', label: 'Format JSON', description: 'Pretty-print with 2-space indentation', badge: 'JSON' },
  { id: 'minify-json', label: 'Minify JSON', description: 'Compress JSON into a single line', badge: 'JSON' },
  { id: 'remove-duplicates', label: 'Dedupe Lines', description: 'Remove repeated lines while preserving order' },
  { id: 'remove-empty-lines', label: 'Compact Lines', description: 'Remove blank/empty lines' },
  { id: 'strip-html', label: 'Strip HTML', description: 'Remove all HTML tags' },
  { id: 'base64-encode', label: 'Base64 Encode', description: 'Encode UTF-8 text into Base64' },
  { id: 'base64-decode', label: 'Base64 Decode', description: 'Decode Base64 string back to plain text' },
];

export function transformText(text: string, action: TransformerAction): string {
  switch (action) {
    case 'trim':
      return text.trim();

    case 'uppercase':
      return text.toUpperCase();

    case 'lowercase':
      return text.toLowerCase();

    case 'titlecase':
      return text.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());

    case 'camelcase': {
      return text
        .trim()
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
    }

    case 'kebabcase':
    case 'slugify': {
      return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    case 'format-json': {
      try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return text;
      }
    }

    case 'minify-json': {
      try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed);
      } catch {
        return text;
      }
    }

    case 'remove-duplicates': {
      const lines = text.split('\n');
      const seen = new Set<string>();
      const result: string[] = [];
      for (const line of lines) {
        if (!seen.has(line)) {
          seen.add(line);
          result.push(line);
        }
      }
      return result.join('\n');
    }

    case 'remove-empty-lines':
      return text
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .join('\n');

    case 'strip-html':
      return text.replace(/<[^>]*>?/gm, '');

    case 'base64-encode': {
      try {
        return btoa(unescape(encodeURIComponent(text)));
      } catch {
        return text;
      }
    }

    case 'base64-decode': {
      try {
        return decodeURIComponent(escape(atob(text.trim())));
      } catch {
        return text;
      }
    }

    default:
      return text;
  }
}
