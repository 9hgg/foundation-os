import { firstValueFrom } from 'rxjs';
import { AppConfigService } from './app-config.service';

describe('AppConfigService', () => {
	it('initializes with an empty config object', async () => {
		const service = new AppConfigService();

		await expect(firstValueFrom(service.config$)).resolves.toEqual({});
		expect(service.config$_._).toEqual({});
	});

	it('emits updates when the config proxy changes', async () => {
		const service = new AppConfigService();
		const values: Array<{ apiUrl?: string }> = [];

		service.config$.subscribe((value) => values.push(value));
		service.config$_.apiUrl = 'https://example.test';

		expect(service.config$_.apiUrl).toBe('https://example.test');
		expect(values.at(-1)).toEqual({ apiUrl: 'https://example.test' });
	});
});
