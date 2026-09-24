import { formatPureDate } from "../../../shared/utils/date-format";
import { ArrowRight, Banknote, Search, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { useContacts } from "../../contacts/queries/use-contacts";
import { useBookings } from "../../bookings/queries/use-bookings";
import "./Payments.css";

export function PaymentHubPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { activeBusinessId } = useBusinessContext();
  const [query, setQuery] = useState("");
  const bookings = useBookings({ businessId: activeBusinessId, accessToken: session?.accessToken });
  const contacts = useContacts({ businessId: activeBusinessId, accessToken: session?.accessToken });
  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return (bookings.data ?? [])
      .filter((booking) => ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(booking.status))
      .map((booking) => ({ booking, contact: (contacts.data ?? []).find((item) => item.id === booking.contactId) }))
      .filter(({ booking, contact }) => !normalized || contact?.fullName.toLocaleLowerCase("es").includes(normalized) || booking.id.toLocaleLowerCase().includes(normalized));
  }, [bookings.data, contacts.data, query]);

  const loading = bookings.isLoading || contacts.isLoading;
  const failed = bookings.isError || contacts.isError;

  return <section className="payments-page">
    <header className="payments-hero"><div><span>Gestión financiera</span><h1>Pagos</h1><p>Consultá saldos, planes y cobros de cada reserva.</p></div><div className="payments-hero__icon"><WalletCards size={26} /></div></header>
    <label className="payments-search"><Search size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por huésped o reserva" /></label>
    {loading ? <div className="payments-state" aria-busy="true">Cargando reservas con gestión financiera…</div> : failed ? <div className="payments-state payments-state--error" role="alert">No pudimos cargar las reservas.</div> : rows.length === 0 ? <div className="payments-state"><Banknote size={26} /><strong>Sin reservas para cobrar</strong><p>Las reservas confirmadas aparecerán aquí.</p></div> : <div className="payments-list">
      <div className="payments-list__head"><span>Huésped</span><span>Estadía</span><span>Estado</span><span /></div>
      {rows.map(({ booking, contact }) => <button key={booking.id} type="button" className="payments-list__row" onClick={() => navigate(`/app/bookings/${booking.id}/payments`)}>
        <span><strong>{contact?.fullName ?? "Contacto no disponible"}</strong><small>Reserva {booking.id.slice(0, 8).toUpperCase()}</small></span>
        <span>{booking.checkInDate && booking.checkOutDate ? `${formatPureDate(booking.checkInDate)} → ${formatPureDate(booking.checkOutDate)}` : "Fechas pendientes"}</span>
        <span className={`payments-status payments-status--${booking.status.toLowerCase()}`}>{booking.status === "IN_PROGRESS" ? "En estadía" : booking.status === "COMPLETED" ? "Finalizada" : "Confirmada"}</span>
        <ArrowRight size={18} />
      </button>)}
    </div>}
  </section>;
}
