import { v4 as uuidv4 } from 'uuid';

const DEBUG = false;

/** despite their ressemblance Token and very different from Nodes */
type Token = {
	type: string;
	value: string;
};

type StringNode = {
	type: 'string';
	value: string;
};

type NumberNode = {
	type: 'number';
	value: string;
};

type BinaryNode = {
	type: 'binary';
	left: ASTNode;
	right: ASTNode;
	operator: string;
};

type PropertyNode = {
	type: 'property';
	key: ASTNode;
	value: ASTNode;
};

type ObjectNode = {
	type: 'object';
	properties: PropertyNode[];
};

type FilterNode = {
	type: 'filter';
	input: ASTNode;
	properties: PropertyNode[];
};

type KeyNode = {
	type: 'key';
	value: string;
	// index?: ASTNode;
};

// for array indexing
type ArrayIndexingNode = {
	type: 'arrayIndexing';
	indexed: ASTNode;
	index: ArrayNode;
};

type GroupNode = {
	type: 'group';
	value: ASTNode;
};

type ArrayNode = {
	type: 'array';
	value: ASTNode[];
};

type PunctuationNode = {
	type: 'punctuation';
	value: string;
};

type NullNode = {
	type: 'null';
	value: null;
	details: string;
};

type SpecialNode = {
	type: 'special';
	value: string;
};

type ASTNode = NullNode | StringNode | NumberNode | BinaryNode | PropertyNode | ObjectNode | GroupNode | PunctuationNode | FilterNode | KeyNode | ArrayNode | ArrayIndexingNode | SpecialNode;

class Lexer {
	private input: string;
	private current: number;

	constructor(input: string) {
		this.input = input;
		this.current = 0;
	}

	nextToken(): Token | null {
		while (this.current < this.input.length) {
			let char = this.input[this.current];
			// ignore whitespaces
			if (/\s/.test(char)) {
				this.current++;
				continue;
			}

			// ignore comments
			if (char === '/' && this.input[this.current + 1] === '/') {
				while (char !== '\n') {
					char = this.input[++this.current];
				}
				continue;
			}

			// ignore line breaks
			if (char === '\n') {
				this.current++;
				continue;
			}

			// number before punctuations
			if (/\d/.test(char)) {
				let value = '';
				while (/\d/.test(char)) {
					value += char;
					char = this.input[++this.current];
				}
				return { type: 'number', value };
			}

			if (['(', ')'].includes(char)) {
				return { type: 'group', value: this.input[this.current++] };
			}

			if (['{', '}'].includes(char)) {
				return { type: 'object', value: this.input[this.current++] };
			}
			if (['<', '>'].includes(char)) {
				return { type: 'filter', value: this.input[this.current++] };
			}

			if (['[', ']'].includes(char)) {
				return { type: 'array', value: this.input[this.current++] };
			}

			if ([',', ':'].includes(char)) {
				return { type: 'punctuation', value: this.input[this.current++] };
			}

			if (['+', '-', '*', '/', '%', '.', '@'].includes(char)) {
				return { type: 'operator', value: this.input[this.current++] };
			}

			// catch $ and following letters to create a special token
			if (char === '$') {
				let value = '';
				char = this.input[++this.current];
				while (/[a-zA-Z]/.test(char)) {
					value += char;
					char = this.input[++this.current];
					if (!char) {
						break;
					}
				}
				return { type: 'special', value };
			}

			// from " to "
			if (char === '"') {
				let value = '';
				char = this.input[++this.current];
				while (char !== '"') {
					value += char;
					char = this.input[++this.current];
				}
				this.current++;
				return { type: 'string', value };
			}

			// from letter to not (letter | underscore)
			if (/[a-zA-Z]/.test(char)) {
				let value = '';
				while (/[a-zA-Z0-9_\-.$]/.test(char)) {
					value += char;
					char = this.input[++this.current];
					if (!char) {
						break;
					}
				}
				return { type: 'key', value };
			}

			throw new Error(`Unknown character: ${char}`);
		}
		return null;
	}
}

