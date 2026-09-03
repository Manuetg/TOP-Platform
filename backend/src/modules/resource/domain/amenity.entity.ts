export type AmenityCategory =
  | 'CONNECTIVITY'
  | 'CLIMATE'
  | 'BATHROOM'
  | 'KITCHEN'
  | 'ENTERTAINMENT'
  | 'OUTDOOR'
  | 'PARKING'
  | 'SERVICES'
  | 'ACCESSIBILITY'
  | 'GENERAL';

export interface AmenityProps {
  id: string;
  businessId?: string | null;
  code: string;
  name: string;
  category: AmenityCategory;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Amenity {
  private constructor(private readonly props: AmenityProps) {}

  static create(props: AmenityProps): Amenity { return new Amenity({ ...props, businessId: props.businessId ?? null }); }
  get id(): string { return this.props.id; }
  get businessId(): string | null { return this.props.businessId ?? null; }
  get scope(): 'GLOBAL' | 'BUSINESS' { return this.businessId === null ? 'GLOBAL' : 'BUSINESS'; }
  get code(): string { return this.props.code; }
  get name(): string { return this.props.name; }
  get category(): AmenityCategory { return this.props.category; }
  get active(): boolean { return this.props.active; }
  get sortOrder(): number { return this.props.sortOrder; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
