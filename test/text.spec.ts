import { codePointLength, compareCodePoints } from '../src/utils/text';

describe('codePointLength', () => {
  it('should count ASCII characters', () => {
    expect(codePointLength('hello')).toEqual(5);
  });
  it('should handle surrogate pair as a single code point', () => {
    expect(codePointLength('𝌆')).toEqual(1);
  });
});

describe('compareCodePoints', () => {
  it('should order two strings <=', () => {
    expect(compareCodePoints('hello', 'world')).toEqual(-1);
  });
  it('should order two strings == ', () => {
    expect(compareCodePoints('goodbye', 'goodbye')).toEqual(-1);
  });
  it('should order two strings >= ', () => {
    expect(compareCodePoints('world', 'cruel')).toEqual(1);
  });
});
