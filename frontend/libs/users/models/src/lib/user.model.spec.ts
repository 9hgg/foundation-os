import type { EmailSubscriptionDetails, NotificationDigestFrequency, ThemeConfig, User, UserConfig } from './user.model';

describe('User model — structural type tests', () => {
        it('constructs a valid User object with all required fields', () => {
                const user: User = {
                        id: 'user-123',
                        email: 'test@example.com',
                        emailVerified: false,
                        config: { theme: {} },
                };
                expect(user.id).toBe('user-123');
                expect(user.email).toBe('test@example.com');
                expect(user.emailVerified).toBe(false);
        });

        it('accepts optional firstName, lastName, and pseudo fields', () => {
                const user: User = {
                        id: 'u1',
                        email: 'a@b.com',
                        emailVerified: true,
                        firstName: 'Jane',
                        lastName: 'Doe',
                        pseudo: 'jdoe',
                        config: { theme: { mode: 'dark' } },
                };
                expect(user.firstName).toBe('Jane');
                expect(user.lastName).toBe('Doe');
                expect(user.pseudo).toBe('jdoe');
        });

        it('ThemeConfig supports light, dark, and system modes', () => {
                const themes: ThemeConfig[] = [{ mode: 'light' }, { mode: 'dark' }, { mode: 'system' }];
                expect(themes).toHaveLength(3);
                expect(themes.map((t) => t.mode)).toEqual(['light', 'dark', 'system']);
        });

        it('NotificationDigestFrequency covers all five valid string values', () => {
                const frequencies: NotificationDigestFrequency[] = ['never', 'hourly', 'daily', 'weekly', 'monthly'];
                expect(frequencies).toHaveLength(5);
        });

        it('UserConfig can hold newsletterSubscriptions with subscribed flag', () => {
                const config: UserConfig = {
                        theme: { mode: 'light' },
                        newsletterSubscriptions: {
                                weekly_digest: { subscribed: true, frequency: 'weekly' },
                        },
                };
                const subscription: EmailSubscriptionDetails = config.newsletterSubscriptions!['weekly_digest'];
                expect(subscription.subscribed).toBe(true);
                expect(subscription.frequency).toBe('weekly');
        });

        it('UserConfig theme defaults to empty object without crashing', () => {
                const config: UserConfig = { theme: {} };
                expect(config.theme.mode).toBeUndefined();
        });

        it('User config formerEmails tracks historical addresses', () => {
                const user: User = {
                        id: 'u2',
                        email: 'new@example.com',
                        emailVerified: true,
                        config: {
                                theme: {},
                                formerEmails: [{ email: 'old@example.com', changedAt: '2024-01-01T00:00:00Z', wasVerified: true }],
                        },
                };
                expect(user.config.formerEmails).toHaveLength(1);
                expect(user.config.formerEmails![0].email).toBe('old@example.com');
	});
});
