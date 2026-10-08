import { describe, expect, it } from "vitest";
import { evaluateFormula, resolveNumber } from "../src/formula/evaluate.ts";
import { parseFormula } from "../src/formula/parser.ts";

// Convention: formula sources passed to parseFormula/evaluateFormula carry NO leading "=".
// Only resolveNumber deals with the "=" marker.

function evalOk(source: string, scope: Record<string, number> = {}): number {
  const result = evaluateFormula(source, scope);
  if (!result.ok) throw new Error(`expected ok for "${source}", got: ${result.error.message}`);
  return result.value;
}

function evalError(source: string, scope: Record<string, number> = {}) {
  const result = evaluateFormula(source, scope);
  if (result.ok) throw new Error(`expected error for "${source}", got value ${result.value}`);
  return result.error;
}

function parseError(source: string) {
  const result = parseFormula(source);
  if (result.ok) throw new Error(`expected syntax error for "${source}"`);
  return result.error;
}

describe("number literals", () => {
  // Red if the tokenizer rejects/misreads any literal form from the grammar.
  it.each([
    ["1", 1],
    ["42", 42],
    ["0.5", 0.5],
    [".5", 0.5],
    ["1e-3", 0.001],
    ["2.5e2", 250],
    ["1E3", 1000],
  ])("parses %s as %d", (source, expected) => {
    expect(evalOk(source)).toBeCloseTo(expected, 12);
  });

  // Red if whitespace handling is missing.
  it("ignores whitespace anywhere between tokens", () => {
    expect(evalOk("  1 +\t2 *   3 ")).toBe(7);
  });
});

describe("precedence and associativity", () => {
  // Red if * and + are evaluated left to right without precedence.
  it("multiplication binds tighter than addition", () => {
    expect(evalOk("1 + 2 * 3")).toBe(7);
    expect(evalOk("2 * 3 + 1")).toBe(7);
  });

  // Red if parentheses are ignored.
  it("parentheses override precedence", () => {
    expect(evalOk("(1 + 2) * 3")).toBe(9);
  });

  // Red if - or / become right-associative.
  it("subtraction and division are left-associative", () => {
    expect(evalOk("10 - 3 - 2")).toBe(5);
    expect(evalOk("100 / 10 / 5")).toBe(2);
  });

  // Red if ^ is left-associative (would give 64).
  it("^ is right-associative", () => {
    expect(evalOk("2 ^ 3 ^ 2")).toBe(512);
  });

  // Red if ^ has lower precedence than * (would give 36).
  it("^ binds tighter than *", () => {
    expect(evalOk("2 * 3 ^ 2")).toBe(18);
  });

  // Red if unary minus binds tighter than ^ (would give 4).
  it("unary minus binds looser than ^ on its left operand", () => {
    expect(evalOk("-2 ^ 2")).toBe(-4);
  });

  // Red if the exponent cannot carry a unary sign.
  it("allows a unary sign in the exponent", () => {
    expect(evalOk("2 ^ -1")).toBe(0.5);
    expect(evalOk("2 ^ +2")).toBe(4);
  });

  // Red if unary operators do not stack or unary plus is rejected.
  it("supports stacked unary operators", () => {
    expect(evalOk("--3")).toBe(3);
    expect(evalOk("-+3")).toBe(-3);
    expect(evalOk("+3")).toBe(3);
    expect(evalOk("3 - -2")).toBe(5);
  });

  // Red if unary minus is applied to the wrong operand.
  it("unary minus applies to the following operand before multiplication", () => {
    expect(evalOk("-2 * 3")).toBe(-6);
    expect(evalOk("2 * -3")).toBe(-6);
  });
});

describe("modulo", () => {
  // Red if % is missing or mapped to another operator.
  it("computes the remainder", () => {
    expect(evalOk("7 % 3")).toBe(1);
    expect(evalOk("7.5 % 2")).toBeCloseTo(1.5, 12);
  });

  // Red if % has additive precedence: (2 + 7) % 4 = 1 instead of 2 + (7 % 4) = 5.
  it("has the same precedence as * and /", () => {
    expect(evalOk("2 + 7 % 4")).toBe(5);
  });

  // Red if modulo by zero silently yields NaN/0 instead of an error.
  it("reports modulo by zero as an error", () => {
    expect(evalError("5 % 0").message).toMatch(/zero|finite/i);
  });
});

