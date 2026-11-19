// Where a notification (or any link) sends the staff agendas: a day and an appointment whose pop-up opens.
export function parseAgendaTarget(params: { date?: string; open?: string }): { date: string | null; open: string | null } {
  return {
    date: params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null,
    open: params.open ? params.open : null,
  };
}
