import { describe, expect, it } from 'vitest';
import jmespath from '../src';
import { Token } from '../src/Lexer.type';

describe('tokenize', () => {
  it('should tokenize root node reference', () => {
    expect(jmespath.tokenize('$')).toMatchObject([{ type: Token.TOK_VARIABLE, value: '', start: 0 }]);
  });
  it('should tokenize variable reference', () => {
    expect(jmespath.tokenize('$foo')).toMatchObject([{ type: Token.TOK_VARIABLE, value: 'foo', start: 0 }]);
  });
  it('should tokenize assign operator', () => {
    expect(jmespath.tokenize('=')).toMatchObject([{ type: Token.TOK_ASSIGN, value: '=', start: 0 }]);
  });
  it('should tokenize arithmetic + plus sign', () => {
    expect(jmespath.tokenize('+')).toMatchObject([{ type: Token.TOK_PLUS, value: '+', start: 0 }]);
  });
  it('should tokenize arithmetic - minus sign', () => {
    expect(jmespath.tokenize('-')).toMatchObject([{ type: Token.TOK_MINUS, value: '-', start: 0 }]);
  });
  it('should tokenize arithmetic − (U+2212) minus sign', () => {
    expect(jmespath.tokenize('−')).toMatchObject([{ type: Token.TOK_MINUS, value: '\u2212', start: 0 }]);
  });
  it('should tokenize arithmetic × (U+00D7) multiplication sign', () => {
    expect(jmespath.tokenize('×')).toMatchObject([{ type: Token.TOK_MULTIPLY, value: '\u00d7', start: 0 }]);
  });
  it('should tokenize arithmetic / division operator', () => {
    expect(jmespath.tokenize('/')).toMatchObject([{ type: Token.TOK_DIVIDE, value: '/', start: 0 }]);
  });
  it('should tokenize arithmetic ÷ (U+00F7) division sign', () => {
    expect(jmespath.tokenize('÷')).toMatchObject([{ type: Token.TOK_DIVIDE, value: '\u00f7', start: 0 }]);
  });
  it('should tokenize arithmetic % modulo operator', () => {
    expect(jmespath.tokenize('%')).toMatchObject([{ type: Token.TOK_MODULO, value: '%', start: 0 }]);
  });
  it('should tokenize arithmetic // integer division operator', () => {
    expect(jmespath.tokenize('//')).toMatchObject([{ type: Token.TOK_DIV, value: '//', start: 0 }]);
  });
  it('should tokenize unquoted identifier', () => {
    expect(jmespath.tokenize('foo')).toMatchObject([{ type: Token.TOK_UNQUOTEDIDENTIFIER, value: 'foo', start: 0 }]);
  });
  it('should tokenize unquoted identifier with underscore', () => {
    expect(jmespath.tokenize('_underscore')).toMatchObject([
      { type: Token.TOK_UNQUOTEDIDENTIFIER, value: '_underscore', start: 0 },
    ]);
  });
  it('should tokenize unquoted identifier with numbers', () => {
    expect(jmespath.tokenize('foo123')).toMatchObject([{ type: Token.TOK_UNQUOTEDIDENTIFIER, value: 'foo123', start: 0 }]);
  });
  it('should tokenize dotted lookups', () => {
    expect(jmespath.tokenize('foo.bar')).toMatchObject([
      { type: Token.TOK_UNQUOTEDIDENTIFIER, value: 'foo', start: 0 },
      { type: Token.TOK_DOT, value: '.', start: 3 },
      { type: Token.TOK_UNQUOTEDIDENTIFIER, value: 'bar', start: 4 },
    ]);
  });
  it('should tokenize numbers', () => {
    expect(jmespath.tokenize('foo[0]')).toMatchObject([
      { type: Token.TOK_UNQUOTEDIDENTIFIER, value: 'foo', start: 0 },
      { type: Token.TOK_LBRACKET, value: '[', start: 3 },
      { type: Token.TOK_NUMBER, value: 0, start: 4 },
      { type: Token.TOK_RBRACKET, value: ']', start: 5 },
    ]);
  });
  it('should tokenize numbers with multiple digits', () => {
    expect(jmespath.tokenize('12345')).toMatchObject([{ type: Token.TOK_NUMBER, value: 12345, start: 0 }]);
  });
  it('should tokenize negative numbers', () => {
    expect(jmespath.tokenize('-12345')).toMatchObject([{ type: Token.TOK_NUMBER, value: -12345, start: 0 }]);
  });
  it('should tokenize quoted identifier', () => {
    expect(jmespath.tokenize('"foo"')).toMatchObject([{ type: Token.TOK_QUOTEDIDENTIFIER, value: 'foo', start: 0 }]);
  });
  it('should tokenize quoted identifier with unicode escape', () => {
    expect(jmespath.tokenize('"\\u2713"')).toMatchObject([{ type: Token.TOK_QUOTEDIDENTIFIER, value: '✓', start: 0 }]);
  });
  it('should tokenize literal lists', () => {
    expect(jmespath.tokenize('`[0, 1]`')).toMatchObject([{ type: Token.TOK_LITERAL, value: [0, 1], start: 0 }]);
  });
  it('should tokenize literal dict', () => {
    expect(jmespath.tokenize('`{"foo": "bar"}`')).toMatchObject([{ type: Token.TOK_LITERAL, value: { foo: 'bar' }, start: 0 }]);
  });
  it('should tokenize literal strings', () => {
    expect(jmespath.tokenize('`"foo"`')).toMatchObject([{ type: Token.TOK_LITERAL, value: 'foo', start: 0 }]);
  });
  it('should tokenize json literals', () => {
    expect(jmespath.tokenize('`true`')).toMatchObject([{ type: Token.TOK_LITERAL, value: true, start: 0 }]);
  });
  it('should tokenize raw strings', () => {
    expect(jmespath.tokenize("'raw-string'")).toMatchObject([{ type: Token.TOK_LITERAL, value: 'raw-string', start: 0 }]);
  });
  it('should tokenize raw strings single quote', () => {
    expect(jmespath.tokenize("'\\''")).toMatchObject([{ type: Token.TOK_LITERAL, value: "'", start: 0 }]);
  });
  it('should tokenize raw strings surrounding quotes', () => {
    expect(jmespath.tokenize("'\\'raw-string\\''")).toMatchObject([
      { type: Token.TOK_LITERAL, value: "'raw-string'", start: 0 },
    ]);
  });
  it('should tokenize raw strings backslash characters', () => {
    expect(jmespath.tokenize("'\\\\'")).toMatchObject([{ type: Token.TOK_LITERAL, value: '\\', start: 0 }]);
  });
  it('should not require surrounding quotes for strings', () => {
    expect(jmespath.tokenize('`foo`', { enable_legacy_literals: true })).toMatchObject([
      { type: Token.TOK_LITERAL, value: 'foo', start: 0 },
    ]);
  });
  it('should not require surrounding quotes for numbers', () => {
    expect(jmespath.tokenize('`20`')).toMatchObject([{ type: Token.TOK_LITERAL, value: 20, start: 0 }]);
  });
  it('should tokenize literal lists with chars afterwards', () => {
    expect(jmespath.tokenize('`[0, 1]`[0]')).toMatchObject([
      { type: Token.TOK_LITERAL, value: [0, 1], start: 0 },
      { type: Token.TOK_LBRACKET, value: '[', start: 8 },
      { type: Token.TOK_NUMBER, value: 0, start: 9 },
      { type: Token.TOK_RBRACKET, value: ']', start: 10 },
    ]);
  });
  it('should tokenize two char tokens with shared prefix', () => {
    expect(jmespath.tokenize('[?foo]')).toMatchObject([
      { type: Token.TOK_FILTER, value: '[?', start: 0 },
      { type: Token.TOK_UNQUOTEDIDENTIFIER, value: 'foo', start: 2 },
      { type: Token.TOK_RBRACKET, value: ']', start: 5 },
    ]);
  });
  it('should tokenize flatten operator', () => {
    expect(jmespath.tokenize('[]')).toMatchObject([{ type: Token.TOK_FLATTEN, value: '[]', start: 0 }]);
  });
  it('should tokenize comparators', () => {
    expect(jmespath.tokenize('<')).toMatchObject([{ type: Token.TOK_LT, value: '<', start: 0 }]);
  });
  it('should tokenize two char tokens without shared prefix', () => {
    expect(jmespath.tokenize('==')).toMatchObject([{ type: Token.TOK_EQ, value: '==', start: 0 }]);
  });
  it('should tokenize not equals', () => {
    expect(jmespath.tokenize('!=')).toMatchObject([{ type: Token.TOK_NE, value: '!=', start: 0 }]);
  });
  it('should tokenize the OR token', () => {
    expect(jmespath.tokenize('a||b')).toMatchObject([
      { type: Token.TOK_UNQUOTEDIDENTIFIER, value: 'a', start: 0 },
      { type: Token.TOK_OR, value: '||', start: 1 },
      { type: Token.TOK_UNQUOTEDIDENTIFIER, value: 'b', start: 3 },
    ]);
  });
  it('should tokenize function calls', () => {
    expect(jmespath.tokenize('abs(@)')).toMatchObject([
      { type: Token.TOK_UNQUOTEDIDENTIFIER, value: 'abs', start: 0 },
      { type: Token.TOK_LPAREN, value: '(', start: 3 },
      { type: Token.TOK_CURRENT, value: '@', start: 4 },
      { type: Token.TOK_RPAREN, value: ')', start: 5 },
    ]);
  });
});
