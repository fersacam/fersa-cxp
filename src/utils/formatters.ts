// Formateador de moneda NIO
export const formatCurrency = (val: number | unknown, currency = 'NIO'): string => {
  const num = typeof val === 'number' ? val : parseFloat(String(val || 0));
  return new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(isNaN(num) ? 0 : num);
};

// Formateador solo número con comas
export const formatNumber = (val: number | unknown): string => {
  const num = typeof val === 'number' ? val : parseFloat(String(val || 0));
  return new Intl.NumberFormat('es-NI', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(isNaN(num) ? 0 : num);
};

// Formatear fecha
export const formatDate = (dateStr: string | unknown): string => {
  if (!dateStr) return '-';
  try {
    const d = new Date(String(dateStr));
    return d.toLocaleDateString('es-NI', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(dateStr);
  }
};

// Días de diferencia desde hoy
export const daysFromToday = (dateStr: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

// Generar código de proveedor
export const generateSupplierCode = (nextId: number): string => {
  return `PROV-${String(nextId).padStart(4, '0')}`;
};
