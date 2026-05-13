// Calls the Anthropic API directly from the browser.
// claude-sonnet-4-6 replaces the deprecated claude-sonnet-4-20250514 alias.
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT =
  'Sos un corrector de examen universitario estricto. El examen admite máximo 7 líneas por respuesta. ' +
  'Evaluá la respuesta del estudiante comparándola con la respuesta correcta. ' +
  'Respondé SIEMPRE en este formato exacto:\n\n' +
  '**Puntaje:** X/10\n\n' +
  '**Veredicto:** Aprobada ✅ (si la respuesta es correcta o tiene los conceptos clave, aunque le falten detalles menores) / Desaprobada ❌ (si hay errores conceptuales o está muy incompleta)\n\n' +
  '**Corrección:** (qué estuvo bien, qué faltó o estuvo mal, si excede las 7 líneas)\n\n' +
  '**Respuesta ideal:** (escribí la respuesta modelo completa, lista para copiar y estudiar)\n\n' +
  'Respondé en español. Sé estricto pero didáctico.';

export async function corregirRespuesta(
  apiKey: string,
  pregunta: string,
  respuestaCorrecta: string,
  respuestaEstudiante: string
): Promise<{ texto: string; puntaje: number; aprobada: boolean }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          // Cache the static system prompt across multiple corrections
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content:
            `**Pregunta:** ${pregunta}\n\n` +
            `**Respuesta correcta:** ${respuestaCorrecta}\n\n` +
            `**Respuesta del estudiante:** ${respuestaEstudiante || '(sin respuesta)'}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Error HTTP ${res.status}`);
  }

  const data = await res.json() as { content: { text: string }[] };
  const texto = data.content[0]?.text ?? '';
  const match = texto.match(/(\d+)\s*\/\s*10/);
  const puntaje = match ? Math.min(10, Math.max(0, parseInt(match[1]))) : 5;
  const veredictoMatch = texto.match(/\*\*Veredicto:\*\*\s*(Aprobada|Desaprobada)/);
  const aprobada = veredictoMatch ? veredictoMatch[1] === 'Aprobada' : puntaje >= 6;

  return { texto, puntaje, aprobada };
}

export async function corregirExamen(
  apiKey: string,
  preguntas: { pregunta: string; respuesta: string; respuestaEstudiante: string }[],
  onProgress: (i: number) => void
): Promise<{ texto: string; puntaje: number; aprobada: boolean }[]> {
  const results: { texto: string; puntaje: number; aprobada: boolean }[] = [];
  for (let i = 0; i < preguntas.length; i++) {
    const p = preguntas[i];
    const r = await corregirRespuesta(
      apiKey,
      p.pregunta,
      p.respuesta,
      p.respuestaEstudiante
    );
    results.push(r);
    onProgress(i + 1);
  }
  return results;
}
