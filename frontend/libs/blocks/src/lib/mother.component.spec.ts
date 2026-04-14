import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@foundation/notification';
import { PortalService } from '@foundation/utils';
import { MotherComponent } from './mother.component';

const notificationMock = { snack: vi.fn(), snackSuccess: vi.fn(), snackError: vi.fn() };
const portalServiceMock = { updatePortal: vi.fn(), getPortal$$$: vi.fn() };

describe('MotherComponent', () => {
	it('getDefaultExportOptions returns block-id and block-raw-data-as-json', () => {
		const opts = MotherComponent.getDefaultExportOptions();
		expect(opts.length).toBe(2);
		expect(opts[0].id).toBe('block-id');
		expect(opts[1].id).toBe('block-raw-data-as-json');
	});

	it('block-id export returns block.id', () => {
		const opts = MotherComponent.getDefaultExportOptions();
		const idOpt = opts.find((o) => o.id === 'block-id')!;
		const result = idOpt.fn({ id: 'step1' } as any, { id: 'block-123' } as any, null as any, 'owner');
		expect(result).toBe('block-123');
	});

	it('block-raw-data export returns the entire block', () => {
		const opts = MotherComponent.getDefaultExportOptions();
		const rawOpt = opts.find((o) => o.id === 'block-raw-data-as-json')!;
		const block = { id: 'b1', data: { foo: 'bar' } };
		const result = rawOpt.fn({ id: 's1' } as any, block as any, null as any, 'owner');
		expect(result).toBe(block);
	});

	it('getExportOptions returns empty array by default', () => {
		expect(MotherComponent.getExportOptions()).toEqual([]);
	});
});