describe("comparisons", () => {
  // Red if any comparison operator is missing or inverted.
  it.each([
    ["1 < 2", 1],
    ["2 < 1", 0],
    ["2 < 2", 0],
    ["2 <= 2", 1],
    ["3 <= 2", 0],
    ["2 > 1", 1],
    ["1 > 2", 0],
    ["2 >= 2", 1],
    ["1 >= 2", 0],
    ["2 == 2", 1],
    ["2 == 3", 0],
    ["2 != 3", 1],
    ["2 != 2", 0],
  ])("%s yields %d", (source, expected) => {
    expect(evalOk(source)).toBe(expected);
  });

  // Red if comparisons bind tighter than arithmetic.
  it("comparisons have lower precedence than arithmetic", () => {
    expect(evalOk("1 + 2 == 3")).toBe(1);
    expect(evalOk("2 * 3 > 5")).toBe(1);
  });
});

describe("functions", () => {
  // Red if min/max ignore extra args or the lower bound of the arity.
  it("min and max accept one or more arguments", () => {
    expect(evalOk("min(4)")).toBe(4);
    expect(evalOk("min(4, 2, 9)")).toBe(2);
    expect(evalOk("max(4)")).toBe(4);
    expect(evalOk("max(4, 2, 9)")).toBe(9);
  });

  // Red if min()/max() with zero args is accepted.
  it("min and max reject zero arguments", () => {
    expect(evalError("min()").message).toMatch(/argument/i);
    expect(evalError("max()").message).toMatch(/argument/i);
  });

  // Red if round truncates or uses banker's rounding.
  it("round rounds to nearest integer", () => {
    expect(evalOk("round(2.4)")).toBe(2);
    expect(evalOk("round(2.5)")).toBe(3);
    expect(evalOk("round(-2.4)")).toBe(-2);
  });

  // Red if floor/ceil are swapped or truncate toward zero.
  it("floor and ceil round down and up", () => {
    expect(evalOk("floor(2.7)")).toBe(2);
    expect(evalOk("floor(-2.1)")).toBe(-3);
    expect(evalOk("ceil(2.1)")).toBe(3);
    expect(evalOk("ceil(-2.7)")).toBe(-2);
  });

  // Red if abs is missing.
  it("abs returns the magnitude", () => {
    expect(evalOk("abs(-3.5)")).toBe(3.5);
    expect(evalOk("abs(3.5)")).toBe(3.5);
  });

  // Red if sqrt is missing.
  it("sqrt returns the square root", () => {
    expect(evalOk("sqrt(16)")).toBe(4);
    expect(evalOk("sqrt(2)")).toBeCloseTo(Math.SQRT2, 12);
  });

  // Red if clamp argument order or bounds handling is wrong.
  it("clamp limits x to [lo, hi]", () => {
    expect(evalOk("clamp(5, 0, 10)")).toBe(5);
    expect(evalOk("clamp(-5, 0, 10)")).toBe(0);
    expect(evalOk("clamp(15, 0, 10)")).toBe(10);
  });

  // Red if if() evaluates the wrong branch or treats nonzero as false.
  it("if picks the first branch when cond is non-zero, else the second", () => {
    expect(evalOk("if(1, 10, 20)")).toBe(10);
    expect(evalOk("if(0, 10, 20)")).toBe(20);
    expect(evalOk("if(-3, 10, 20)")).toBe(10);
    expect(evalOk("if(0.5, 10, 20)")).toBe(10);
    expect(evalOk("if(2 > 1, 10, 20)")).toBe(10);
  });

  // Red if if() evaluates both branches eagerly (the dead branch divides by zero).
  it("if does not evaluate the branch not taken", () => {
    expect(evalOk("if(1, 7, 1 / 0)")).toBe(7);
    expect(evalOk("if(0, 1 / 0, 7)")).toBe(7);
  });

  // Red if function calls cannot be nested or take expression arguments.
  it("supports nested calls and expression arguments", () => {
    expect(evalOk("max(min(5, 8), abs(-2) * 2)")).toBe(5);
    expect(evalOk("sqrt(3 * 3 + 4 * 4)")).toBe(5);
  });

  // Red if arity is not enforced for fixed-arity functions.
  it.each([
    "round()",
    "round(1, 2)",
    "floor()",
    "floor(1, 2)",
    "ceil()",
    "ceil(1, 2)",
    "abs()",
    "abs(1, 2)",
    "sqrt()",
    "sqrt(1, 2)",
    "clamp(1, 2)",
    "clamp(1, 2, 3, 4)",
    "clamp()",
    "if(1, 2)",
    "if(1, 2, 3, 4)",
    "if()",
  ])("rejects wrong argument count: %s", (source) => {
    expect(evalError(source).message).toMatch(/argument/i);
  });

  // Red if unknown functions silently evaluate or are reported as identifiers.
  it("reports an unknown function", () => {
    const error = evalError("foo(1)");
    expect(error.message).toMatch(/unknown function/i);
    expect(error.position).toBe(0);
  });

  // Red if function names are matched case-insensitively.
  it("function names are case-sensitive", () => {
    expect(evalError("MAX(1, 2)").message).toMatch(/unknown function/i);
  });
});

