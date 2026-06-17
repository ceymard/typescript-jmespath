import { LexerOptions } from './Lexer.type';

export interface Options extends LexerOptions {
  enable_object_property_shorthand?: boolean

  /** turns on enable_property_shorthand */
  enable_experiments?: boolean
}
