import { BookingStatus } from './booking-status.enum';

export interface BookingProps {
  id: string;
  businessId: string;
  status: BookingStatus;
  contactId: string | null;
  resourceIds: string[];
  checkInDate: Date | null;
  checkOutDate: Date | null;
  adults: number | null;
  children: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Booking {
  private constructor(private readonly props: BookingProps) {}
  static create(props: BookingProps): Booking { return new Booking({ ...props, resourceIds: [...props.resourceIds] }); }
  get id(): string { return this.props.id; }
  get businessId(): string { return this.props.businessId; }
  get status(): BookingStatus { return this.props.status; }
  get contactId(): string | null { return this.props.contactId; }
  get resourceIds(): string[] { return [...this.props.resourceIds]; }
  get checkInDate(): Date | null { return this.props.checkInDate; }
  get checkOutDate(): Date | null { return this.props.checkOutDate; }
  get adults(): number | null { return this.props.adults; }
  get children(): number | null { return this.props.children; }
  get notes(): string | null { return this.props.notes; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
  withStatus(status: BookingStatus): Booking { return Booking.create({ ...this.props, status }); }
}
