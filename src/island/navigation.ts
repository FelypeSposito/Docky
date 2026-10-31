/** A página vizinha de `current` na lista `ids`, dando a volta nas pontas. Se `current` não existe, parte da primeira. */
export function neighbor(ids: string[], current: string, delta: number): string {
  const index = Math.max(0, ids.indexOf(current));
  return ids[(index + delta + ids.length) % ids.length];
}
