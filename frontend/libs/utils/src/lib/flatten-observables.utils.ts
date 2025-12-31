import { Observable, combineLatest, isObservable, of } from 'rxjs';

function isPlainObject(obj: any): boolean {
	return obj && typeof obj === 'object' && !Array.isArray(obj);
}

function containsObservable(obj: any): boolean {
	if (isObservable(obj)) {
		return true;
	} else if (Array.isArray(obj)) {
		return obj.some(containsObservable);
	} else if (isPlainObject(obj)) {
		return Object.values(obj).some(containsObservable);
	}
	return false;
}

export function findObservables(
	obj: Record<string, any>,
	path = '',
	observables: Record<string, Observable<any>> = {},
	nonObservableValues: Record<string, any> = {}
): {
	observables: Record<string, Observable<any>>;
	nonObservableValues: Record<string, any>;
} {
	if (containsObservable(obj)) {
		if (Array.isArray(obj)) {
			obj.forEach((item, index) => {
				handleItem(item, `${path}[${index}]`, observables, nonObservableValues);
			});
		} else if (isPlainObject(obj)) {
			Object.keys(obj).forEach((key) => {
				handleItem(obj[key], path ? `${path}.${key}` : key, observables, nonObservableValues);
			});
		}
	} else {
		if (path) nonObservableValues[path] = obj;
		else nonObservableValues = obj;
	}
	return { observables, nonObservableValues };
}

function handleItem(item: any, currentPath: string, observables: Record<string, Observable<any>>, nonObservableValues: Record<string, any>) {
	if (isObservable(item)) {
		observables[currentPath] = item;
	} else if (containsObservable(item)) {
		findObservables(item, currentPath, observables, nonObservableValues);
	} else {
		nonObservableValues[currentPath] = item;
	}
}

function setPathValue(obj: Record<string, any>, path: string, value: any) {
	const keys = path
		.replace(/\[(\d+)\]/g, '.$1')
		.split('.')
		.filter((k) => k !== '');
	let current = obj;
	keys.forEach((key, index) => {
		if (index === keys.length - 1) {
			current[key] = value;
		} else {
			current[key] = current[key] || (isNaN(parseInt(keys[index + 1], 10)) ? {} : []);
			current = current[key];
		}
	});
}

export function reconstructObject(observables: Record<string, Observable<any>>, combinedValues: Record<string, any>, nonObservableValues: Record<string, any>): Record<string, any> {
	const observableValues = Object.keys(observables).reduce(
		(acc, key, index) => {
			acc[key] = combinedValues[index];
			return acc;
		},
		{} as Record<string, any>
	);

	const result: Record<string, any> = {};
	// Place observable values
	Object.keys(observableValues).forEach((path) => {
		setPathValue(result, path, observableValues[path]);
	});
	// Place non-observable values
	Object.keys(nonObservableValues).forEach((path) => {
		setPathValue(result, path, nonObservableValues[path]);
	});
	return result;
}
