import { Selector } from './selector.class';

describe('Selector', () => {
  let selector: Selector<string>;

  beforeEach(() => {
    selector = new Selector<string>();
  });

  it('starts with no selected items', () => {
    expect(selector.selectedItems).toEqual([]);
    expect(selector.numSelected).toBe(0);
  });

  it('selects an item', () => {
    selector.select('a');
    expect(selector.isSelected('a')).toBe(true);
    expect(selector.numSelected).toBe(1);
  });

  it('does not add duplicates when selecting the same item twice', () => {
    selector.select('a');
    selector.select('a');
    expect(selector.numSelected).toBe(1);
  });

  it('unselects an item', () => {
    selector.select('a');
    selector.unselect('a');
    expect(selector.isSelected('a')).toBe(false);
    expect(selector.numSelected).toBe(0);
  });

  it('toggles selection on and off', () => {
    selector.toggle('a');
    expect(selector.isSelected('a')).toBe(true);
    selector.toggle('a');
    expect(selector.isSelected('a')).toBe(false);
  });

  it('unselectAll clears selection', () => {
    selector.select('a');
    selector.select('b');
    selector.unselectAll();
    expect(selector.numSelected).toBe(0);
  });

  it('selectMultiple adds items not already selected', () => {
    selector.select('a');
    selector.selectMultiple(['a', 'b', 'c']);
    expect(selector.numSelected).toBe(3);
  });

  it('selectOnly replaces selection with a single item', () => {
    selector.select('a');
    selector.select('b');
    selector.selectOnly('c');
    expect(selector.selectedItems).toEqual(['c']);
  });

  it('allToggle selects all when nothing is selected', () => {
    selector.allToggle(['a', 'b', 'c']);
    expect(selector.numSelected).toBe(3);
  });

  it('allToggle unselects all when something is selected', () => {
    selector.select('a');
    selector.allToggle(['a', 'b', 'c']);
    expect(selector.numSelected).toBe(0);
  });

  it('allToggle filters out null values', () => {
    selector.allToggle(['a', null, 'b'] as any);
    expect(selector.numSelected).toBe(2);
  });

  it('valid is true when within min/max range', () => {
    const bounded = new Selector<string>(undefined, [], 1, 2);
    bounded.select('a');
    expect(bounded.valid).toBe(true);
  });

  it('valid is false when below min', () => {
    const bounded = new Selector<string>(undefined, [], 1, 2);
    expect(bounded.valid).toBe(false);
  });

  it('valid is false when above max', () => {
    const bounded = new Selector<string>(undefined, [], 0, 1);
    bounded.select('a');
    bounded.select('b'); // max=1, so max-1 mode applies
    // In max=1 mode, select replaces — so still 1
    expect(bounded.valid).toBe(true);
  });

  it('uses custom equality function', () => {
    const byId = new Selector<{ id: number; label: string }>((a, b) => a.id === b.id);
    byId.select({ id: 1, label: 'foo' });
    expect(byId.isSelected({ id: 1, label: 'different label' })).toBe(true);
  });

  it('emits selected items through selectedItems$', async () => {
    const { firstValueFrom, skip } = await import('rxjs');
    const next = firstValueFrom(selector.selectedItems$.pipe(skip(1)));
    selector.select('a');
    const items = await next;
    expect(items[0]).toBe('a');
  });

  it('initializes with provided items', () => {
    const preloaded = new Selector<string>(undefined, ['x', 'y']);
    expect(preloaded.numSelected).toBe(2);
  });
});
