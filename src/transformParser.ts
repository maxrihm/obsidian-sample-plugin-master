/**
 * Parse the "transform" CSS string (e.g. "translate(200px, -1000px) scale(1)") 
 * to extract an (x, y) translation, even if negative or in matrix form.
 */
export function parseTransformToXY(transformString: string): { x: number; y: number } {
	let x = 0;
	let y = 0;

	if (!transformString || transformString === 'none') {
		return { x, y };
	}

	// Check for "matrix(a, b, c, d, e, f)"
	const matrixRegex = /^matrix\(\s*([\-\d.]+),\s*([\-\d.]+),\s*([\-\d.]+),\s*([\-\d.]+),\s*([\-\d.]+),\s*([\-\d.]+)\)/;
	let m = matrixRegex.exec(transformString);
	if (m) {
		x = parseFloat(m[5]);
		y = parseFloat(m[6]);
		return { x, y };
	}

	// Check for "matrix3d(...)" – x = index12, y = index13
	const matrix3dRegex = /^matrix3d\(\s*([\-\d.]+(?:,\s*[\-\d.]+){14})\)/;
	let m3 = matrix3dRegex.exec(transformString);
	if (m3) {
		const parts = m3[1].split(',').map(p => parseFloat(p.trim()));
		x = parts[12];
		y = parts[13];
		return { x, y };
	}

	// If there's a chained transform with translate(...) scale(...) rotate(...), 
	// we only care about translate(...)
	const allFunctionsRegex = /(\w+)\(([^)]+)\)/g;
	let funcMatch;
	while ((funcMatch = allFunctionsRegex.exec(transformString)) !== null) {
		const fn = funcMatch[1];
		const rawArgs = funcMatch[2];
		if (fn === 'translate') {
			const parts = rawArgs.split(',').map(p => p.trim());
			if (parts.length >= 2) {
				x = parseFloat(parts[0]);
				y = parseFloat(parts[1]);
			} else if (parts.length === 1) {
				x = parseFloat(parts[0]);
				y = 0;
			}
		}
	}

	return { x, y };
} 