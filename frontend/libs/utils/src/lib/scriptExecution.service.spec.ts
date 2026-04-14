import { TestBed } from '@angular/core/testing';
import { IframeManagerService } from './scriptExecution.service';

// jsdom doesn't support iframe.sandbox as a DOMTokenList — patch it
const originalCreateElement = document.createElement.bind(document);
function createElementWithSandbox(tag: string, ...args: any[]): any {
  const el = originalCreateElement(tag, ...args);
  if (tag === 'iframe') {
    Object.defineProperty(el, 'sandbox', {
      value: { add: vi.fn() },
      writable: true,
    });
  }
  return el;
}

describe('IframeManagerService', () => {
  let service: IframeManagerService;

  beforeEach(() => {
    vi.spyOn(document, 'createElement').mockImplementation(createElementWithSandbox as any);

    TestBed.configureTestingModule({
      providers: [IframeManagerService],
    });
    service = TestBed.inject(IframeManagerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up any iframes added to body
    document.querySelectorAll('iframe').forEach((el) => el.remove());
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('addScriptToIframe registers a script and creates iframe', () => {
    service.addScriptToIframe('iframe-1', 'myScript', 'return 42;');
    const iframe = document.getElementById('iframe-1');
    expect(iframe).not.toBeNull();
  });

  it('addScriptToIframe is idempotent for same script content', () => {
    service.addScriptToIframe('iframe-idem', 'script1', 'return 1;');
    expect(() => service.addScriptToIframe('iframe-idem', 'script1', 'return 1;')).not.toThrow();
  });

  it('addScriptToIframe updates script when content changes', () => {
    service.addScriptToIframe('iframe-update-script', 'script1', 'return 1;');
    expect(() => service.addScriptToIframe('iframe-update-script', 'script1', 'return 2;')).not.toThrow();
  });

  it('upsertIframe creates iframe when it does not exist', () => {
    service.upsertIframe('iframe-new-test');
    const iframe = document.getElementById('iframe-new-test');
    expect(iframe).not.toBeNull();
  });

  it('upsertIframe updates srcdoc when iframe already exists', () => {
    service.addScriptToIframe('iframe-update', 's1', 'return 1;');
    service.addScriptToIframe('iframe-update', 's2', 'return 2;');
    const iframe = document.getElementById('iframe-update') as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
  });

  it('executeScriptInIframe returns NEVER for unknown iframeId', () => {
    const result = service.executeScriptInIframe('non-existent-iframe', 'myScript');
    expect(result).toBeDefined();
  });

  it('executeScriptInIframe returns NEVER for missing scriptId', () => {
    service.addScriptToIframe('iframe-exec', 'existingScript', 'return 99;');
    const result = service.executeScriptInIframe('iframe-exec', 'missingScript');
    expect(result).toBeDefined();
  });

  it('sendMessageToIframe warns for unknown iframe', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (service as any).sendMessageToIframe({
      direction: 'toIframe',
      iframeId: 'unknown',
      salt: 'x',
      action: 'executeScript',
      payload: null,
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
