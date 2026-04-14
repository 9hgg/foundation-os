import { TestBed } from '@angular/core/testing';
import { PalettesService } from './palettes.service';

describe('PalettesService', () => {
  let service: PalettesService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PalettesService] });
    service = TestBed.inject(PalettesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getAllPalettes', () => {
    it('returns a non-empty array of palettes', () => {
      const palettes = service.getAllPalettes();
      expect(palettes.length).toBeGreaterThan(0);
    });

    it('each palette has an id and colors array', () => {
      for (const p of service.getAllPalettes()) {
        expect(typeof p.id).toBe('number');
        expect(Array.isArray(p.colors)).toBe(true);
        expect(p.colors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getPaletteById', () => {
    it('returns the correct palette for id 0', () => {
      const p = service.getPaletteById(0);
      expect(p).toBeDefined();
      expect(p?.id).toBe(0);
    });

    it('returns undefined for unknown id', () => {
      expect(service.getPaletteById(9999)).toBeUndefined();
    });
  });

  describe('getRandomPalette', () => {
    it('returns a palette object', () => {
      const p = service.getRandomPalette();
      expect(p).toBeDefined();
      expect(Array.isArray(p.colors)).toBe(true);
    });
  });

  describe('getSimilarPalettes', () => {
    it('returns an array for a valid hex color', () => {
      const result = service.getSimilarPalettes('#ff0000');
      expect(Array.isArray(result)).toBe(true);
    });

    it('respects maxResults limit', () => {
      const result = service.getSimilarPalettes('#00ff00', 3);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('returns empty array for invalid hex', () => {
      const result = service.getSimilarPalettes('not-a-hex');
      expect(result).toEqual([]);
    });
  });

  describe('getPalettesByCategory', () => {
    it('returns palettes for "warm" category', () => {
      const result = service.getPalettesByCategory('warm');
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns palettes for "cool" category', () => {
      const result = service.getPalettesByCategory('cool');
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns palettes for "neutral" category', () => {
      const result = service.getPalettesByCategory('neutral');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
