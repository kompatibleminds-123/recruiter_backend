export function reportingMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit"
  }).formatToParts(now);
  return `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}`;
}

export function financialYearForMonth(month) {
  const [year, number] = String(month).split("-").map(Number);
  return String(number < 4 ? year - 1 : year);
}

export function startedFinancialYearMonths(startYear, currentMonth) {
  return Array.from({ length: 12 }, (_, index) => {
    const number = ((index + 3) % 12) + 1;
    return `${Number(startYear) + (index >= 9 ? 1 : 0)}-${String(number).padStart(2, "0")}`;
  }).filter((month) => month <= currentMonth);
}

export const financialYearLabel = (year) => `Apr ${String(year).slice(-2)} – Mar ${String(Number(year) + 1).slice(-2)}`;
