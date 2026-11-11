// Extrae los ítems de una página. Los métodos antiguos devuelven `result` como array; los de REST 2
// (catalog.*, crm.item.*, ...) devuelven un objeto con la lista dentro (result.products, result.items...).
// `key` indica esa propiedad; sin `key`, se usa la única propiedad array del objeto, si existe.
function pageItems(result, key) {
  if (result === undefined || result === null) return [];
  if (Array.isArray(result)) return result;
  if (typeof result !== 'object') return [result];
  if (key) return Array.isArray(result[key]) ? result[key] : [];
  const arrays = Object.values(result).filter(Array.isArray);
  if (arrays.length === 1) return arrays[0];
  return [result];
}

export async function fetchAllPages(client, method, params = {}, key) {
  const results = [];
  let start = 0;

  while (true) {
    const response = await client.call(method, { ...params, start });
    const items = pageItems(response.result, key);
    if (items.length === 0) break;

    results.push(...items);

    const total = response.total ?? 0;
    start += 50;
    if (start >= total || items.length < 50) break;
  }

  return results;
}
