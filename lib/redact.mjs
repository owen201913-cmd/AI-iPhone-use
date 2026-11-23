function safeDisplayUrl(input) {
  try {
    const url = new URL(input);
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    return redactSensitiveText(url.href, false);
  } catch { return ''; }
}

/** Remove common credentials, email addresses and URL query/fragment values before model use. */
export function redactSensitiveText(value, redactUrls = true) {
  let text = String(value ?? '');
  if (redactUrls) text = text.replace(/https?:\/\/[^\s<>"']+/gi, match => safeDisplayUrl(match));
  return text
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, '[email]')
    .replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk[-_]|pk[-_]|ts[-_]|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{10,}/g, '[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted]')
    .replace(/\b((?:api[ _-]?key|access[ _-]?token|token|secret|password|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]');
}

