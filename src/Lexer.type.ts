import { JSONValue } from './JSON.type';

export enum Token {
  TOK_EOF = 0,
  TOK_VARIABLE = 1,
  TOK_ASSIGN = 2,
  TOK_UNQUOTEDIDENTIFIER = 3,
  TOK_QUOTEDIDENTIFIER = 4,
  TOK_RBRACKET = 5,
  TOK_RPAREN = 6,
  TOK_COMMA = 7,
  TOK_COLON = 8,
  TOK_RBRACE = 9,
  TOK_NUMBER = 10,
  TOK_CURRENT = 11,
  TOK_ROOT = 12,
  TOK_EXPREF = 13,
  TOK_PIPE = 14,
  TOK_OR = 15,
  TOK_AND = 16,
  TOK_EQ = 17,
  TOK_GT = 18,
  TOK_LT = 19,
  TOK_GTE = 20,
  TOK_LTE = 21,
  TOK_NE = 22,
  TOK_PLUS = 23,
  TOK_MINUS = 24,
  TOK_MULTIPLY = 25,
  TOK_DIVIDE = 26,
  TOK_MODULO = 27,
  TOK_DIV = 28,
  TOK_FLATTEN = 29,
  TOK_STAR = 30,
  TOK_FILTER = 31,
  TOK_DOT = 32,
  TOK_NOT = 33,
  TOK_LBRACE = 34,
  TOK_LBRACKET = 35,
  TOK_LPAREN = 36,
  TOK_LITERAL = 37,
  TOK_QUESTION = 38,
}

export const TOKEN_NAMES: Record<Token, string> = {
  [Token.TOK_EOF]: 'EOF',
  [Token.TOK_VARIABLE]: 'Variable',
  [Token.TOK_ASSIGN]: 'Assign',
  [Token.TOK_UNQUOTEDIDENTIFIER]: 'UnquotedIdentifier',
  [Token.TOK_QUOTEDIDENTIFIER]: 'QuotedIdentifier',
  [Token.TOK_RBRACKET]: 'Rbracket',
  [Token.TOK_RPAREN]: 'Rparen',
  [Token.TOK_COMMA]: 'Comma',
  [Token.TOK_COLON]: 'Colon',
  [Token.TOK_RBRACE]: 'Rbrace',
  [Token.TOK_NUMBER]: 'Number',
  [Token.TOK_CURRENT]: 'Current',
  [Token.TOK_ROOT]: 'Root',
  [Token.TOK_EXPREF]: 'Expref',
  [Token.TOK_PIPE]: 'Pipe',
  [Token.TOK_OR]: 'Or',
  [Token.TOK_AND]: 'And',
  [Token.TOK_EQ]: 'EQ',
  [Token.TOK_GT]: 'GT',
  [Token.TOK_LT]: 'LT',
  [Token.TOK_GTE]: 'GTE',
  [Token.TOK_LTE]: 'LTE',
  [Token.TOK_NE]: 'NE',
  [Token.TOK_PLUS]: 'Plus',
  [Token.TOK_MINUS]: 'Minus',
  [Token.TOK_MULTIPLY]: 'Multiply',
  [Token.TOK_DIVIDE]: 'Divide',
  [Token.TOK_MODULO]: 'Modulo',
  [Token.TOK_DIV]: 'Div',
  [Token.TOK_FLATTEN]: 'Flatten',
  [Token.TOK_STAR]: 'Star',
  [Token.TOK_FILTER]: 'Filter',
  [Token.TOK_DOT]: 'Dot',
  [Token.TOK_NOT]: 'Not',
  [Token.TOK_LBRACE]: 'Lbrace',
  [Token.TOK_LBRACKET]: 'Lbracket',
  [Token.TOK_LPAREN]: 'Lparen',
  [Token.TOK_LITERAL]: 'Literal',
  [Token.TOK_QUESTION]: 'Question',
};

export function tokenName(token: Token): string {
  return TOKEN_NAMES[token];
}

export type LexerTokenValue = JSONValue;

export interface LexerToken {
  type: Token;
  value: LexerTokenValue;
  start: number;
}

export interface LexerOptions {
  // The flag to enable pre-JEP-12 literal compatibility.
  // JEP-12 deprecates `foo` -> "foo" syntax.
  // Valid expressions MUST use: `"foo"` -> "foo"
  //
  // Setting this flag to `true` enables support for legacy syntax.
  //
  enable_legacy_literals?: boolean;

  enable_unicode_identifiers?: boolean;
  enable_experiments?: boolean;
}
