/**
 * Google Cloud Translation Service
 * Handles Spanish <-> English translations for menu items and categories
 */

interface TranslationResult {
  translatedText: string;
  detectedSourceLanguage?: string;
}

interface GoogleTranslateResponse {
  data: {
    translations: Array<{
      translatedText: string;
      detectedSourceLanguage?: string;
    }>;
  };
}

export class TranslationService {
  private apiKey: string;
  private baseUrl = 'https://translation.googleapis.com/language/translate/v2';

  constructor() {
    this.apiKey = process.env.GOOGLE_TRANSLATE_API_KEY || '';
    if (!this.apiKey) {
      console.warn('GOOGLE_TRANSLATE_API_KEY not set - translations will be disabled');
    }
  }

  /**
   * Translate text from one language to another
   */
  async translate(
    text: string,
    targetLang: 'en' | 'es',
    sourceLang?: 'en' | 'es'
  ): Promise<TranslationResult | null> {
    if (!this.apiKey || !text.trim()) {
      return null;
    }

    try {
      const params = new URLSearchParams({
        key: this.apiKey,
        q: text,
        target: targetLang,
        format: 'text',
      });

      if (sourceLang) {
        params.append('source', sourceLang);
      }

      const response = await fetch(`${this.baseUrl}?${params}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Translation API error:', error);
        return null;
      }

      const data = await response.json() as GoogleTranslateResponse;
      const translation = data.data.translations[0];

      return {
        translatedText: translation.translatedText,
        detectedSourceLanguage: translation.detectedSourceLanguage,
      };
    } catch (error) {
      console.error('Translation failed:', error);
      return null;
    }
  }

  /**
   * Translate Spanish to English
   */
  async spanishToEnglish(text: string): Promise<string | null> {
    const result = await this.translate(text, 'en', 'es');
    return result?.translatedText || null;
  }

  /**
   * Translate English to Spanish
   */
  async englishToSpanish(text: string): Promise<string | null> {
    const result = await this.translate(text, 'es', 'en');
    return result?.translatedText || null;
  }

  /**
   * Batch translate multiple texts (more efficient API usage)
   */
  async translateBatch(
    texts: string[],
    targetLang: 'en' | 'es',
    sourceLang?: 'en' | 'es'
  ): Promise<(string | null)[]> {
    if (!this.apiKey || texts.length === 0) {
      return texts.map(() => null);
    }

    try {
      const params = new URLSearchParams({
        key: this.apiKey,
        target: targetLang,
        format: 'text',
      });

      if (sourceLang) {
        params.append('source', sourceLang);
      }

      texts.forEach((text) => params.append('q', text));

      const response = await fetch(`${this.baseUrl}?${params}`, {
        method: 'POST',
      });

      if (!response.ok) {
        console.error('Batch translation API error:', await response.text());
        return texts.map(() => null);
      }

      const data = await response.json() as GoogleTranslateResponse;
      return data.data.translations.map((t) => t.translatedText);
    } catch (error) {
      console.error('Batch translation failed:', error);
      return texts.map(() => null);
    }
  }
}

export const translationService = new TranslationService();