describe("constant pi", () => {
  // Red if pi is missing or not Math.PI.
  it("evaluates to Math.PI without a scope entry", () => {
    expect(evalOk("pi")).toBe(Math.PI);
    expect(evalOk("2 * pi")).toBeCloseTo(2 * Math.PI, 12);
  });
});

describe("identifiers and scope", () => {
  // Red if scope lookup is missing.
  it("reads identifiers from the scope", () => {
    expect(evalOk("width - 2 * armWidth", { width: 10, armWidth: 1.5 })).toBe(7);
    expect(evalOk("_a1 + b_2", { _a1: 1, b_2: 2 })).toBe(3);
  });

  // Red if identifiers are not deduplicated or lose first-occurrence order.
  it("returns identifiers deduplicated in first-occurrence order", () => {
    const result = parseFormula("a + b * a + c - b");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.identifiers).toEqual(["a", "b", "c"]);
  });

  // Red if function names or pi leak into the identifier list.
  it("does not list function names or pi as identifiers", () => {
    const result = parseFormula("max(width, 1) * pi + if(depth, 1, 2)");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.identifiers).toEqual(["width", "depth"]);
  });

  // Red if a formula without identifiers returns a non-array.
  it("returns an empty identifier list for constant formulas", () => {
    const result = parseFormula("1 + 2");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.identifiers).toEqual([]);
  });

  // Red if parseFormula omits the ast.
  it("returns an ast on success", () => {
    const result = parseFormula("1 + 2");
    expect(result.ok && result.ast).toBeTruthy();
  });

  // Red if unknown identifiers evaluate to 0/NaN instead of an error.
  it("reports an unknown identifier with its position", () => {
    const error = evalError("1 + foo", {});
    expect(error.message).toMatch(/unknown identifier/i);
    expect(error.message).toContain("foo");
    expect(error.position).toBe(4);
  });

  // Red if identifier names are matched case-insensitively.
  it("identifiers are case-sensitive", () => {
    expect(evalError("Width", { width: 1 }).message).toMatch(/unknown identifier/i);
  });

  // Red if identifier lookup uses `in` / bare property access (reaches Object.prototype).
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"])(
    "treats %s as an unknown identifier with a plain-object scope",
    (name) => {
      const scope: Record<string, number> = {};
      expect(evalError(name, scope).message).toMatch(/unknown identifier/i);
      expect(evalError(`1 + ${name}`, scope).message).toMatch(/unknown identifier/i);
    },
  );
});

