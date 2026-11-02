function modelCatalog(response) {
  const seen = new Set();
  return (response?.data || []).flatMap(m => {
    const id = m.model || m.id;
    if (m.hidden || typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label: typeof m.displayName === 'string' ? m.displayName.slice(0, 120) : id }];
  });
}
module.exports = { modelCatalog };
