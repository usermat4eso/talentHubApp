// Ruta del archivo: app/api/analyze/route.ts

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- CONFIGURACIÓN DE CLIENTES ---

// Creamos un cliente de Supabase para el backend.
// Es seguro usar la clave de servicio aquí porque este código NUNCA se ejecuta en el navegador del usuario.
// Se ejecuta en el servidor de Vercel.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! 
);

// Configuramos el cliente de Google Generative AI con la API Key.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Seleccionamos los modelos específicos que vamos a usar.
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
const generationModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });


// --- FUNCIÓN PRINCIPAL DE LA API ROUTE (se activa con un POST a /api/analyze) ---

export async function POST(request: NextRequest) {
  try {
    // 1. Extraer y validar los datos que nos envía el frontend.
    const { responses, cycleId, sessionId } = await request.json();

    if (!responses || responses.length === 0 || !cycleId || !sessionId) {
      // Si falta algún dato esencial, devolvemos un error claro.
      return NextResponse.json({ error: 'Faltan datos para el análisis (sessionId, cycleId, responses son requeridos)' }, { status: 400 });
    }

    // --- 2. FASE DE RECUPERACIÓN DE CONTEXTO (Retrieval-Augmented Generation - RAG) ---
    
    // Combinamos todas las respuestas de los alumnos en un único bloque de texto.
    const allAnswersText = responses.map((r: any) => 
      `Logro: ${r.answers.q1}. Habilidad: ${r.answers.q2}. Lección: ${r.answers.q3}.`
    ).join(' ');
    
    // Convertimos ese texto combinado en un vector numérico (embedding).
    const embeddingResult = await embeddingModel.embedContent(allAnswersText);
    const queryEmbedding = embeddingResult.embedding.values;

    // Usamos ese vector para llamar a nuestra función 'match_curriculum_items' en Supabase.
    // Esta función buscará en la base de datos los RAs y CEs más relevantes semánticamente.
    const { data: curriculumItems, error: rpcError } = await supabaseAdmin.rpc('match_curriculum_items', {
      query_embedding: queryEmbedding,
      match_threshold: 0.75, // Umbral de similitud (puedes ajustarlo entre 0.7 y 0.8)
      match_count: 10       // Pedimos los 10 mejores resultados.
    });

    if (rpcError) {
      // Si la función de búsqueda falla, lanzamos un error.
      throw new Error(`Error al buscar en el currículo (RPC): ${rpcError.message}`);
    }

    // --- 3. PREPARACIÓN DEL PROMPT PARA LA IA GENERATIVA ---

    const prompt = `
      **Rol y Objetivo:**
      Eres un experto en pedagogía para formación profesional y análisis de competencias. Tu objetivo es analizar las respuestas de una dinámica de inicio de curso para un grupo de alumnos. Debes proporcionar al profesor un informe conciso, práctico y optimista que le ayude a conocer al grupo y a enfocar sus clases.

      **Contexto del Curso:**
      - El análisis es para el ciclo formativo con ID: ${cycleId}.
      - Analiza las respuestas de los alumnos y relaciónalas con los siguientes fragmentos clave del currículo oficial que se han identificado como los más relevantes para esta conversación.

      **Fragmentos Relevantes del Currículo Oficial (Fuente de Verdad):**
      ${curriculumItems.map((item: any) => `- (${item.type}) ${item.description}`).join('\n')}

      **Respuestas de los Alumnos (Anónimas):**
      ${responses.map((r: any, i: number) => `
        Alumno ${i + 1}:
        - Logro: ${r.answers.q1}
        - Habilidad: ${r.answers.q2}
        - Lección: ${r.answers.q3}
      `).join('')}

      **Instrucciones de Análisis y Formato de Salida (Usa Markdown):**
      Genera un informe con un tono cercano y motivador, estructurado EXACTAMENTE en estas secciones:

      ### 🚀 Resumen del Grupo
      Un párrafo breve (3-4 líneas) que capture la "personalidad" de la clase. ¿Son creativos, resolutivos, técnicos? ¿Qué energía transmiten?

      ### ✨ Competencias Clave Detectadas
      Usa una lista de viñetas. Para 3-4 competencias transversales (ej: "Iniciativa y Liderazgo", "Aprendizaje Autónomo Digital", "Resiliencia y Madurez Emocional"), describe cómo se manifiestan en el grupo, citando ejemplos anónimos y textuales de sus respuestas.

      ### 🔗 Conexión Directa con el Currículo
      Esta es la parte más importante. Crea una lista de 2-3 puntos conectando directamente lo que has observado en los alumnos con los fragmentos del currículo proporcionados. Sé muy práctico y directo.
      *Ejemplo:* "El interés recurrente en organizar viajes (Logros) y resolver imprevistos (Lecciones) conecta directamente con el RA 'Planifica la ejecución de actividades'. Se pueden usar sus experiencias como casos de estudio reales."

      ### 💡 Sugerencia Práctica para el Profesor
      Termina con una idea concreta y accionable para la primera semana de clase que se base en las fortalezas detectadas.
      *Ejemplo:* "Propón un micro-proyecto de 1 hora: 'Organizar el catering para un evento sorpresa'. Esto aprovechará su habilidad con herramientas como Canva (Habilidades) y su capacidad de planificación."
    `;

    // --- 4. GENERACIÓN DEL INFORME CON GEMINI ---

    const result = await generationModel.generateContent(prompt);
    const analysisText = result.response.text();
    
    // --- 5. GUARDADO DEL INFORME EN LA BASE DE DATOS ---
    // Actualizamos la fila de la sesión correspondiente con el informe generado.
    
    const { error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({ 
        // Guardamos el informe en un formato JSON para futura flexibilidad.
        ai_report: { markdown: analysisText, generated_at: new Date().toISOString() },
        status: 'closed' // Opcional: marcamos la sesión como analizada.
      })
      .eq('id', sessionId); // Nos aseguramos de actualizar solo la sesión correcta.

    if (updateError) {
      // Si falla el guardado, lo registramos en la consola del servidor,
      // pero no detenemos el proceso, ya que el informe sí se generó.
      console.error("Error al guardar el informe de IA en la base de datos:", updateError);
    }
    
    // --- 6. DEVOLUCIÓN DEL RESULTADO AL FRONTEND ---

    // Enviamos el informe de vuelta a la aplicación del profesor para que pueda mostrarlo.
    return NextResponse.json({ analysis: analysisText });

  } catch (error: any) {
    // Manejo de cualquier error que pueda ocurrir en el proceso.
    console.error('Error general en la API de análisis:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}