describe("syntax errors", () => {
  // Red if the end-of-input position is not the source length.
  it.each([
    ["1 +", 3],
    ["(1 + 2", 6],
    ["", 0],
    ["max(1,", 6],
  ])("unexpected end of %j reports position %d", (source, position) => {
    expect(parseError(source).position).toBe(position);
  });

  // Red if the position points at the wrong token.
  it.each([
    ["1 + * 2", 4],
    ["1 2", 2],
    ["1 $ 2", 2],
    ["(1 + 2))", 7],
    ["1 + )", 4],
    ["max(1 2)", 6],
    ["2 ** 3", 3],
    ["1 = 2", 2],
  ])("%j reports position %d", (source, position) => {
    expect(parseError(source).position).toBe(position);
  });

  // Red if the error has no message.
  it("provides a non-empty message", () => {
    expect(parseError("1 +").message.length).toBeGreaterThan(0);
  });

  // Red if evaluateFormula throws or evaluates garbage on syntax errors.
  it("evaluateFormula surfaces syntax errors as results, not exceptions", () => {
    expect(evalError("1 + * 2").position).toBe(4);
  });

  // Red if malformed number literals are accepted.
  it.each(["1.2.3", "1e", "1e+"])("rejects malformed number %j", (source) => {
    expect(parseFormula(source).ok).toBe(false);
  });
});

describe("division by zero and non-finite results", () => {
  // Red if x / 0 yields Infinity.
  it("reports division by zero", () => {
    expect(evalError("1 / 0").message).toMatch(/division by zero/i);
    expect(evalError("1 / (2 - 2)").message).toMatch(/division by zero/i);
    expect(evalError("0 / 0").message).toMatch(/division by zero/i);
  });

  // Red if division by a scope value of zero is not detected.
  it("reports division by a zero-valued identifier", () => {
    expect(evalError("10 / w", { w: 0 }).message).toMatch(/division by zero/i);
  });

  // Red if NaN results leak out as ok.
  it("reports NaN results as non-finite", () => {
    expect(evalError("sqrt(-1)").message).toMatch(/finite/i);
  });

  // Red if Infinity results leak out as ok.
  it("reports Infinity results as non-finite", () => {
    expect(evalError("10 ^ 1000").message).toMatch(/finite/i);
    expect(evalError("1e308 * 10").message).toMatch(/finite/i);
  });

  // Red if a non-finite scope value is passed through unchecked.
  it("reports a non-finite scope value flowing into the result", () => {
    expect(evaluateFormula("x + 1", { x: Number.POSITIVE_INFINITY }).ok).toBe(false);
    expect(evaluateFormula("x", { x: Number.NaN }).ok).toBe(false);
  });
});

describe("resolveNumber", () => {
  // Red if plain numbers are routed through the parser or altered.
  it("passes plain numbers through", () => {
    expect(resolveNumber(3.25, {})).toEqual({ ok: true, value: 3.25 });
    expect(resolveNumber(0, {})).toEqual({ ok: true, value: 0 });
    expect(resolveNumber(-4, { x: 1 })).toEqual({ ok: true, value: -4 });
  });

  // Red if the leading "=" is not stripped or the scope not applied.
  it("evaluates strings with a leading =", () => {
    expect(resolveNumber("= width - 2 * armWidth", { width: 10, armWidth: 1.5 })).toEqual({
      ok: true,
      value: 7,
    });
    expect(resolveNumber("=1+2", {})).toEqual({ ok: true, value: 3 });
  });

  // Red if errors inside the formula are swallowed.
  it("propagates formula errors", () => {
    const result = resolveNumber("= missing + 1", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/unknown identifier/i);
  });

  // Red if a string without "=" is parsed as a formula or number.
  it("rejects a string without a leading =", () => {
    expect(resolveNumber("width - 2", { width: 10 }).ok).toBe(false);
    expect(resolveNumber("5", {}).ok).toBe(false);
    const result = resolveNumber("abc", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.message).toBe("string");
      expect(typeof result.error.position).toBe("number");
    }
  });

  // Red if prototype keys leak through resolveNumber as well.
  it("keeps prototype keys unknown when resolving", () => {
    const result = resolveNumber("= constructor", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/unknown identifier/i);
  });
});
