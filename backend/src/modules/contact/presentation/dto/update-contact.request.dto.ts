import { PartialType } from '@nestjs/swagger';
import { CreateContactRequestDto } from './create-contact.request.dto';

export class UpdateContactRequestDto extends PartialType(CreateContactRequestDto) {}
