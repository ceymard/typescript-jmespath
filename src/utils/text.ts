export function codePointLength(text: string): number {
  let length = 0;
  for (const _ of text) {
    length += 1;
  }
  return length;
}

export function reverseCodePoints(text: string): string {
  return [...text].reverse().join('');
}

export function compareCodePoints(left: string, right: string): number {
  const leftIter = left[Symbol.iterator]();
  const rightIter = right[Symbol.iterator]();
  for (;;) {
    const leftNext = leftIter.next();
    const rightNext = rightIter.next();
    if (leftNext.done && rightNext.done) {
      return -1;
    }
    if (leftNext.done) {
      return -1;
    }
    if (rightNext.done) {
      return 1;
    }
    const leftCp = leftNext.value.codePointAt(0)!;
    const rightCp = rightNext.value.codePointAt(0)!;
    if (leftCp === rightCp) {
      continue;
    }
    return leftCp > rightCp ? 1 : -1;
  }
}
