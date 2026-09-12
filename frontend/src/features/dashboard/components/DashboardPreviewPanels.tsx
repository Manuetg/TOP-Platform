import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Circle,
  House,
  Leaf,
  WalletCards,
} from "lucide-react";
import { dashboardPreviewMock } from "../mocks/dashboard-preview.mock";

export function PreviewLabel() {
  return (
    <span
      className="dashboard-preview-label"
      title="Datos ilustrativos; la conexión con datos operativos está pendiente."
    >
      Vista previa
    </span>
  );
}

export function TodayPreview() {
  const mockToday = dashboardPreviewMock.today;
  const icons = [ArrowDownLeft, ArrowUpRight, CalendarDays];
  return (
    <section
      className="dashboard-card dashboard-rail-card dashboard-today"
      aria-labelledby="dashboard-today-title"
      data-source="MOCK"
    >
      <header>
        <h2 id="dashboard-today-title">
          <CalendarDays size={17} aria-hidden="true" />
          Hoy
        </h2>
        <PreviewLabel />
      </header>
      <div className="dashboard-today__date">
        <div>
          <strong>
            {new Intl.DateTimeFormat("es-PY", {
                    dateStyle: "medium",
              timeZone: "UTC",
            }).format(new Date(`${mockToday.date}T12:00:00Z`))}
          </strong>
          <p>{mockToday.weekday}</p>
        </div>
        <span className="dashboard-landscape" aria-hidden="true">
          <Leaf size={32} strokeWidth={1.5} />
        </span>
      </div>
      <dl>
        {mockToday.counts.map((item, index) => {
          const Icon = icons[index];
          return (
            <div key={item.label}>
              <Icon size={16} aria-hidden="true" />
              <dt>{item.label}</dt>
              <dd>{item.count}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export function ActivityPreview() {
  const mockActivity = dashboardPreviewMock.recentActivity;
  const icons = {
    booking: CalendarCheck,
    payment: WalletCards,
    resource: House,
  };
  return (
    <section
      className="dashboard-card dashboard-rail-card dashboard-activity"
      aria-labelledby="dashboard-activity-title"
      data-source="MOCK"
    >
      <header>
        <h2 id="dashboard-activity-title">Actividad reciente</h2>
        <PreviewLabel />
      </header>
      <ul>
        {mockActivity.items.map((item) => {
          const Icon = icons[item.kind];
          return (
            <li key={item.kind}>
              <span
                className={`dashboard-activity__icon dashboard-activity__icon--${item.kind}`}
              >
                <Icon size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <small>{item.time}</small>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function NextStepsPreview() {
  const mockSteps = dashboardPreviewMock.nextSteps;
  return (
    <section
      className="dashboard-card dashboard-rail-card dashboard-next"
      aria-labelledby="dashboard-next-title"
      data-source="MOCK"
    >
      <header>
        <h2 id="dashboard-next-title">Próximos pasos</h2>
        <PreviewLabel />
      </header>
      <ul>
        {mockSteps.items.map((item) => (
          <li key={item.title}>
            {item.completed ? (
              <CheckCircle2 size={18} aria-label="Completado en el ejemplo" />
            ) : (
              <Circle size={18} aria-label="Pendiente en el ejemplo" />
            )}
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