function checkToken(token: Token | undefined, type: string, value: string | null = null): boolean {
	if (!token) {
		return false;
	}

	if (token.type !== type) {
		return false;
	}
	if (value !== null && token.value !== value) {
		return false;
	}

	return true;
}

const NULL_NODE: NullNode = { type: 'null', value: null, details: 'nothing' };

// export function createRecursiveProxy(
// 	obj: any,
// 	onGet?: (path: string) => void,
// 	onSet?: (path: string, value: any) => void,
// 	path: string = ''
// ): any {
// 	if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
// 		const handler: ProxyHandler<any> = {};

// 		if (onGet) {
// 			handler.get = function (target, property, receiver) {
// 				if (typeof property !== 'symbol') {
// 					// Avoid Symbol properties
// 					const value = Reflect.get(target, property, receiver);
// 					const formattedProperty =
// 						Array.isArray(target) && !isNaN(property as any) ? `[${String(property)}]` : `.${String(property)}`;
// 					const newPath = path + formattedProperty;

// 					if (value && typeof value === 'object') {
// 						return createRecursiveProxy(value, onGet, onSet, newPath);
// 					}

// 					onGet(newPath.startsWith('.') ? newPath.slice(1) : newPath);
// 					return value;
// 				}
// 			};
// 		}

// 		if (onSet) {
// 			handler.set = function (target, property, value, receiver) {
// 				if (typeof property !== 'symbol') {
// 					const formattedProperty =
// 						Array.isArray(target) && !isNaN(property as any) ? `[${String(property)}]` : `.${String(property)}`;
// 					const newPath = path + formattedProperty;

// 					onSet(newPath.startsWith('.') ? newPath.slice(1) : newPath, value);
// 					return Reflect.set(target, property, value, receiver);
// 				}

// 				return false;
// 			};
// 		}

// 		return new Proxy(obj, handler);
// 	}
// 	return obj;
// }

class Parser {
	private tokens: Token[];
	private current: number;

	constructor(tokens: Token[]) {
		this.tokens = tokens;
		this.current = 0;
	}

	public consume(): ASTNode {
		if (this.tokens.length === 0) {
			return NULL_NODE;
		}
		const nodes: ASTNode[] = [];
		while (this.current < this.tokens.length) {
			const node = this.consumeExpression();
			nodes.push(node);
		}
		if (nodes.length === 1) {
			return nodes[0];
		}
		const arrayNode: ArrayNode = {
			type: 'array',
			value: nodes.filter((node) => {
				if (Array.isArray(node)) {
					return true;
				}
				return node.type !== 'punctuation';
			}),
		};
		return arrayNode;
	}

	private consumeExpression(): ASTNode {
		let token = this.currentToken;
		if (token.type == 'number') {
			return this.checkOperation(this._consumeNumber());
		} else if (token.type == 'string') {
			return this.checkOperation(this._consumeString());
		} else if (token.type == 'group') {
			return this.checkOperation(this._consumeGroup());
		} else if (token.type == 'object') {
			return this._consumeObject();
		} else if (token.type == 'array') {
			return this.checkOperation(this._consumeArray());
		} else if (token.type == 'punctuation') {
			return this._consumePunctuation();
		} else if (token.type == 'key') {
			return this.checkOperation(this._consumeKey());
		} else if (token.type == 'special') {
			return this.checkOperation(this._consumeSpecial());
		} else {
			throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
		}
	}

