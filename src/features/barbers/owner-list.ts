export function splitByActive<T extends { active: boolean }>(items: T[]) {
  return { active: items.filter((item) => item.active), inactive: items.filter((item) => !item.active) };
}
