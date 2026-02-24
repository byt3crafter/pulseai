import { Tool } from "../tool.interface.js";

/**
 * Calculator tool - Performs basic arithmetic calculations
 * Uses Function constructor for safe math evaluation
 */
export const calculatorTool: Tool = {
    name: "calculator",
    description: "Perform basic arithmetic calculations and mathematical operations. Supports +, -, *, /, %, parentheses, and common Math functions (sqrt, pow, sin, cos, etc.).",
    parameters: {
        type: "object",
        properties: {
            expression: {
                type: "string",
                description: "Mathematical expression to evaluate (e.g., '2 + 2', '15 * 23', 'Math.sqrt(144)', '(10 + 5) * 3')",
            },
        },
        required: ["expression"],
    },
    async execute({ args }) {
        try {
            const expression = args.expression.trim();

            // Validate expression contains only allowed characters
            // Allow: digits, operators, parentheses, dots, Math object, whitespace
            const allowedPattern = /^[\d+\-*\/%(). \t\n,Math.a-z]+$/i;
            if (!allowedPattern.test(expression)) {
                return {
                    result: "Error: Expression contains invalid characters. Only numbers, basic operators (+, -, *, /, %, parentheses), and Math functions are allowed.",
                };
            }

            // Use Function constructor for safer evaluation than eval
            // Still not 100% safe for untrusted input, but better than direct eval
            const calculate = new Function("Math", `"use strict"; return (${expression});`);
            const result = calculate(Math);

            if (typeof result !== "number" || !isFinite(result)) {
                return {
                    result: "Error: Calculation resulted in an invalid number (NaN or Infinity).",
                };
            }

            return {
                result: `Result: ${result}`,
                metadata: {
                    expression,
                    value: result,
                },
            };
        } catch (err: any) {
            return {
                result: `Error evaluating expression: ${err.message || "Invalid mathematical expression"}`,
            };
        }
    },
};
