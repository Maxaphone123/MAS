export type NormalizedErrorType =
  | 'auth'
  | 'rate_limit_or_quota'
  | 'model_not_found'
  | 'network'
  | 'bad_request'
  | 'unsupported'
  | 'unknown';

export interface GenerateResult {
  ok: boolean;
  text?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  error?: {
    type: NormalizedErrorType;
    message: string;
    raw?: any;
  };
}

export interface DiscoveredModel {
  id: string;
  name: string;
  suggestedTier: 'fast' | 'balanced' | 'strong';
  kind: 'text' | 'image';
}

export function suggestTier(name: string): 'fast' | 'balanced' | 'strong' {
  const lower = name.toLowerCase();
  if (lower.includes('lite') || lower.includes('nano') || lower.includes('mini') || lower.includes('haiku')) {
    return 'fast';
  }
  if (lower.includes('pro') || lower.includes('opus') || lower.includes('ultra')) {
    return 'strong';
  }
  return 'balanced'; // flash, sonnet, and default
}

export function normalizeError(status: number | undefined, rawError: any): { type: NormalizedErrorType; message: string } {
  let message = 'An error occurred';
  if (typeof rawError === 'string') {
    message = rawError;
  } else if (rawError && typeof rawError.message === 'string') {
    message = rawError.message;
  } else if (rawError) {
    try {
      message = JSON.stringify(rawError);
    } catch {
      message = String(rawError);
    }
  }

  const lower = message.toLowerCase();

  if (status === 401 || status === 403 || lower.includes('api key not valid') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
    return { type: 'auth', message };
  }
  if (status === 429 || lower.includes('quota') || lower.includes('rate limit') || lower.includes('resource_exhausted')) {
    return { type: 'rate_limit_or_quota', message };
  }
  if (status === 404 || lower.includes('not found') || lower.includes('model does not exist')) {
    return { type: 'model_not_found', message };
  }
  if (status === 400 || lower.includes('bad request') || lower.includes('invalid argument')) {
    return { type: 'bad_request', message };
  }
  if (lower.includes('network') || lower.includes('fetch failed') || lower.includes('econnrefused') || lower.includes('etimedout')) {
    return { type: 'network', message };
  }

  return { type: 'unknown', message };
}

// Test connection and list available models (dynamic discovery per principle 6.9)
export async function testConnectionAndListModels(
  providerType: 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'custom',
  apiKey: string,
  baseUrl?: string
): Promise<{ ok: boolean; models?: DiscoveredModel[]; error?: { type: NormalizedErrorType; message: string } }> {
  try {
    if (providerType === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();

      if (!res.ok) {
        const norm = normalizeError(res.status, data.error || data);
        return { ok: false, error: norm };
      }

      const list: DiscoveredModel[] = [];
      if (Array.isArray(data.models)) {
        for (const m of data.models) {
          const supported = m.supportedGenerationMethods || [];
          if (supported.includes('generateContent') || supported.includes('generateMessage')) {
            const rawId = m.name || '';
            const cleanId = rawId.replace(/^models\//, '');
            const isImage = cleanId.toLowerCase().includes('image') || cleanId.toLowerCase().includes('imagen');
            list.push({
              id: cleanId,
              name: m.displayName || cleanId,
              suggestedTier: suggestTier(cleanId),
              kind: isImage ? 'image' : 'text'
            });
          }
        }
      }
      return { ok: true, models: list };
    }

    if (providerType === 'openai' || providerType === 'openrouter' || providerType === 'custom') {
      let targetUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.openai.com/v1';
      if (!targetUrl.endsWith('/models')) {
        targetUrl = `${targetUrl}/models`;
      }

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
      if (providerType === 'openrouter') {
        headers['HTTP-Referer'] = 'https://orchestrator.local';
        headers['X-Title'] = 'Orchestrator';
      }

      const res = await fetch(targetUrl, { headers });
      const data = await res.json();

      if (!res.ok) {
        const norm = normalizeError(res.status, data.error || data);
        return { ok: false, error: norm };
      }

      const list: DiscoveredModel[] = [];
      const modelItems = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      for (const m of modelItems) {
        const id = m.id || m.name || '';
        if (id) {
          const isImage = id.includes('dall-e') || id.includes('image');
          list.push({
            id,
            name: m.name || id,
            suggestedTier: suggestTier(id),
            kind: isImage ? 'image' : 'text'
          });
        }
      }
      return { ok: true, models: list };
    }

    if (providerType === 'anthropic') {
      const targetUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.anthropic.com/v1') + '/models';
      const res = await fetch(targetUrl, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (!res.ok) {
        const norm = normalizeError(res.status, data.error || data);
        return { ok: false, error: norm };
      }
      const list: DiscoveredModel[] = [];
      const items = Array.isArray(data.data) ? data.data : [];
      for (const m of items) {
        if (m.id) {
          list.push({
            id: m.id,
            name: m.display_name || m.id,
            suggestedTier: suggestTier(m.id),
            kind: 'text'
          });
        }
      }
      return { ok: true, models: list };
    }

    return { ok: false, error: { type: 'unsupported', message: `Provider type ${providerType} is unsupported.` } };
  } catch (err: any) {
    return { ok: false, error: normalizeError(undefined, err) };
  }
}

// Generate text via provider
export async function generateText(options: {
  providerType: 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'custom';
  apiKey: string;
  baseUrl?: string;
  modelName: string;
  systemPrompt?: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}): Promise<GenerateResult> {
  const { providerType, apiKey, baseUrl, modelName, systemPrompt, messages } = options;

  try {
    if (providerType === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      const bodyPayload: any = { contents };

      const sysText = systemPrompt || messages.find(m => m.role === 'system')?.content;
      if (sysText) {
        bodyPayload.systemInstruction = {
          parts: [{ text: sysText }]
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();
      if (!res.ok) {
        const norm = normalizeError(res.status, data.error || data);
        return { ok: false, error: norm };
      }

      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.map((p: any) => p.text).join('') || '';
      const usage = data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount
      } : undefined;

      return { ok: true, text, usage };
    }

    if (providerType === 'openai' || providerType === 'openrouter' || providerType === 'custom') {
      let targetUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.openai.com/v1';
      if (!targetUrl.endsWith('/chat/completions')) {
        targetUrl = `${targetUrl}/chat/completions`;
      }

      const formattedMessages = [...messages];
      if (systemPrompt && !formattedMessages.some(m => m.role === 'system')) {
        formattedMessages.unshift({ role: 'system', content: systemPrompt });
      }

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
      if (providerType === 'openrouter') {
        headers['HTTP-Referer'] = 'https://orchestrator.local';
        headers['X-Title'] = 'Orchestrator';
      }

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName,
          messages: formattedMessages
        })
      });

      const data = await res.json();
      if (!res.ok) {
        const norm = normalizeError(res.status, data.error || data);
        return { ok: false, error: norm };
      }

      const text = data.choices?.[0]?.message?.content || '';
      const usage = data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined;

      return { ok: true, text, usage };
    }

    if (providerType === 'anthropic') {
      const targetUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.anthropic.com/v1') + '/messages';
      const nonSystemMessages = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));

      const sysText = systemPrompt || messages.find(m => m.role === 'system')?.content;

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 4096,
          system: sysText,
          messages: nonSystemMessages
        })
      });

      const data = await res.json();
      if (!res.ok) {
        const norm = normalizeError(res.status, data.error || data);
        return { ok: false, error: norm };
      }

      const text = Array.isArray(data.content)
        ? data.content.map((c: any) => c.text || '').join('')
        : '';
      const usage = data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
      } : undefined;

      return { ok: true, text, usage };
    }

    return {
      ok: false,
      error: { type: 'unsupported', message: `Provider ${providerType} is not supported for text generation.` }
    };
  } catch (err: any) {
    return { ok: false, error: normalizeError(undefined, err) };
  }
}

