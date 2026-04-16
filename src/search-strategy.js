// Search strategy module - expande un término con sus sinónimos
const { readFileSync } = require("fs");
const { join } = require("path");

// Cargar diccionario de sinónimos
const SYNONYMS_PATH = join(__dirname, "synonyms.json");
let synonymsDict = {};

try {
  const synonymsData = readFileSync(SYNONYMS_PATH, "utf-8");
  synonymsDict = JSON.parse(synonymsData);
} catch (error) {
  console.error(`Error cargando sinónimos desde ${SYNONYMS_PATH}:`, error.message);
  // Continuar con diccionario vacío si hay error
}

/**
 * Expande un término único con sus sinónimos
 * @param {string} term - Un ÚNICO término a expandir (ej: "bulto", "camping")
 * @returns {string[]} Array con el término + sinónimos (máx 8 términos)
 */
function expandSearchTerms(term) {
  if (!term || typeof term !== "string") {
    return [];
  }

  const normalized = term.toLowerCase().trim();
  if (!normalized) {
    return [];
  }

  // Buscar el término completo en el diccionario
  const expanded = [normalized];

  if (synonymsDict[normalized]) {
    // Si existe, agregar los sinónimos
    expanded.push(...synonymsDict[normalized]);
  }

  // Remover duplicados manteniendo orden
  const unique = [...new Set(expanded)];

  // Retornar máximo 8 términos
  return unique.slice(0, 8);
}

/**
 * Obtiene el diccionario de sinónimos completo
 * Útil para debugging
 * @returns {object} Diccionario de sinónimos
 */
function getSynonymsDictionary() {
  return { ...synonymsDict };
}

module.exports = { expandSearchTerms, getSynonymsDictionary };
