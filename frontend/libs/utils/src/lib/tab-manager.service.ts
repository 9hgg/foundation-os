import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { BehaviorSubject, fromEvent } from 'rxjs';
import { filter, tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

const TAB_MANAGER_STORAGE_KEY = '__tab';
const TAB_SPOTS_STORAGE_KEY = '__tab_spots';
const TAB_HEARTBEAT_STORAGE_KEY = '__tab_heartbeat';
const debug = false;

// Timing constants
const HEARTBEAT_INTERVAL = 3000; // 3 seconds - reasonable for active tab tracking
const STALE_TAB_THRESHOLD = 10000; // 10 seconds - tabs older than this are considered inactive
const SPOT_STALE_THRESHOLD = 15000; // 15 seconds - spots older than this are cleaned up
const PAGE_REFRESH_GRACE_PERIOD = 5000; // 5 seconds grace period for page refreshes

interface TabHistory {
	activeTabId: string;
	route: string;
	timestamp: number;
}

interface TabSpot {
	spotId: string;
	tabId: string;
	resource: string; // e.g., interview ID, entity ID, etc.
	timestamp: number;
	lastRefreshTime?: number; // Track when tab was last refreshed for grace period
}

interface TabHeartbeat {
	tabId: string;
	timestamp: number;
	route: string;
}

@Injectable({
	providedIn: 'root',
})
export class TabManagerService {
	tabs$$: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);
	activeTab$$: BehaviorSubject<string | undefined> = new BehaviorSubject<string | undefined>(undefined);
	activeRoute$$: BehaviorSubject<string | undefined> = new BehaviorSubject<string | undefined>(undefined);

	readonly tabId: string;
	private currentRoute: string = '';
	private heartbeatInterval: any;
	private tabStartTime: number = Date.now();

	constructor(private router: Router) {
		this.tabId = uuidv4();
		this.currentRoute = this.router.url;

		if (debug)
			console.log('%c[TabManager](constructor)', 'color:green', {
				tabId: this.tabId.substring(0, 8),
				route: this.currentRoute,
			});

		// Start heartbeat mechanism
		this.startHeartbeat();

		// Track route changes
		this.router.events
			.pipe(
				filter((event) => event instanceof NavigationEnd),
				tap((event: NavigationEnd) => {
					this.currentRoute = event.urlAfterRedirects;
					this.setAsActiveTab(); // Update storage with new route
					if (debug) console.log('%c[TabManager](route changed)', 'color:green', this.tabId.substring(0, 8), this.currentRoute);
				})
			)
			.subscribe();

		// Initialize from current storage state
		this.initializeFromStorage();

		// Clean up stale spots on startup
		this.cleanupStaleSpots();

		// Listen to storage changes from other tabs
		fromEvent<StorageEvent>(window, 'storage')
			.pipe(
				filter((evt) => evt.key === TAB_MANAGER_STORAGE_KEY),
				tap((evt) => this.handleStorageChange(evt))
			)
			.subscribe();

		// Listen to visibility changes to update active tab when user switches tabs
		fromEvent(document, 'visibilitychange')
			.pipe(
				tap(() => {
					if (!document.hidden) {
						// Tab became visible, set it as active
						if (debug) console.log('%c[TabManager](visibilitychange)', 'color:green', this.tabId.substring(0, 8), 'Tab became visible, setting as active');
						this.setAsActiveTab();
					} else {
						if (debug) console.log('%c[TabManager](visibilitychange)', 'color:green', this.tabId.substring(0, 8), 'Tab became hidden');
					}
				})
			)
			.subscribe();
	}

	updateTabs(tabs: string[]) {
		this.tabs$$.next(tabs);
	}

	updateActiveTab(tabId: string, route?: string) {
		this.activeTab$$.next(tabId);
		if (route !== undefined) {
			this.activeRoute$$.next(route);
		}
	}

	private initializeFromStorage() {
		try {
			const tabHistory = this.getTabHistory();
			if (tabHistory.length > 0) {
				const mostRecentTab = tabHistory[0];
				if (mostRecentTab.activeTabId === this.tabId) {
					if (debug) console.log('%c[TabManager](initializeFromStorage)', 'color:green', this.tabId.substring(0, 8), 'This tab is the active tab.');
					this.updateActiveTab(this.tabId, mostRecentTab.route);
				} else {
					if (debug) console.log('%c[TabManager](initializeFromStorage)', 'color:green', this.tabId.substring(0, 8), 'This tab is not the active tab (activeTabId:', mostRecentTab.activeTabId.substring(0, 8), 'route:', mostRecentTab.route, ')');
					this.updateActiveTab(mostRecentTab.activeTabId, mostRecentTab.route);
				}
			}
		} catch (error) {
			if (debug) console.error('%c[TabManager](initializeFromStorage)', 'color:green', this.tabId.substring(0, 8), 'Failed to initialize from storage:', error);
		}
	}

	private handleStorageChange(evt: StorageEvent) {
		if (!evt.newValue) return;

		try {
			const tabHistory: TabHistory[] = JSON.parse(evt.newValue);
			if (tabHistory.length > 0) {
				const mostRecentTab = tabHistory[0];
				if (debug) console.log('%c[TabManager](handleStorageChange)', 'color:green', this.tabId.substring(0, 8), 'Storage changed, new active tab:', mostRecentTab.activeTabId.substring(0, 8), 'route:', mostRecentTab.route);
				this.updateActiveTab(mostRecentTab.activeTabId, mostRecentTab.route);
			}
		} catch (error) {
			if (debug) console.error('%c[TabManager](handleStorageChange)', 'color:green', this.tabId.substring(0, 8), 'Failed to parse storage change:', error);
		}
	}

	private getTabHistory(): TabHistory[] {
		try {
			const stored = window.localStorage.getItem(TAB_MANAGER_STORAGE_KEY);
			return stored ? JSON.parse(stored) : [];
		} catch (error) {
			if (debug) console.error('%c[TabManager](getTabHistory)', 'color:green', this.tabId.substring(0, 8), 'Failed to get tab history:', error);
			return [];
		}
	}

	setAsActiveTab() {
		if (document.hidden) return;

		if (debug)
			console.log('%c[TabManager](setAsActiveTab)', 'color:green', {
				tabId: this.tabId.substring(0, 8),
				route: this.currentRoute,
			});

		try {
			const tabHistory = this.getTabHistory();
			const newHistory: TabHistory[] = [{ activeTabId: this.tabId, route: this.currentRoute, timestamp: Date.now() }, ...tabHistory.filter((entry) => entry.activeTabId !== this.tabId).slice(0, 4)];

			window.localStorage.setItem(TAB_MANAGER_STORAGE_KEY, JSON.stringify(newHistory));
			this.updateActiveTab(this.tabId, this.currentRoute);
		} catch (error) {
			if (debug) console.error('%c[TabManager](setAsActiveTab)', 'color:green', this.tabId.substring(0, 8), 'Failed to set as active tab:', error);
		}
	}

	// Utility methods for route-based conflict detection

	/**
	 * Check if another tab is currently active on the same route
	 */
	isRouteActiveInAnotherTab(route?: string): boolean {
		const checkRoute = route || this.currentRoute;
		const activeTab = this.activeTab$$.value;
		const activeRoute = this.activeRoute$$.value;

		// If this tab is the active tab, no conflict
		if (activeTab === this.tabId) {
			return false;
		}

		// Check if another tab is active on the same route
		return activeRoute === checkRoute;
	}

	/**
	 * Get all tabs that are currently on a specific route
	 */
	getTabsOnRoute(route?: string): TabHistory[] {
		const checkRoute = route || this.currentRoute;
		const tabHistory = this.getTabHistory();

		return tabHistory.filter((entry) => entry.route === checkRoute);
	}

	/**
	 * Check if multiple tabs are on the same route (including this tab)
	 */
	hasMultipleTabsOnRoute(route?: string): boolean {
		return this.getTabsOnRoute(route).length > 1;
	}

	/**
	 * Get the active tab info including route
	 */
	getActiveTabInfo(): { tabId: string | undefined; route: string | undefined } {
		return {
			tabId: this.activeTab$$.value,
			route: this.activeRoute$$.value,
		};
	}

	// Parking spot management for resource conflicts

	/**
	 * Get all current spots from storage
	 */
	private getTabSpots(): TabSpot[] {
		try {
			const stored = window.localStorage.getItem(TAB_SPOTS_STORAGE_KEY);
			return stored ? JSON.parse(stored) : [];
		} catch (error) {
			if (debug) console.error('%c[TabManager](getTabSpots)', 'color:green', this.tabId.substring(0, 8), 'Failed to get tab spots:', error);
			return [];
		}
	}

	/**
	 * Save spots to storage
	 */
	private saveTabSpots(spots: TabSpot[]): void {
		try {
			window.localStorage.setItem(TAB_SPOTS_STORAGE_KEY, JSON.stringify(spots));
		} catch (error) {
			if (debug) console.error('%c[TabManager](saveTabSpots)', 'color:green', this.tabId.substring(0, 8), 'Failed to save tab spots:', error);
		}
	}

	/**
	 * Book a parking spot for a resource (e.g., interview ID)
	 * Returns true if successfully booked, false if spot is taken
	 */
	bookSpot(resource: string, spotId?: string): { success: boolean; existingSpot?: TabSpot } {
		const spots = this.getTabSpots();
		const existingSpot = spots.find((spot) => spot.resource === resource);

		if (existingSpot && existingSpot.tabId !== this.tabId) {
			// Check if the existing spot is from an active tab
			if (this.isTabActive(existingSpot.tabId)) {
				if (debug) console.log('%c[TabManager](bookSpot)', 'color:green', this.tabId.substring(0, 8), 'Spot already taken for resource:', resource, 'by active tab:', existingSpot.tabId.substring(0, 8));
				return { success: false, existingSpot };
			} else {
				// The existing spot is from an inactive tab, check grace period
				const now = Date.now();
				const spotAge = now - existingSpot.timestamp;
				const isWithinGracePeriod = existingSpot.lastRefreshTime && (now - existingSpot.lastRefreshTime) < PAGE_REFRESH_GRACE_PERIOD;
				
				if (isWithinGracePeriod || spotAge < SPOT_STALE_THRESHOLD) {
					if (debug) console.log('%c[TabManager](bookSpot)', 'color:green', this.tabId.substring(0, 8), 'Spot taken by inactive tab within grace period for resource:', resource);
					return { success: false, existingSpot };
				} else {
					// Spot is stale, we can take it over
					if (debug) console.log('%c[TabManager](bookSpot)', 'color:green', this.tabId.substring(0, 8), 'Taking over stale spot for resource:', resource);
				}
			}
		}

		// Remove any existing spots for this tab and resource
		const filteredSpots = spots.filter((spot) => !(spot.tabId === this.tabId && spot.resource === resource));

		// Add new spot with refresh tracking
		const newSpot: TabSpot = {
			spotId: spotId || uuidv4(),
			tabId: this.tabId,
			resource,
			timestamp: Date.now(),
			lastRefreshTime: this.tabStartTime, // Track when this tab started (for refresh detection)
		};

		filteredSpots.push(newSpot);
		this.saveTabSpots(filteredSpots);

		if (debug) console.log('%c[TabManager](bookSpot)', 'color:green', this.tabId.substring(0, 8), 'Successfully booked spot for resource:', resource);
		return { success: true };
	}

	/**
	 * Force book a spot, replacing any existing booking
	 */
	forceBookSpot(resource: string, spotId?: string): void {
		const spots = this.getTabSpots();

		// Remove any existing spots for this resource
		const filteredSpots = spots.filter((spot) => spot.resource !== resource);

		// Add new spot with refresh tracking
		const newSpot: TabSpot = {
			spotId: spotId || uuidv4(),
			tabId: this.tabId,
			resource,
			timestamp: Date.now(),
			lastRefreshTime: this.tabStartTime,
		};

		filteredSpots.push(newSpot);
		this.saveTabSpots(filteredSpots);

		if (debug) console.log('%c[TabManager](forceBookSpot)', 'color:green', this.tabId.substring(0, 8), 'Force booked spot for resource:', resource);
	}

	/**
	 * Release a parking spot
	 */
	releaseSpot(resource: string): void {
		const spots = this.getTabSpots();
		const filteredSpots = spots.filter((spot) => !(spot.tabId === this.tabId && spot.resource === resource));

		this.saveTabSpots(filteredSpots);

		if (debug) console.log('%c[TabManager](releaseSpot)', 'color:green', this.tabId.substring(0, 8), 'Released spot for resource:', resource);
	}

	/**
	 * Release all spots for this tab
	 */
	releaseAllSpots(): void {
		const spots = this.getTabSpots();
		const filteredSpots = spots.filter((spot) => spot.tabId !== this.tabId);

		this.saveTabSpots(filteredSpots);

		if (debug) console.log('%c[TabManager](releaseAllSpots)', 'color:green', this.tabId.substring(0, 8), 'Released all spots for this tab');
	}

	/**
	 * Check if a resource is booked by another tab
	 */
	isResourceBookedByAnotherTab(resource: string): TabSpot | null {
		const spots = this.getTabSpots();
		const existingSpot = spots.find((spot) => spot.resource === resource && spot.tabId !== this.tabId);

		if (!existingSpot) return null;

		// Check if the spot is from an active tab or within grace period
		if (this.isTabActive(existingSpot.tabId)) {
			return existingSpot;
		}

		const now = Date.now();
		const spotAge = now - existingSpot.timestamp;
		const isWithinGracePeriod = existingSpot.lastRefreshTime && (now - existingSpot.lastRefreshTime) < PAGE_REFRESH_GRACE_PERIOD;

		if (isWithinGracePeriod || spotAge < SPOT_STALE_THRESHOLD) {
			return existingSpot;
		}

		// Spot is stale, remove it
		this.cleanupStaleSpots();
		return null;
	}

	/**
	 * Get all spots booked by this tab
	 */
	getMySpots(): TabSpot[] {
		const spots = this.getTabSpots();
		return spots.filter((spot) => spot.tabId === this.tabId);
	}

	/**
	 * Clean up stale spots (older than 1 hour)
	 */
	cleanupStaleSpots(): void {
		const spots = this.getTabSpots();
		const oneHourAgo = Date.now() - 60 * 60 * 1000;
		const freshSpots = spots.filter((spot) => spot.timestamp > oneHourAgo);

		if (freshSpots.length !== spots.length) {
			this.saveTabSpots(freshSpots);
			if (debug) console.log('%c[TabManager](cleanupStaleSpots)', 'color:green', this.tabId.substring(0, 8), 'Cleaned up', spots.length - freshSpots.length, 'stale spots');
		}
	}

	/**
	 * Start the heartbeat mechanism to track active tabs
	 */
	private startHeartbeat(): void {
		// Send initial heartbeat
		this.sendHeartbeat();

		// Set up periodic heartbeat
		this.heartbeatInterval = setInterval(() => {
			this.sendHeartbeat();
			this.cleanupStaleTabs();
		}, HEARTBEAT_INTERVAL);

		// Cleanup when the page is about to be unloaded
		window.addEventListener('beforeunload', () => {
			this.cleanup();
		});
	}

	/**
	 * Send heartbeat to indicate this tab is still active
	 */
	private sendHeartbeat(): void {
		if (document.hidden) return; // Don't send heartbeat if tab is hidden

		try {
			const heartbeats = this.getTabHeartbeats();
			const updatedHeartbeats = heartbeats.filter((h) => h.tabId !== this.tabId);

			updatedHeartbeats.push({
				tabId: this.tabId,
				timestamp: Date.now(),
				route: this.currentRoute,
			});

			this.saveTabHeartbeats(updatedHeartbeats);

			// if (debug) console.log('%c[TabManager](sendHeartbeat)', 'color:green', this.tabId.substring(0, 8), 'Heartbeat sent');
		} catch (error) {
			if (debug) console.error('%c[TabManager](sendHeartbeat)', 'color:green', this.tabId.substring(0, 8), 'Failed to send heartbeat:', error);
		}
	}

	/**
	 * Clean up stale tabs and their associated spots
	 */
	private cleanupStaleTabs(): void {
		const now = Date.now();
		const heartbeats = this.getTabHeartbeats();
		const activeHeartbeats = heartbeats.filter((h) => (now - h.timestamp) < STALE_TAB_THRESHOLD);

		// Remove stale heartbeats
		if (activeHeartbeats.length !== heartbeats.length) {
			this.saveTabHeartbeats(activeHeartbeats);
			if (debug) console.log('%c[TabManager](cleanupStaleTabs)', 'color:green', this.tabId.substring(0, 8), 'Cleaned up', heartbeats.length - activeHeartbeats.length, 'stale tabs');
		}

		// Clean up spots from inactive tabs
		const activeTabIds = new Set(activeHeartbeats.map((h) => h.tabId));
		const spots = this.getTabSpots();
		const activeSpotsWithGrace = spots.filter((spot) => {
			// Keep spot if tab is still active
			if (activeTabIds.has(spot.tabId)) {
				return true;
			}

			// For inactive tabs, check if they're within grace period (page refresh scenario)
			const spotAge = now - spot.timestamp;
			const isWithinGracePeriod = spot.lastRefreshTime && (now - spot.lastRefreshTime) < PAGE_REFRESH_GRACE_PERIOD;
			const isRecentSpot = spotAge < SPOT_STALE_THRESHOLD;

			return isWithinGracePeriod || isRecentSpot;
		});

		if (activeSpotsWithGrace.length !== spots.length) {
			this.saveTabSpots(activeSpotsWithGrace);
			if (debug) console.log('%c[TabManager](cleanupStaleTabs)', 'color:green', this.tabId.substring(0, 8), 'Cleaned up', spots.length - activeSpotsWithGrace.length, 'orphaned spots');
		}
	}

	/**
	 * Cleanup resources when tab is closing
	 */
	private cleanup(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
		}
		this.releaseAllSpots();

		// Remove our heartbeat
		const heartbeats = this.getTabHeartbeats();
		const filteredHeartbeats = heartbeats.filter((h) => h.tabId !== this.tabId);
		this.saveTabHeartbeats(filteredHeartbeats);
	}

	/**
	 * Get tab heartbeats from storage
	 */
	private getTabHeartbeats(): TabHeartbeat[] {
		try {
			const stored = window.localStorage.getItem(TAB_HEARTBEAT_STORAGE_KEY);
			return stored ? JSON.parse(stored) : [];
		} catch (error) {
			if (debug) console.error('%c[TabManager](getTabHeartbeats)', 'color:green', this.tabId.substring(0, 8), 'Failed to get tab heartbeats:', error);
			return [];
		}
	}

	/**
	 * Save tab heartbeats to storage
	 */
	private saveTabHeartbeats(heartbeats: TabHeartbeat[]): void {
		try {
			window.localStorage.setItem(TAB_HEARTBEAT_STORAGE_KEY, JSON.stringify(heartbeats));
		} catch (error) {
			if (debug) console.error('%c[TabManager](saveTabHeartbeats)', 'color:green', this.tabId.substring(0, 8), 'Failed to save tab heartbeats:', error);
		}
	}

	/**
	 * Check if a tab is currently active (has recent heartbeat)
	 */
	isTabActive(tabId: string): boolean {
		const heartbeats = this.getTabHeartbeats();
		const heartbeat = heartbeats.find((h) => h.tabId === tabId);

		if (!heartbeat) return false;

		const now = Date.now();
		return (now - heartbeat.timestamp) < STALE_TAB_THRESHOLD;
	}

	/**
	 * Get all currently active tabs
	 */
	getActiveTabs(): TabHeartbeat[] {
		const heartbeats = this.getTabHeartbeats();
		const now = Date.now();

		return heartbeats.filter((h) => (now - h.timestamp) < STALE_TAB_THRESHOLD);
	}
}
