import { BusinessStatus } from './business-status.enum';

export interface BusinessProps {
  id: string;
  businessNumber: number | null;
  name: string;
  legalName: string | null;
  taxId: string | null;
  timezone: string;
  currency: string;
  status: BusinessStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessUpdate {
  name?: string;
  legalName?: string | null;
  taxId?: string | null;
  timezone?: string;
  currency?: string;
}

export class Business {
  private constructor(private readonly props: BusinessProps) {}

  static create(props: BusinessProps): Business {
    return new Business(props);
  }

  update(changes: BusinessUpdate): Business {
    return new Business({ ...this.props, ...changes, updatedAt: new Date() });
  }

  archive(): Business {
    if (this.props.status === BusinessStatus.ARCHIVED) {
      return this;
    }

    return new Business({ ...this.props, status: BusinessStatus.ARCHIVED, updatedAt: new Date() });
  }

  get id(): string {
    return this.props.id;
  }

  get businessNumber(): number | null {
    return this.props.businessNumber;
  }

  get name(): string {
    return this.props.name;
  }

  get legalName(): string | null {
    return this.props.legalName;
  }

  get taxId(): string | null {
    return this.props.taxId;
  }

  get timezone(): string {
    return this.props.timezone;
  }

  get currency(): string {
    return this.props.currency;
  }

  get status(): BusinessStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
