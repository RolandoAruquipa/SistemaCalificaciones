(function (root) {
  'use strict';
  const criteria = [
    ['Adaptabilidad a las funciones asignadas', 'Se adapta a las funciones asignadas en la institución.'],
    ['Iniciativa', 'Asume responsabilidades con iniciativa propia y actitudes proactivas.'],
    ['Relaciones interpersonales', 'Establece relaciones que contribuyen a un buen clima institucional.'],
    ['Compromiso', 'Demuestra identidad institucional, responsabilidad, puntualidad y esfuerzo.'],
    ['Resolución de problemas', 'Reconoce problemas potenciales y plantea posibles soluciones.'],
    ['Conocimiento analítico', 'Analiza temas del área de su competencia con capacidad de abstracción.'],
    ['Manejo académico', 'Utiliza conceptos y aplica herramientas metodológicas.'],
    ['Confidencialidad', 'Mantiene reserva y prudencia con información y documentación restringida.']
  ];
  const validScore = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 100;
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  function calculate(personal, activities) {
    const average = scores => scores.length === 8 && scores.every(validScore) ? scores.reduce((sum, value) => sum + Number(value), 0) / 8 : null;
    const p = average(personal), a = average(activities);
    const final = p === null || a === null ? null : round(p * 0.4 + a * 0.6);
    return { personal: p, activities: a, final, completed: [...personal, ...activities].filter(validScore).length,
      result: final === null ? 'Evaluación en progreso' : final <= 60 ? 'Insuficiente' : final <= 75 ? 'Suficiente' : final <= 90 ? 'Bueno' : 'Excelente' };
  }
  const api = { criteria, validScore, round, calculate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Evaluation = api;
})(globalThis);
