export function cumSum(a: number[]) {
	const result = [a[0]];

	for (let i = 1; i < a.length; i++) {
		result[i] = result[i - 1] + a[i];
	}

	return result;
}
