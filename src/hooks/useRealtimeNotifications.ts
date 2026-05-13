import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../utils/formatters';

/**
 * Se suscribe a cambios en `invoices` y `payments` vía Supabase Realtime
 * y dispara toasts cuando OTRO usuario hace un cambio.
 * Se ignoran los eventos generados por el propio usuario para evitar ruido.
 */
export function useRealtimeNotifications() {
  const session = useAuthStore(s => s.session);
  const toast = useToast();

  useEffect(() => {
    if (!session) return;
    const myId = session.user.id;

    const channel = supabase
      .channel('cxp_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'invoices' },
        (payload) => {
          const row = payload.new as any;
          if (row?.created_by === myId) return;
          toast.info(
            'Nueva factura registrada',
            `${row.invoice_number ?? '—'} por ${formatCurrency(Number(row.total ?? 0))}`
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'invoices' },
        (payload) => {
          const row = payload.new as any;
          const prev = payload.old as any;
          if (row?.created_by === myId) return;
          // Saltar updates que vienen del trigger de balance/status si nada relevante cambió
          if (row.balance === prev?.balance && row.status === prev?.status &&
              row.total === prev?.total && row.due_date === prev?.due_date) return;
          if (row.status === 'PAGADA' && prev?.status !== 'PAGADA') {
            toast.success(
              'Factura saldada',
              `${row.invoice_number} fue marcada como pagada`
            );
          } else {
            toast.info(
              'Factura actualizada',
              `${row.invoice_number} — saldo ${formatCurrency(Number(row.balance ?? 0))}`
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'invoices' },
        (payload) => {
          const row = payload.old as any;
          toast.info('Factura eliminada', `${row?.invoice_number ?? '—'}`);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payments' },
        (payload) => {
          const row = payload.new as any;
          if (row?.created_by === myId) return;
          toast.info(
            'Nuevo abono registrado',
            `${formatCurrency(Number(row.amount ?? 0))} aplicado a factura #${row.invoice_id}`
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, toast]);
}
