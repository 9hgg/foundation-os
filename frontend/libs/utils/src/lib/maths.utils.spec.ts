import { cumSum } from './maths.utils';

describe('cumSum', () => {
  it('single element', () => {
    expect(cumSum([5])).toEqual([5]);
  });

  it('two elements', () => {
    expect(cumSum([1, 2])).toEqual([1, 3]);
  });

  it('multiple positive numbers', () => {
    expect(cumSum([1, 2, 3, 4])).toEqual([1, 3, 6, 10]);
  });

  it('with negative numbers', () => {
    expect(cumSum([10, -3, 2])).toEqual([10, 7, 9]);
  });

  it('all zeros', () => {
    expect(cumSum([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('starts from first element value', () => {
    const result = cumSum([7, 1, 1]);
    expect(result[0]).toBe(7);
  });
});
