import { TranslatePipe } from './translation.pipe';
import { TranslationService } from './translation.service';
import { of } from 'rxjs';

describe('TranslatePipe', () => {
  let pipe: TranslatePipe;
  let translationServiceMock: any;

  beforeEach(() => {
    translationServiceMock = {
      translate$: vi.fn().mockReturnValue(of('Translated Sentence')),
    };
    pipe = new TranslatePipe(translationServiceMock);
  });

  it('create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should transform input sentence', () => {
    pipe.transform('Hello').subscribe((res) => {
      expect(res).toBe('Translated Sentence');
      expect(translationServiceMock.translate$).toHaveBeenCalledWith({
        inputSentence: 'Hello',
        kv: undefined,
        rpbt: false,
        translationContext: undefined,
      });
    });
  });
});
