export interface FormulaError {
  message: string;
  position: number;
}

export type FormulaNode =
  | { type: "number"; value: number; position: number }
  | { type: "identifier"; name: string; position: number }
  | { type: "unary"; operator: "-" | "+"; operand: FormulaNode; position: number }
  | { type: "binary"; operator: string; left: FormulaNode; right: FormulaNode; position: number }
  | { type: "call"; name: string; args: FormulaNode[]; position: number };

export type ParseResult =
  | { ok: true; ast: FormulaNode; identifiers: string[] }
  | { ok: false; error: FormulaError };

export class FormulaException extends Error {
  readonly error: FormulaError;

  constructor(message: string, position: number) {
    super(message);
    this.error = { message, position };
  }
}

interface Token {
  kind: "number" | "identifier" | "operator" | "end";
  text: string;
  position: number;
}

const NUMBER_PATTERN = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/y;
const OPERATOR_PATTERN = /<=|>=|==|!=|[-+*/%^()<>,]/y;

function matchAt(pattern: RegExp, source: string, index: number): string | null {
  pattern.lastIndex = index;
  return pattern.exec(source)?.[0] ?? null;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    if (/\s/.test(source.charAt(index))) {
      index += 1;
      continue;
    }
    const number = matchAt(NUMBER_PATTERN, source, index);
    const identifier = matchAt(IDENTIFIER_PATTERN, source, index);
    const operator = matchAt(OPERATOR_PATTERN, source, index);
    const kind = number ? "number" : identifier ? "identifier" : "operator";
    const text = number ?? identifier ?? operator;
    if (text === null) {
      throw new FormulaException(`unexpected character "${source.charAt(index)}"`, index);
    }
    tokens.push({ kind, text, position: index });
    index += text.length;
  }
  tokens.push({ kind: "end", text: "", position: source.length });
  return tokens;
}

// Binding powers: comparison < additive < multiplicative < unary < power.
const BINARY_BINDING: Record<string, { power: number; rightAssociative: boolean }> = {
  "<": { power: 1, rightAssociative: false },
  "<=": { power: 1, rightAssociative: false },
  ">": { power: 1, rightAssociative: false },
  ">=": { power: 1, rightAssociative: false },
  "==": { power: 1, rightAssociative: false },
  "!=": { power: 1, rightAssociative: false },
  "+": { power: 2, rightAssociative: false },
  "-": { power: 2, rightAssociative: false },
  "*": { power: 3, rightAssociative: false },
  "/": { power: 3, rightAssociative: false },
  "%": { power: 3, rightAssociative: false },
  "^": { power: 5, rightAssociative: true },
};
const UNARY_POWER = 4;
const MAX_NESTING_DEPTH = 64;

class Parser {
  private index = 0;
  private depth = 0;
  private readonly tokens: Token[];
  readonly identifiers: string[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseAll(): FormulaNode {
    const node = this.parseExpression(0);
    const token = this.peek();
    if (token.kind !== "end") throw this.unexpected(token);
    return node;
  }

  private peek(): Token {
    return this.tokens[this.index] as Token;
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== "end") this.index += 1;
    return token;
  }

  private unexpected(token: Token): FormulaException {
    const message = token.kind === "end" ? "unexpected end of formula" : `unexpected "${token.text}"`;
    return new FormulaException(message, token.position);
  }

  private isOperator(token: Token, text: string): boolean {
    return token.kind === "operator" && token.text === text;
  }

  private expect(text: string): void {
    const token = this.next();
    if (!this.isOperator(token, text)) throw this.unexpected(token);
  }

  private parseExpression(minPower: number): FormulaNode {
    if (this.depth >= MAX_NESTING_DEPTH) throw new FormulaException("formula is too deeply nested", this.peek().position);
    this.depth += 1;
    try {
      return this.parseBinary(minPower);
    } finally {
      this.depth -= 1;
    }
  }

  private parseBinary(minPower: number): FormulaNode {
    let left = this.parsePrefix();
    for (;;) {
      const token = this.peek();
      const binding = token.kind === "operator" ? BINARY_BINDING[token.text] : undefined;
      if (!binding || binding.power < minPower) return left;
      this.next();
      const right = this.parseExpression(binding.rightAssociative ? binding.power : binding.power + 1);
      left = { type: "binary", operator: token.text, left, right, position: token.position };
    }
  }

  private parsePrefix(): FormulaNode {
    const token = this.next();
    if (token.kind === "number") {
      return { type: "number", value: Number(token.text), position: token.position };
    }
    if (token.kind === "identifier") return this.parseIdentifierOrCall(token);
    if (this.isOperator(token, "-") || this.isOperator(token, "+")) {
      const operand = this.parseExpression(UNARY_POWER);
      return { type: "unary", operator: token.text as "-" | "+", operand, position: token.position };
    }
    if (this.isOperator(token, "(")) {
      const inner = this.parseExpression(0);
      this.expect(")");
      return inner;
    }
    throw this.unexpected(token);
  }

  private parseIdentifierOrCall(token: Token): FormulaNode {
    if (!this.isOperator(this.peek(), "(")) {
      if (token.text !== "pi" && !this.identifiers.includes(token.text)) {
        this.identifiers.push(token.text);
      }
      return { type: "identifier", name: token.text, position: token.position };
    }
    this.next();
    const args: FormulaNode[] = [];
    if (this.isOperator(this.peek(), ")")) {
      this.next();
    } else {
      args.push(this.parseExpression(0));
      while (this.isOperator(this.peek(), ",")) {
        this.next();
        args.push(this.parseExpression(0));
      }
      this.expect(")");
    }
    return { type: "call", name: token.text, args, position: token.position };
  }
}

export function parseFormula(source: string): ParseResult {
  try {
    const parser = new Parser(tokenize(source));
    const ast = parser.parseAll();
    return { ok: true, ast, identifiers: parser.identifiers };
  } catch (thrown) {
    if (thrown instanceof FormulaException) return { ok: false, error: thrown.error };
    throw thrown;
  }
}
