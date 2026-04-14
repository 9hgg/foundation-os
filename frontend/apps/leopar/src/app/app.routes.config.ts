import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, Route, Router, RouterStateSnapshot } from '@angular/router';
import { buildAdminRoute } from '@foundation/admin/pages';
import { AuthTokensRepository } from '@foundation/auth/state';

import { UrlMatchResult, UrlSegment } from '@angular/router';
import { environment } from '../environments/environment';

/**
 * Generate article routes for the given path and source folder ID.
 * @param path
 * @param sourceFolderId
 * @param listName
 * @param listDescription
 * @returns
 */
function generateArticleRoutes(path: string, sourceFolderId: string, listName?: string, listDescription?: string, commentTitle?: string): Route {
	function prefixMatcher(segments: UrlSegment[]): UrlMatchResult | null {
		if (segments.length && segments[0].path === path) {
			// consume all URL segments
			return { consumed: segments };
		}
		return null;
	}
	return {
		matcher: prefixMatcher,
		loadComponent: () => import('@foundation/articles/ui').then((m) => m.ArticleRootListComponent),
		data: { sourceFolderId, listName, segmentPath: path, listDescription, commentTitle },
	};
}

const userRootPath = 'host';

export const appRoutes: Route[] = [
	buildAdminRoute(),
	// root path (host)
	{
		// while connected as host (can lead to the dashboard, the auth pages)
		path: userRootPath,
		loadComponent: () => import('@foundation/workspace/pages').then((m) => m.DefaultWorkspacePageComponent),
		canActivateChild: [
			(next: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
				// looking for auth options ? => ok
				if (state.url.startsWith('/' + userRootPath + '/auth')) return true;

				// connected ? => ok
				const authTokensRepository = inject(AuthTokensRepository);
				if (authTokensRepository.getCurrentAuthToken()) return true;

				// not connected ? => redirect to login page with the return url
				const router = inject(Router);
				router.navigate(['/auth/login'], { queryParams: { returnUrl: state.url } });

				return false;
			},
		],
		children: [
			// dashboard
			{
				// while connected as host to manage the product (profile, domains, files, ...)
				path: 'dashboard',
				// component: DashboardHostPageComponent, // with the dashboard header
				loadComponent: () => import('@leopar/pages').then((m) => m.LeoparDashboardHostPageComponent),
				children: [
					// ''
					{
						path: '',
						// loadComponent: () => import('./pages/dashboard/dashboard-home-page/dashboard-home-page.component').then((m) => m.DashboardHomePageComponent),
						loadComponent: () => import('@leopar/pages').then((m) => m.DashboardHomePageComponent),
					},
					// profile
					{
						path: 'profile',
						// loadComponent: () => import('./pages/dashboard/profile-page/profile-page.component').then((m) => m.ProfilePageComponent),
						loadComponent: () => import('@leopar/pages').then((m) => m.ProfilePageComponent),
					},
					// settings
					{
						path: 'settings',
						// loadComponent: () => import('./pages/dashboard/profile-page/profile-page.component').then((m) => m.ProfilePageComponent),
						loadComponent: () => import('@leopar/pages').then((m) => m.ProfilePageComponent),
					},
					// files
					{
						path: 'files',
						children: [
							{
								path: '',
								loadComponent: () => import('@foundation/files/pages').then((m) => m.FileListPageComponent),
							},
							{
								path: '**',
								redirectTo: '',
							},
						],
					},
					// article
					{
						path: 'articles',
						children: [
							{
								path: '',
								loadComponent: () => import('@foundation/articles/pages').then((m) => m.ArticleListPageComponent),
							},
							{
								path: ':articleId/builder',
								loadComponent: () => import('@foundation/articles/pages').then((m) => m.ArticleBuilderPageComponent),
								data: { hideNavBar: true },
							},
							{
								path: ':articleId',
								loadComponent: () => import('@foundation/articles/pages').then((m) => m.ArticleDisplayerPageComponent),
								data: {
									commentTitle: 'Comments',
								},
							},
						],
					},
					// support
					{
						path: 'support',
						children: [
							{
								path: '',
								loadComponent: () => import('@foundation/articles/pages').then((m) => m.SupportListPageComponent),
							},
							{
								path: ':articleId',
								loadComponent: () => import('@foundation/articles/pages').then((m) => m.ArticleDisplayerPageComponent),
							},
						],
					},
					// projects
					{
						path: 'projects',
						children: [
							{
								path: '',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.ProjectListPageComponent),
							},
							{
								path: ':projectId/builder',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.ProjectsBuilderPageComponent),
								data: { hideNavBar: true, hideFloatingChat: true },
							},
							{
								path: ':projectId',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.ProjectJsonPageComponent),
							},
						],
					},
					// contributors
					{
						path: 'contributors',
						children: [
							{
								path: '',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.ContributorListPageComponent),
							},
							{
								path: ':contributorId/builder',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.ContributorsBuilderPageComponent),
								data: { hideNavBar: true },
							},
							{
								path: ':contributorId',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.ContributorJsonPageComponent),
							},
						],
					},
					// facilities
					{
						path: 'facilities',
						children: [
							{
								path: '',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.FacilityListPageComponent),
							},
							{
								path: ':facilityId/builder',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.FacilityBuilderPageComponent),
								data: { hideNavBar: true },
							},
							{
								path: ':facilityId',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.FacilityJsonPageComponent),
							},
						],
					},
					// customers
					{
						path: 'customers',
						children: [
							{
								path: '',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.CustomerListPageComponent),
							},
							{
								path: ':customerId/builder',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.CustomerBuilderPageComponent),
								data: { hideNavBar: true },
							},
							{
								path: ':customerId',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.CustomerJsonPageComponent),
							},
						],
					},
					// batches
					{
						path: 'batches',
						children: [
							{
								path: '',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.BatchListPageComponent),
							},
							{
								path: ':batchId/builder',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.BatchBuilderPageComponent),
								data: { hideNavBar: true },
							},
							{
								path: ':batchId',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.BatchJsonPageComponent),
							},
						],
					},
					// deliverables
					{
						path: 'deliverables',
						children: [
							{
								path: '',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.DeliverableListPageComponent),
							},
							{
								path: ':deliverableId/builder',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.DeliverableBuilderPageComponent),
								data: { hideNavBar: true },
							},
							{
								path: ':deliverableId',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.DeliverableJsonPageComponent),
							},
						],
					},
					// activities
					{
						path: 'activities',
						children: [
							{
								path: '',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.ActivityListPageComponent),
							},
							{
								path: ':activityId/builder',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.ActivityBuilderPageComponent),
								data: { hideNavBar: true },
							},
							{
								path: ':activityId',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.ActivityJsonPageComponent),
							},
						],
					},
					// purchases
					{
						path: 'purchases',
						children: [
							{
								path: '',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.PurchaseListPageComponent),
							},
							{
								path: ':purchaseId/builder',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.PurchaseBuilderPageComponent),
								data: { hideNavBar: true },
							},
							{
								path: ':purchaseId',
								loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.PurchaseJsonPageComponent),
							},
						],
					},
					{
						path: 'explorer',
						loadComponent: () => import('./pages/dashboard-explorer-page/dashboard-explorer-page.component').then((m) => m.DashboardExplorerPageComponent),
					},
					// teams
					{
						path: 'teams',
						children: [
							{
								path: '',
								loadComponent: () => import('@foundation/teams/pages').then((m) => m.TeamListPageComponent),
							},
							{
								path: ':teamId/builder',
								loadComponent: () => import('@foundation/teams/pages').then((m) => m.TeamBuilderPageComponent),
								data: { hideNavBar: true },
							},
						],
					},
					// **
					{
						path: '**',
						redirectTo: '',
					},
				],
			},

			// **
			{
				path: '**',
				redirectTo: 'dashboard',
			},
		],
	},
	{
		path: 'p/:projectId/:presentationId',
		loadComponent: () => import('@edf/edf-project-rands/pages').then((m) => m.ProjectPresentationPageComponent),
		data: { hideNavBar: true, hideFloatingChat: true },
	},
	{
		path: '',
		loadComponent: () => import('@leopar/pages').then((m) => m.LeoparLandingPageRouterPageComponent),
		children: [
			{
				path: 'support',
				loadComponent: () => import('@leopar/pages').then((m) => m.SupportPageComponent),
				children: [generateArticleRoutes('articles', environment.articles.folders.support.articles, 'Support knowledge base', 'Browse how-to guides, tutorials and frequently asked questions to quickly find solutions and tips for using our platform.')],
			},
			{
				path: 'auth',
				loadComponent: () => import('@foundation/auth/pages').then((m) => m.AuthOptionsPageComponent),
				children: [
					{
						path: 'login',
						loadComponent: () => import('@foundation/auth/pages').then((m) => m.LoginPageComponent),
					},
					{
						path: 'reset',
						loadComponent: () => import('@foundation/auth/pages').then((m) => m.ResetRequestPageComponent),
					},
					{
						path: 'reset-claim',
						loadComponent: () => import('@foundation/auth/pages').then((m) => m.ResetClaimPageComponent),
					},
					{
						path: 'verify-email-claim',
						loadComponent: () => import('@foundation/auth/pages').then((m) => m.VerifyEmailClaimPageComponent),
					},
					{
						path: 'change-email-claim',
						loadComponent: () => import('@foundation/auth/pages').then((m) => m.ChangeEmailClaimPageComponent),
					},
					{
						path: 'register',
						loadComponent: () => import('@foundation/auth/pages').then((m) => m.RegisterPageComponent),
					},
					{
						path: '**',
						redirectTo: 'login',
					},
				],
			},
			{
				path: '',
				loadComponent: () => import('@leopar/pages').then((m) => m.LeoparLandingPageComponent),
			},
			{
				path: '**',
				redirectTo: '',
			},
		],
	},
	{
		path: '**',
		redirectTo: '/auth/login',
	},
];
