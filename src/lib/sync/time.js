/** Progress timestamps: store UTC ISO-8601; display in Asia/Tokyo (JST). */

export const DISPLAY_TZ = 'Asia/Tokyo';

export function nowUtcIso(date = new Date()) {
  return new Date(date).toISOString();
}

/** Format a UTC ISO / Date for teacher/student UI in JST with zone label. */
export function formatJst(utcIsoOrDate, { withSeconds = false } = {}) {
  const d = utcIsoOrDate instanceof Date ? utcIsoOrDate : new Date(utcIsoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const opts = {
    timeZone: DISPLAY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  if (withSeconds) opts.second = '2-digit';
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  const base = `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}${
    withSeconds ? `:${get('second')}` : ''
  }`;
  return `${base} JST`;
}
