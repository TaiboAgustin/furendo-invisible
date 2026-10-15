// Manda los avisos del sorteo de a tandas hasta que no quedan pendientes.
(async () => {
  const el = document.getElementById('enviando-avisos');
  if (!el) return;
  const url = `/eventos/${el.dataset.evento}/avisar`;
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    let estado;
    try {
      const r = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(String(r.status));
      estado = await r.json();
    } catch {
      el.textContent = 'Se cortó el envío. Recargá la página para seguir.';
      return;
    }
    el.textContent = `Enviando avisos… ${estado.enviados} listos, faltan ${estado.pendientes}.`;
    if (estado.pendientes === 0) break;
  }
  location.reload();
})();