	checkOperation(a: ASTNode): ASTNode {
		if (DEBUG) console.log('checkOperation', a);

		let result: ASTNode;
		// check if any operation is done on the node next to it
		if (checkToken(this.currentToken, 'operator')) {
			if (DEBUG) console.log('checkOperation', 'operator', this.currentToken, this.nextToken);

			// dot accessor
			const operator = this._consumeWithCheck('operator');
			const b = this.consumeExpression();
			const binaryNode: BinaryNode = { type: 'binary', left: a, right: b, operator };
			if (DEBUG) console.log('BINARY', binaryNode);
			result = binaryNode;
		} else if (checkToken(this.currentToken, 'filter', '<')) {
			if (DEBUG) console.log('checkOperation', 'filter', this.currentToken, this.nextToken);
			// < > accessor => filter
			const filter = this._consumeFilter();
			const filterNode: FilterNode = { type: 'filter', input: a, properties: filter };
			if (DEBUG) console.log('FILTER', filterNode);
			result = filterNode;
		} else if (checkToken(this.currentToken, 'array', '[')) {
			if (DEBUG) console.log('checkOperation', 'array', this.currentToken, this.nextToken);
			const index = this._consumeArray();

			// // we should only have one node in the array
			// if (indexingArray.value.length !== 1) {
			// 	throw new Error('Array indexing should only have one node');
			// }
			// const keyIndexNode = indexingArray.value[0];
			const keyNode: ArrayIndexingNode = { type: 'arrayIndexing', indexed: a, index };
			result = keyNode;
		} else {
			if (DEBUG) console.log('checkOperation', 'no operation', this.currentToken, this.nextToken);
			return a;
		}

		return this.checkOperation(result);
	}

	private _consumeKey(): KeyNode {
		const value = this._consumeWithCheck('key');
		const keyNode: KeyNode = { type: 'key', value };
		if (DEBUG) console.log('KEY (direct)', keyNode);
		return keyNode;
	}

	private _consumeSpecial(): SpecialNode {
		const value = this._consumeWithCheck('special');
		const specialNode: SpecialNode = { type: 'special', value };
		if (DEBUG) console.log('SPECIAL', specialNode);
		return specialNode;
	}

	private _consumeGroup(): ASTNode {
		this._consumeWithCheck('group', '(');
		const nodes: ASTNode[] = [];
		while (this.current < this.tokens.length) {
			if (checkToken(this.currentToken, 'group', ')')) {
				break;
			}
			const node = this.consumeExpression();
			nodes.push(node);
		}
		this._consumeWithCheck('group', ')');

		if (nodes.length === 1) {
			if (DEBUG) console.log('GROUP (single)', nodes[0]);
			return nodes[0];
		}

		// // if we have more than one node, we return an array but we need to remove the commas
		const arrayNode: ArrayNode = {
			type: 'array',
			value: nodes.filter((node) => {
				if (Array.isArray(node)) {
					return true;
				}
				return node.type !== 'punctuation';
			}),
		};
		if (DEBUG) console.log('GROUP (array)', arrayNode);
		return arrayNode;
	}

	private _consumeArray(): ArrayNode {
		this._consumeWithCheck('array', '[');
		const nodes: ASTNode[] = [];
		while (this.current < this.tokens.length) {
			if (checkToken(this.currentToken, 'array', ']')) {
				break;
			}
			const node = this.consumeExpression();
			nodes.push(node);
		}
		this._consumeWithCheck('array', ']');

		const arrayNode: ArrayNode = {
			type: 'array',
			value: nodes.filter((node) => {
				return node.type !== 'punctuation';
			}),
		};
		if (DEBUG) console.log('ARRAY', arrayNode);
		return arrayNode;
	}

	private _consumeObject(): ObjectNode {
		this._consumeWithCheck('object', '{');
		const properties: PropertyNode[] = [];
		while (this.current < this.tokens.length) {
			if (checkToken(this.currentToken, 'object', '}')) {
				break;
			}
			const property = this._consumeProperty();
			properties.push(property);
			// handle comma
			if (checkToken(this.currentToken, 'punctuation', ',')) {
				this._consumeWithCheck('punctuation', ',');
			}
		}
		this._consumeWithCheck('object', '}');

		const objectNode: ObjectNode = {
			type: 'object',
			properties,
		};
		if (DEBUG) console.log('OBJECT', objectNode);
		return objectNode;
	}

	private _consumeFilter(): PropertyNode[] {
		this._consumeWithCheck('filter', '<');
		const properties: PropertyNode[] = [];
		while (this.current < this.tokens.length) {
			if (checkToken(this.currentToken, 'filter', '>')) {
				break;
			}
			const property = this._consumeProperty();
			properties.push(property);
			// handle comma
			if (checkToken(this.currentToken, 'punctuation', ',')) {
				this._consumeWithCheck('punctuation', ',');
			}
		}
		this._consumeWithCheck('filter', '>');
		return properties;
	}

