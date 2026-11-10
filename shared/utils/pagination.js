export async function fetchAllPages(client, method, params = {}) {
  const results = [];
  let start = 0;

  while (true) {
    const response = await client.call(method, { ...params, start });
    const items = response.result;

    if (!items || (Array.isArray(items) && items.length === 0)) break;

    if (Array.isArray(items)) {
      results.push(...items);
    } else {
      results.push(items);
    }

    const total = response.total ?? 0;
    start += 50;
    if (start >= total || items.length < 50) break;
  }

  return results;
}
