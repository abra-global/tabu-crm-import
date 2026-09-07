const API_BASE = '/api';

async function handleJson(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `שגיאת שרת (${res.status})`);
  }
  return body;
}

export async function fetchProjects() {
  const res = await fetch(`${API_BASE}/projects`);
  const body = await handleJson(res);
  return body.projects;
}

export async function uploadTabuPdf(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
  const body = await handleJson(res);
  return body.data;
}

/**
 * Runs the CRM import and streams progress events via SSE.
 * onEvent receives each parsed event; the returned promise resolves when
 * the stream closes.
 */
export function runImportStream({ projectId, subParcels, separateAccountPerResident }, onEvent) {
  return new Promise((resolve, reject) => {
    fetch(`${API_BASE}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, subParcels, separateAccountPerResident }),
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `שגיאת שרת (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() ?? '';
          for (const chunk of chunks) {
            const line = chunk.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            try {
              const event = JSON.parse(line.slice(6));
              onEvent(event);
            } catch {
              // ignore malformed chunk
            }
          }
        }
        resolve();
      })
      .catch(reject);
  });
}