	private _consumeProperty(): PropertyNode {
		const key = this.consumeExpression();
		this._consumeWithCheck('punctuation', ':');
		const value = this.consumeExpression();
		const propertyNode: PropertyNode = { type: 'property', key, value };
		if (DEBUG) console.log('PROPERTY', propertyNode);
		return propertyNode;
	}

	private _consumeNumber(): NumberNode {
		const value = this._consumeWithCheck('number');
		if (DEBUG) console.log('NUMBER', value);
		return { type: 'number', value };
	}

	private _consumeString(): StringNode {
		const value = this._consumeWithCheck('string');
		if (DEBUG) console.log('STRING', value);
		return { type: 'string', value };
	}

	private _consumePunctuation(): PunctuationNode {
		const value = this._consumeWithCheck('punctuation');
		if (DEBUG) console.log('PUNCTUATION', value);
		return { type: 'punctuation', value };
	}

	private _consumeWithCheck(type: string, value: string | null = null) {
		const token = this._consumeNextToken();
		if (DEBUG) console.log('_consumeWithCheck', type, value, token);

		if (checkToken(token, type, value)) {
			return token.value;
		} else {
			throw new Error(`Expected ${type} "${value}", found ${this.tokens[this.current]?.type} "${this.tokens[this.current]?.value}"`);
		}
	}

	get currentToken() {
		return this.tokens[this.current];
	}

	get nextToken(): Token | undefined {
		return this.tokens[this.current + 1];
	}

	private _consumeNextToken() {
		return this.tokens[this.current++];
	}
}

function accessNestedProperty(obj: Object | any[], path: string | number, options: any): any {
	if (DEBUG) console.log('asking accessNestedProperty', path, obj);

	if (Array.isArray(obj) && typeof path === 'number') {
		return obj[path];
	} else if (Array.isArray(obj) && typeof path === 'string') {
		const index = parseInt(path);
		return obj[index];
	} else if (typeof obj === 'object' && typeof path === 'string') {
		const result = path.split('.').reduce((o, key) => {
			if (DEBUG) console.log('REDUCE accessNestedProperty', key, { o, type: typeof o });

			// if object or proxy
			if (o && typeof o === 'object') {
				if (DEBUG) console.log('REDUCE accessNestedProperty', key, { o, type: typeof o, 'o[key]': o[key] });

				return o[key];
			}
			if (DEBUG) console.log('REDUCE accessNestedProperty', 'NULLASH', key, { o, type: typeof o });
			return null;
		}, obj as any);

		let directResult = result;
		try {
			directResult = (obj as any)[path];
		} catch (e) {}

		if (DEBUG) console.log('accessNestedProperty with directResult ' + path + ' -> ', result, directResult);
		return result || directResult;
	}
	return null;
}

