import type { User } from '@/types/database'

/** Sentinel for users without a department in filter dropdowns */
export const UNSPECIFIED_DEPARTMENT = '__unspecified__'

export function userDepartment(user: Pick<User, 'department'> | undefined | null): string {
  return String(user?.department || '').trim()
}

export function departmentsFromUsers(users: Pick<User, 'department'>[]): string[] {
  return [...new Set(users.map((u) => userDepartment(u)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'tr')
  )
}

export function usersHaveUnspecifiedDepartment(users: Pick<User, 'department'>[]): boolean {
  return users.some((u) => !userDepartment(u))
}

export function userMatchesDepartment(
  user: Pick<User, 'department'>,
  filterDept: string
): boolean {
  if (!filterDept) return true
  if (filterDept === UNSPECIFIED_DEPARTMENT) return !userDepartment(user)
  return userDepartment(user) === filterDept
}

/** Matris ataması: değerlendiren veya değerlendirilen bu birimdeyse */
export function assignmentMatchesDepartment(
  evaluator: Pick<User, 'department'> | null | undefined,
  target: Pick<User, 'department'> | null | undefined,
  filterDept: string
): boolean {
  if (!filterDept) return true
  return (
    userMatchesDepartment(evaluator || { department: null }, filterDept) ||
    userMatchesDepartment(target || { department: null }, filterDept)
  )
}
