/**
 * 電話號碼正規化：WhatsApp webhook 的 from 多為無 + 號的國碼+號碼（如 85291234567）。
 */

export function normalizePhoneE164(input: string | null | undefined): string {
  if (!input) return ''
  let digits = String(input).replace(/\D/g, '')
  // 香港常見：以 0 開頭的 8 位本地號 → 補 852
  if (digits.length === 8 && /^[2-9]/.test(digits)) {
    digits = `852${digits}`
  }
  // 去掉開頭多餘的 00
  if (digits.startsWith('00')) digits = digits.slice(2)
  return digits
}

export function phonesMatch(a: string, b: string) {
  const na = normalizePhoneE164(a)
  const nb = normalizePhoneE164(b)
  if (!na || !nb) return false
  return na === nb || na.endsWith(nb) || nb.endsWith(na)
}
