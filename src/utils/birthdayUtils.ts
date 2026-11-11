export interface StaffBirthdayInfo {
  teacherId: string;
  fullName: string;
  phone: string;
  nric: string;
  birthYear: number;
  birthMonth: number; // 1..12
  birthDay: number;   // 1..31
  formattedBirthDate: string; // e.g. "17.09.1985 (1985年9月17日)"
  ageThisYear: number;
  daysUntilBirthday: number;  // 0 = 今天生日!
  isBirthdayToday: boolean;
  isBirthdayThisMonth: boolean;
  upcomingIn7Days: boolean;
}

export function extractBirthdayFromNric(
  staff: {
    teacherId?: string;
    id?: string;
    uid?: string;
    fullName?: string;
    name?: string;
    phone?: string;
    mobilePhone?: string;
    nric?: string;
    ic?: string;
    noKP?: string;
    [key: string]: any;
  },
  referenceDate: Date = new Date()
): StaffBirthdayInfo | null {
  const rawIc = staff.nric || staff.ic || staff.noKP || (staff as any).myKad || '';
  const digits = String(rawIc).replace(/\D/g, '');
  if (digits.length < 6) return null;

  const yy = parseInt(digits.slice(0, 2), 10);
  const mm = parseInt(digits.slice(2, 4), 10);
  const dd = parseInt(digits.slice(4, 6), 10);

  if (isNaN(yy) || isNaN(mm) || isNaN(dd) || mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return null;
  }

  const currentYear = referenceDate.getFullYear();
  const pivotTwoDigit = currentYear % 100;
  const birthYear = yy <= pivotTwoDigit ? 2000 + yy : 1900 + yy;

  // Validate actual calendar date
  const testDate = new Date(birthYear, mm - 1, dd);
  if (testDate.getMonth() + 1 !== mm || testDate.getDate() !== dd) {
    return null;
  }

  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  let nextBday = new Date(currentYear, mm - 1, dd);
  if (nextBday < today) {
    nextBday = new Date(currentYear + 1, mm - 1, dd);
  }

  const daysUntil = Math.round((nextBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isToday = today.getMonth() + 1 === mm && today.getDate() === dd;
  const isThisMonth = today.getMonth() + 1 === mm;
  const upcomingIn7Days = !isToday && daysUntil > 0 && daysUntil <= 7;

  const pad = (n: number) => String(n).padStart(2, '0');

  const teacherId = staff.teacherId || staff.id || staff.uid || staff.fullName || 'STAFF';
  const fullName = staff.fullName || staff.name || 'Guru';
  const phone = staff.phone || staff.mobilePhone || '';

  return {
    teacherId,
    fullName,
    phone,
    nric: rawIc,
    birthYear,
    birthMonth: mm,
    birthDay: dd,
    formattedBirthDate: `${pad(dd)}.${pad(mm)}.${birthYear} (${birthYear}年${mm}月${dd}日)`,
    ageThisYear: currentYear - birthYear,
    daysUntilBirthday: isToday ? 0 : daysUntil,
    isBirthdayToday: isToday,
    isBirthdayThisMonth: isThisMonth,
    upcomingIn7Days,
  };
}

export function filterStaffBirthdays(
  staffList: any[],
  referenceDate: Date = new Date()
): {
  today: StaffBirthdayInfo[];
  upcoming7Days: StaffBirthdayInfo[];
  thisMonth: StaffBirthdayInfo[];
  all: StaffBirthdayInfo[];
} {
  const all: StaffBirthdayInfo[] = [];

  staffList.forEach((s) => {
    const info = extractBirthdayFromNric(s, referenceDate);
    if (info) all.push(info);
  });

  // Sort by upcoming days
  all.sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday);

  const today = all.filter((s) => s.isBirthdayToday);
  const upcoming7Days = all.filter((s) => s.upcomingIn7Days);
  const thisMonth = all.filter((s) => s.isBirthdayThisMonth);

  return { today, upcoming7Days, thisMonth, all };
}

export default extractBirthdayFromNric;