function evaluate(ast: ASTNode, context: any, options: any): any {
	if (DEBUG) console.log('CALLING EVALUATE OVER', ast);

	switch (ast.type) {
		case 'number':
			return parseFloat(ast.value);
		case 'string':
			return ast.value;
		case 'punctuation':
			return ast.value;
		case 'null':
			return null;
		case 'array':
			return ast.value.map((node) => evaluate(node, context, options));
		case 'group':
			return evaluate(ast.value, context, options);
		case 'object':
			const object: Record<string, any> = {};
			ast.properties.forEach((property) => {
				const value = evaluate(property.value, context, options);
				const key = evaluate(property.key, context, options);
				if (!(typeof key === 'string' && key.length > 0)) {
					throw new Error(`Cannot use null as key in object`);
				}
				object[key] = value;
			});
			return object;
		case 'key':
			if (DEBUG) console.log('EVALUATE KEY', ast);
			const valueAtKey = accessNestedProperty(context, ast.value, options);
			if (DEBUG) console.log('EVALUATE KEY value at key "' + ast.value + '":', valueAtKey);
			return valueAtKey;
		case 'filter':
			if (DEBUG) console.log('EVALUATE FILTER', ast);
			const DATA_LIST = evaluate(ast.input, context, options);
			if (DEBUG) console.log('EVALUATE FILTER data to filter:', DATA_LIST);

			if (!Array.isArray(DATA_LIST)) {
				console.error('DATA_LIST', DATA_LIST);
				throw new Error('Cannot filter over non array');
			}
			const filteredData = DATA_LIST.filter((DATA_ITEM: any, INDEX) => {
				let keep = true;
				ast.properties.forEach((property) => {
					// the property is something like this key:value
					// the key is evaluated against the DATA_ITEM
					const key = evaluate(property.key, DATA_ITEM, options);

					// the value is evaluated against the general context + DATA_ITEM, INDEX and DATA_LIST
					// we add the item to the local context with a prefix to make it accessible anyway
					const value = evaluate(property.value, { ...context, DATA_ITEM, INDEX, DATA_LIST }, options);
					if (!(typeof key === 'string' && key.length > 0)) {
						throw new Error(`Cannot use null as key in object`);
					}
					if (DATA_ITEM[key] !== value) {
						if (DEBUG)
							console.log('EVALUATE FILTER data item', DATA_ITEM, 'does not match', property, {
								key,
								'DATA_ITEM[key]': DATA_ITEM[key],
								value,
							});
						keep = false;
					}
				});
				return keep;
			});

			if (DEBUG) console.log('EVALUATE FILTER filtered data:', filteredData);
			return filteredData;

		case 'arrayIndexing':
			if (DEBUG) console.log('EVALUTE ARRAYINDEXING', ast);
			if (ast.index.value.length == 1) {
				// throw new Error('Array indexing should only have one node');
				const indexValue = ast.index.value[0];
				if (DEBUG) console.log('Only one value in index:', indexValue);
				const accessedData = accessNestedProperty(evaluate(ast.indexed, context, options), evaluate(indexValue, context, options), options);
				if (DEBUG) console.log('Accessed data:', accessedData);
				return accessedData;
			} else {
				if (DEBUG) console.error('Too many values for indexing at the moment:', ast.index.value);
				throw new Error('DONT KNOW HOW TO INDEX WITH MULTIPLE VALUE:');
			}
		case 'binary':
			let left;
			let right;

			if (DEBUG) console.log('EVALUATE BINARY', ast, { left, right });
			switch (ast.operator) {
				case '+':
					left = evaluate(ast.left, context, options);
					right = evaluate(ast.right, context, options);
					return left + right;
				case '-':
					left = evaluate(ast.left, context, options);
					right = evaluate(ast.right, context, options);
					return left - right;
				case '*':
					left = evaluate(ast.left, context, options);
					right = evaluate(ast.right, context, options);
					return left * right;
				case '/':
					left = evaluate(ast.left, context, options);
					right = evaluate(ast.right, context, options);
					return left / right;
				case '%':
					left = evaluate(ast.left, context, options);
					right = evaluate(ast.right, context, options);
					return left % right;
				case '.':
					left = evaluate(ast.left, context, options);
					right = evaluate(ast.right, context, options);
					return accessNestedProperty(left, right, options);
				case '@':
					if (DEBUG) console.log('EVALUATE BINARY @', ast, ast.right, ast.left, context);
					const newContext = evaluate(ast.right, context, options);
					if (DEBUG) console.log('EVALUATE BINARY @ new context', newContext);

					return evaluate(ast.left, newContext, options);
				default:
					throw new Error(`Unknown binary operator: ${ast.operator}`);
			}
		case 'special':
			if (DEBUG) console.log('EVALUATE SPECIAL', ast);
			switch (ast.value) {
				case 'uuid':
					return uuidv4();
				default:
					throw new Error(`Unknown special value: ${ast.value}`);
			}
		default:
			throw new Error(`Unknown evaluation node type: ${ast.type}`);
	}
}

