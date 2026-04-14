import { TestBed } from '@angular/core/testing';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { TabManagerService } from './tab-manager.service';

function makeRouter(url = '/home') {
  const events$ = new Subject<any>();
  return {
    url,
    events: events$,
    _events$: events$,
  };
}

describe('TabManagerService', () => {
  let service: TabManagerService;
  let routerMock: ReturnType<typeof makeRouter>;

  beforeEach(() => {
    routerMock = makeRouter();
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        TabManagerService,
        { provide: Router, useValue: routerMock },
      ],
    });
    service = TestBed.inject(TabManagerService);
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllTimers();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('tabId should be a non-empty UUID-like string', () => {
    expect(typeof service.tabId).toBe('string');
    expect(service.tabId.length).toBeGreaterThan(0);
  });

  it('tabs$$ initializes empty', () => {
    expect(service.tabs$$.value).toEqual([]);
  });

  it('updateTabs updates the tabs$$ subject', () => {
    service.updateTabs(['tab1', 'tab2']);
    expect(service.tabs$$.value).toEqual(['tab1', 'tab2']);
  });

  it('updateActiveTab sets active tab and route', () => {
    service.updateActiveTab('tab-abc', '/dashboard');
    expect(service.activeTab$$.value).toBe('tab-abc');
    expect(service.activeRoute$$.value).toBe('/dashboard');
  });

  it('setAsActiveTab marks this tab as active', () => {
    service.setAsActiveTab();
    expect(service.activeTab$$.value).toBe(service.tabId);
  });

  it('getActiveTabInfo returns current active tab and route', () => {
    service.updateActiveTab('tab-x', '/page');
    const info = service.getActiveTabInfo();
    expect(info.tabId).toBe('tab-x');
    expect(info.route).toBe('/page');
  });

  it('isRouteActiveInAnotherTab returns false when no other tab has the route', () => {
    // No other tabs in storage
    expect(service.isRouteActiveInAnotherTab('/some-route')).toBe(false);
  });

  it('hasMultipleTabsOnRoute returns false when no history', () => {
    expect(service.hasMultipleTabsOnRoute('/some-route')).toBe(false);
  });

  it('getTabsOnRoute returns empty array for unknown route', () => {
    expect(service.getTabsOnRoute('/unknown')).toEqual([]);
  });

  describe('spot management', () => {
    it('bookSpot successfully books a resource', () => {
      const result = service.bookSpot('interview-123');
      expect(result.success).toBe(true);
    });

    it('bookSpot returns the same spot for same resource on same tab', () => {
      service.bookSpot('resource-1');
      const result = service.bookSpot('resource-1');
      expect(result.success).toBe(true);
    });

    it('getMySpots returns booked spots for this tab', () => {
      service.bookSpot('res-1');
      service.bookSpot('res-2');
      const spots = service.getMySpots();
      expect(spots.length).toBeGreaterThanOrEqual(2);
      expect(spots.every((s) => s.tabId === service.tabId)).toBe(true);
    });

    it('releaseSpot removes the spot', () => {
      service.bookSpot('res-rel');
      service.releaseSpot('res-rel');
      const spots = service.getMySpots();
      expect(spots.find((s) => s.resource === 'res-rel')).toBeUndefined();
    });

    it('releaseAllSpots removes all spots for this tab', () => {
      service.bookSpot('res-a');
      service.bookSpot('res-b');
      service.releaseAllSpots();
      expect(service.getMySpots()).toEqual([]);
    });

    it('forceBookSpot books a spot replacing any existing', () => {
      service.bookSpot('res-force');
      service.forceBookSpot('res-force');
      const spots = service.getMySpots();
      expect(spots.filter((s) => s.resource === 'res-force')).toHaveLength(1);
    });

    it('isResourceBookedByAnotherTab returns null when not booked by another tab', () => {
      const result = service.isResourceBookedByAnotherTab('res-nobody');
      expect(result).toBeNull();
    });

    it('cleanupStaleSpots does not throw', () => {
      expect(() => service.cleanupStaleSpots()).not.toThrow();
    });
  });
});
