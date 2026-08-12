export interface ResourceImageProps {
  id: string;
  businessId: string;
  resourceId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ResourceImage {
  private constructor(private readonly props: ResourceImageProps) {}

  static create(props: ResourceImageProps): ResourceImage {
    return new ResourceImage(props);
  }

  get id(): string { return this.props.id; }
  get businessId(): string { return this.props.businessId; }
  get resourceId(): string { return this.props.resourceId; }
  get storageKey(): string { return this.props.storageKey; }
  get mimeType(): string { return this.props.mimeType; }
  get sizeBytes(): number { return this.props.sizeBytes; }
  get sortOrder(): number { return this.props.sortOrder; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
