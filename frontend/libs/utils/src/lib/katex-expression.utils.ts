function replaceSqrtCalls(expression: string): string {
	let nextExpression = expression;
	let sqrtIndex = nextExpression.indexOf('sqrt(');
	while (sqrtIndex !== -1) {
		const openParenthesisIndex = sqrtIndex + 4;
		const closeParenthesisIndex = findMatchingParenthesisIndex(nextExpression, openParenthesisIndex);
		if (closeParenthesisIndex === -1) break;
		const innerExpression = nextExpression.slice(openParenthesisIndex + 1, closeParenthesisIndex);
		nextExpression = `${nextExpression.slice(0, sqrtIndex)}\\sqrt{${replaceSqrtCalls(innerExpression)}}${nextExpression.slice(closeParenthesisIndex + 1)}`;
		sqrtIndex = nextExpression.indexOf('sqrt(');
	}
	return nextExpression;
}

function findMatchingParenthesisIndex(expression: string, openParenthesisIndex: number): number {
	let depth = 0;
	for (let index = openParenthesisIndex; index < expression.length; index += 1) {
		if (expression[index] === '(') depth += 1;
		if (expression[index] === ')') {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	return -1;
}

export function convertExpressionToLatex(expression: string): string {
	let latex = expression.trim();
	if (!latex) return '';
	latex = replaceSqrtCalls(latex);
	latex = latex.replace(/\babs\(([^()]+)\)/g, '\\left|$1\\right|');
	latex = latex.replace(/\b([A-Za-z]+)_([A-Za-z0-9]+)\b/g, '$1_{$2}');
	latex = latex.replace(/\^([0-9]+)/g, '^{$1}');
	latex = latex.replace(/([0-9]+(?:\.[0-9]+)?)e([+-]?[0-9]+)/gi, (_match, mantissa, exponent) => `${mantissa} \\times 10^{${exponent}}`);
	latex = latex.replace(/\*/g, ' \\cdot ');
	return latex;
}
