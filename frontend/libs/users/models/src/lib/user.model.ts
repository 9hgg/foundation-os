import { Resource } from '@foundation/utils';

// Type for notification digest frequency options
export type NotificationDigestFrequency = 'never' | 'hourly' | 'daily' | 'weekly' | 'monthly';

// Details for a specific email subscription/newsletter
export interface EmailSubscriptionDetails {
	subscribed: boolean;
	frequency?: NotificationDigestFrequency; // For future use if newsletters have frequency options
	subscribedAt?: string; // ISO datetime string when subscription was made
	lastSent?: string; // ISO datetime string when last email was sent
}

export interface UserConfig {
	profilePictureId?: string;
	// Email notification preferences
	notificationDigestFrequency?: NotificationDigestFrequency;
	// Newsletter subscriptions - flexible structure for multiple newsletters
	newsletterSubscriptions?: Record<string, EmailSubscriptionDetails>;

	// Theme preferences
	theme: ThemeConfig;
	language?: string;
	// History of previous email addresses
	formerEmails?: { email: string; changedAt: string; wasVerified: boolean }[];
}

export interface ThemeConfig {
	mode?: 'light' | 'dark' | 'system';
	light?: string;
	dark?: string;
}

export interface User extends Resource {
	// # from:
	// first_name: Optional[str] = None
	// last_name: Optional[str] = None
	// pseudo: Optional[str] = None

	// email: Optional[str] = None
	// email_verified: Optional[bool] = False
	// password_hashed: Optional[str] = sqlmodel.Field(exclude=True, default=None)

	id: string;

	email: string;

	emailVerified: boolean;

	firstName?: string;
	lastName?: string;
	pseudo?: string;

	config: UserConfig;
}
