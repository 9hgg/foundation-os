import { TestBed } from '@angular/core/testing';
import { Component, ChangeDetectorRef } from '@angular/core';
import { Checkable } from './checkable.class';

// Create a minimal concrete subclass for testing
@Component({ template: '', standalone: true })
class TestCheckable extends Checkable {}

describe('Checkable', () => {
  let component: TestCheckable;
  let cdrMock: Partial<ChangeDetectorRef>;

  beforeEach(() => {
    cdrMock = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn(),
      detach: vi.fn(),
      reattach: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [TestCheckable],
    });

    const fixture = TestBed.createComponent(TestCheckable);
    component = fixture.componentInstance;
    // Replace CDR with mock
    (component as any)._cdr = cdrMock;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('starts with counter values at 0', () => {
    expect(component.checkAskedCount).toBe(0);
    expect(component.checkedCount).toBe(0);
    expect(component.detectChanges).toBe(0);
  });

  it('_markForCheck calls markForCheck on CDR', () => {
    component._markForCheck();
    expect(cdrMock.markForCheck).toHaveBeenCalled();
  });

  it('_detectChanges does not call detectChanges before ngOnInit', () => {
    component._detectChanges();
    expect(cdrMock.detectChanges).not.toHaveBeenCalled();
  });

  it('_detectChanges calls detectChanges after ngOnInit', () => {
    component.ngOnInit();
    component._detectChanges();
    expect(cdrMock.detectChanges).toHaveBeenCalled();
  });

  it('ngOnInit sets _componentLoaded to true', () => {
    expect(component._componentLoaded).toBe(false);
    component.ngOnInit();
    expect(component._componentLoaded).toBe(true);
  });

  it('_detach calls cdr.detach', () => {
    component._detach();
    expect(cdrMock.detach).toHaveBeenCalled();
  });

  it('_attach calls cdr.reattach', () => {
    component._attach();
    expect(cdrMock.reattach).toHaveBeenCalled();
  });

  it('checked() does not throw', () => {
    expect(() => component.checked()).not.toThrow();
  });

  it('_cdr_setDebug sets debug flag', () => {
    component._cdr_setDebug(true);
    expect(component.debug).toBe(true);
    component._cdr_setDebug(false);
    expect(component.debug).toBe(false);
  });

  it('_cdr_logThis does not throw', () => {
    expect(() => component._cdr_logThis('test', { x: 1 })).not.toThrow();
  });
});
