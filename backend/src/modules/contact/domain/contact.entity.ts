import { ContactStatus } from './contact-status.enum';

export interface ContactProps {
  id: string;
  businessId: string;
  name: string;
  lastName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  documentType: string | null;
  documentNumber: string | null;
  country: string | null;
  city: string | null;
  status: ContactStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type ContactUpdate = Partial<Pick<ContactProps, 'name' | 'lastName' | 'phone' | 'whatsapp' | 'email' | 'documentType' | 'documentNumber' | 'country' | 'city'>>;

export class Contact {
  private constructor(private readonly props: ContactProps) {}
  static create(props: ContactProps): Contact { return new Contact(props); }
  get id(): string { return this.props.id; }
  get businessId(): string { return this.props.businessId; }
  get name(): string { return this.props.name; }
  get lastName(): string | null { return this.props.lastName; }
  get phone(): string | null { return this.props.phone; }
  get whatsapp(): string | null { return this.props.whatsapp; }
  get email(): string | null { return this.props.email; }
  get documentType(): string | null { return this.props.documentType; }
  get documentNumber(): string | null { return this.props.documentNumber; }
  get country(): string | null { return this.props.country; }
  get city(): string | null { return this.props.city; }
  get status(): ContactStatus { return this.props.status; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
  get fullName(): string { return [this.name, this.lastName].filter((part): part is string => part !== null).join(' '); }
  update(changes: ContactUpdate): Contact { return Contact.create({ ...this.props, ...changes, updatedAt: new Date() }); }
}
