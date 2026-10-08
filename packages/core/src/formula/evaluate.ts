import { type FormulaError, FormulaException, type FormulaNode, parseFormula } from "./parser.ts";

export type Scope = Record<string, number>;
export type EvaluateResult = { ok: true; value: number } | { ok: false; error: FormulaError };

interface FunctionSpec {
  minArgs: number;
  maxArgs: number;
  run: (args: number[]) => number;
}

const FUNCTIONS: Record<string, FunctionSpec> = {
  min: { minArgs: 1, maxArgs: Infinity, run: (args) => Math.min(...args) },
  max: { minArgs: 1, maxArgs: Infinity, run: (args) => Math.max(...args) },
  round: { minArgs: 1, maxArgs: 1, run: ([x]) => Math.round(x as number) },
  floor: { minArgs: 1, maxArgs: 1, run: ([x]) => Math.floor(x as number) },
  ceil: { minArgs: 1, maxArgs: 1, run: ([x]) => Math.ceil(x as number) },
  abs: { minArgs: 1, maxArgs: 1, run: ([x]) => Math.abs(x as number) },
  sqrt: { minArgs: 1, maxArgs: 1, run: ([x]) => Math.sqrt(x as number) },
  clamp: {
    minArgs: 3,
    maxArgs: 3,
    run: ([x, lo, hi]) => Math.min(Math.max(x as number, lo as number), hi as number),
  },
  // Placeholder arity entry; `if` is evaluated lazily in evaluateCall.
  if: { minArgs: 3, maxArgs: 3, run: () => 0 },
};

function fail(message: string, position: number): never {
  throw new FormulaException(message, position);
}

function ensureFinite(value: number, position: number): number {
  if (!Number.isFinite(value)) fail("result is not finite", position);
  return value;
}

function applyBinary(operator: string, left: number, right: number, position: number): number {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      if (right === 0) fail("division by zero", position);
      return left / right;
    case "%":
      if (right === 0) fail("division by zero", position);
      return left % right;
    case "^":
      return left ** right;
    case "<":
      return Number(left < right);
    case "<=":
      return Number(left <= right);
    case ">":
      return Number(left > right);
    case ">=":
      return Number(left >= right);
    case "==":
      return Number(left === right);
    default:
      return Number(left !== right);
  }
}

function evaluateCall(node: Extract<FormulaNode, { type: "call" }>, scope: Scope): number {
  const spec = Object.hasOwn(FUNCTIONS, node.name) ? FUNCTIONS[node.name] : undefined;
  if (!spec) return fail(`unknown function "${node.name}"`, node.position);
  if (node.args.length < spec.minArgs || node.args.length > spec.maxArgs) {
    fail(`wrong number of arguments for "${node.name}"`, node.position);
  }
  if (node.name === "if") {
    const [condition, whenTrue, whenFalse] = node.args as [FormulaNode, FormulaNode, FormulaNode];
    return evaluateNode(evaluateNode(condition, scope) !== 0 ? whenTrue : whenFalse, scope);
  }
  const values = node.args.map((argument) => evaluateNode(argument, scope));
  return ensureFinite(spec.run(values), node.position);
}

function evaluateNode(node: FormulaNode, scope: Scope): number {
  switch (node.type) {
    case "number":
      return node.value;
    case "identifier":
      if (node.name === "pi") return Math.PI;
      if (!Object.hasOwn(scope, node.name)) fail(`unknown identifier "${node.name}"`, node.position);
      return ensureFinite(scope[node.name] as number, node.position);
    case "unary": {
      const operand = evaluateNode(node.operand, scope);
      return node.operator === "-" ? -operand : operand;
    }
    case "binary": {
      const left = evaluateNode(node.left, scope);
      const right = evaluateNode(node.right, scope);
      return ensureFinite(applyBinary(node.operator, left, right, node.position), node.position);
    }
    case "call":
      return evaluateCall(node, scope);
  }
}

export function evaluateFormula(source: string, scope: Scope): EvaluateResult {
  const parsed = parseFormula(source);
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, value: evaluateNode(parsed.ast, scope) };
  } catch (thrown) {
    if (thrown instanceof FormulaException) return { ok: false, error: thrown.error };
    throw thrown;
  }
}

export function resolveNumber(value: number | string, scope: Scope): EvaluateResult {
  if (typeof value === "number") return { ok: true, value };
  if (!value.startsWith("=")) {
    return { ok: false, error: { message: 'formula must start with "="', position: 0 } };
  }
  return evaluateFormula(value.slice(1), scope);
}