// Generate image via provider (Stage 4B)
export async function generateImage(options: {
  providerType: 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'custom';
  apiKey: string;
  baseUrl?: string;
  modelName: string;
  prompt: string;
}): Promise<{ ok: boolean; imageBase64?: string; mimeType?: string; error?: { type: NormalizedErrorType; message: string } }> {
  const { providerType, apiKey, baseUrl, modelName, prompt } = options;

  try {
    if (providerType === 'gemini') {
      // Check if it's an Imagen model or standard generateContent
      const isImagen = modelName.toLowerCase().includes('imagen');
      if (isImagen) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:predict?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: '1:1', outputMimeType: 'image/png' }
          })
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: normalizeError(res.status, data.error || data) };
        }
        const b64 = data.predictions?.[0]?.bytesBase64Encoded;
        if (b64) {
          return { ok: true, imageBase64: b64, mimeType: 'image/png' };
        }
      }

      // Fallback / standard Gemini generateContent with image modality
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: normalizeError(res.status, data.error || data) };
      }
      const parts = data.candidates?.[0]?.content?.parts || [];
      const inlinePart = parts.find((p: any) => p.inlineData?.data);
      if (inlinePart?.inlineData?.data) {
        return {
          ok: true,
          imageBase64: inlinePart.inlineData.data,
          mimeType: inlinePart.inlineData.mimeType || 'image/png'
        };
      }
      return {
        ok: false,
        error: { type: 'unknown', message: 'No image data returned by Gemini model.' }
      };
    }

    if (providerType === 'openai' || providerType === 'custom') {
      const targetUrl = (baseUrl ? baseUrl.replace(/\/+$/, '') : 'https://api.openai.com/v1') + '/images/generations';
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          prompt,
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json'
        })
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: normalizeError(res.status, data.error || data) };
      }
      const b64 = data.data?.[0]?.b64_json;
      if (b64) {
        return { ok: true, imageBase64: b64, mimeType: 'image/png' };
      }
      return { ok: false, error: { type: 'unknown', message: 'No image data returned by OpenAI image model.' } };
    }

    return {
      ok: false,
      error: { type: 'unsupported', message: `Image generation is unsupported for provider ${providerType}.` }
    };
  } catch (err: any) {
    return { ok: false, error: normalizeError(undefined, err) };
  }
}

