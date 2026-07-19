// Constantes compartidas entre supabase-client.js, chat-parser.js, ui.js y charts.js

export const CATEGORIAS_INGRESOS = ['Sueldo', 'Operaciones', 'Extras', 'Otro'];
export const CATEGORIAS_GASTOS = ['Comida', 'Almacén', 'Nafta', 'Supermercado', 'Servicios', 'Salud', 'Otros'];

// Rentabilidad anual estimada (%) por tipo de inversión, usada para
// mostrarla en el listado y como valor por defecto al invertir, y en
// el analizador de rendimientos.
export const TIPOS_AHORRO = {
  UALA: 19,
  Galicia: 16,
  Mercado: 15,
  'FIMA A': 24,
  'FIMA B': 26,
  'FIMA C': 22,
  Otro: null,
};

const DIACRITICO_DESDE = String.fromCharCode(768); // U+0300
const DIACRITICO_HASTA = String.fromCharCode(879); // U+036F
const DIACRITICOS_REGEX = new RegExp('[' + DIACRITICO_DESDE + '-' + DIACRITICO_HASTA + ']', 'g');

export function normalizarTexto(texto) {
  return texto
    .normalize('NFD')
    .replace(DIACRITICOS_REGEX, '')
    .toLowerCase()
    .trim();
}

// Busca la categoría "oficial" (con acentos/mayúsculas correctos) que
// mejor matchea el texto ingresado por el usuario, comparando de forma
// tolerante a acentos y mayúsculas. Devuelve null si no hay match.
export function matchCategoria(texto, categorias) {
  const normalizado = normalizarTexto(texto);
  return categorias.find((c) => normalizarTexto(c) === normalizado) || null;
}

export function matchTipoAhorro(texto) {
  const normalizado = normalizarTexto(texto);
  const tipos = Object.keys(TIPOS_AHORRO);
  return tipos.find((t) => normalizarTexto(t) === normalizado) || null;
}