export function parseAStringOverADict(string: string, dict: any, options?: any) {
	const lexer = new Lexer(string);
	const tokens: Token[] = [];
	let token = lexer.nextToken();
	// if (DEBUG) console.log({ token });

	while (token) {
		tokens.push(token);
		token = lexer.nextToken();
	}
	const parser = new Parser(tokens);
	// if (DEBUG) console.log({ tokens, parser });

	const ast = parser.consume();
	// if (DEBUG) console.log({ ast });

	const evaluation = evaluate(ast, dict, options);
	// if (DEBUG) console.log({ evaluation });
	return evaluation;
}

const inputs: [string, any][] = [
	['"aaaa","bbbb"', ['aaaa', 'bbbb']],
	[
		'(((("aaaa","bbbb"),("cccc","dddd"))))',
		[
			['aaaa', 'bbbb'],
			['cccc', 'dddd'],
		],
	],
	['a.b.c', 3],
	['a', { b: { c: 3 } }],
	['a.b.c.d', null],
	['(d[2],d[((((2))))])', ['xyz', 'xyz']],
	['((source[1]).id,d[((((2))))])', [null, 'xyz']], // id is not in string
	['(d[source[1]."id"])', 2],
	['d[source[1]."id"]', 2],
	['((d[source[1]."id"]),d[((((2))))])', [2, 'xyz']],
	['123a.b.c', [123, 3]],
	['(source[1])."id",(source[1])."name"', [1, 'Item 2']],
	['1+2', 3],
	['(1+2)*3', 9],
	['1+(2*3)+4', 11],
	['2*(10%7)', 6],
	['"aaaa"+"bbbb"', 'aaaabbbb'],
	['"aaaa"*5', NaN], //=> NaN
	['{"a":2}', { a: 2 }],
	['{d[2]:source[1]."name"}', { xyz: 'Item 2' }],
	['{d[2]:source[1].key.To.Use}', { xyz: 'Item 2' }],
	[
		'{"x": (source, {"name":"Item 2"}), "sum": 2*(a.b.c + d[1]), "message": e, "a":( 2 * a.b.c) + d[1]}',
		{
			x: [
				[
					{ id: 0, name: 'Item 1' },
					{ id: 1, name: 'Item 2' },
					{ id: 2, name: 'Item 3' },
				],
				{ name: 'Item 2' },
			],
			sum: 10,
			message: 'hello',
			a: 8,
		},
	],
	['{"value":b@a}', { value: { c: 3 } }],
	['[]', []],
	// ['{"someKey":[{"id":$uuid}], "otherKey":b@a}', { someKey: [{ id: 'b@a' }], otherKey: 'hello' }],
	// ['{"someKey":[{"id":$uuid}], $uuid:b@a}', { someKey: [{ id: 'b@a' }], 'b@a': 'hello' }],
	// ['{"myList":[{$uuid:b@a,"name":"myobj"}]}', { myList: [{ 'b@a': 'hello', name: 'myobj' }] }],
	['source<"name":"Item 3">', [{ id: 2, name: 'Item 3' }]],
];

// Example usage:
const nestedDict = {
	key: { To: { Use: 'name' } },
	a: { b: { c: 3 } },
	d: [1, 2, 'xyz'],
	e: 'hello',
	f: [{ g: 'world' }],
	source: [
		{ id: 0, name: 'Item 1' },
		{ id: 1, name: 'Item 2' },
		{ id: 2, name: 'Item 3' },
	],
	targetId: 2,
};

// for (const input of inputs) {
// 	if (DEBUG) console.log('%c------------------', 'color: red', input);
// 	const [theString, expected] = input;
// 	const result = parseAStringOverADict(theString, nestedDict);
// 	if (DEBUG) console.log(theString, '=>', isEqual(result, expected) ? 'OK' : 'KO', result, expected);
// 	if (!isEqual(result, expected)) {
// 		if (DEBUG) console.error('ERROR', theString, '=>', result, expected);
// 		break;
// 	}
// }

// if (DEBUG) console.log('%c------------------', 'color: red');
// if (DEBUG) console.log('%c------------------', 'color: red');
// // raise to stop
// throw new Error('stop');
