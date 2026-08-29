import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingTimelineEventType, type BookingTimelineEvent } from '../../domain/booking-timeline-event';

class BookingTimelineActorDto { @ApiProperty() userId!:string; }
class BookingTimelineDetailsDto { @ApiPropertyOptional({example:'Cambio de planes.'}) reason?:string; }
export class BookingTimelineEventResponseDto {
  @ApiProperty() id!:string;
  @ApiProperty({enum:BookingTimelineEventType}) type!:BookingTimelineEventType;
  @ApiProperty() occurredAt!:string;
  @ApiPropertyOptional({type:BookingTimelineActorDto,nullable:true}) actor!:BookingTimelineActorDto|null;
  @ApiProperty({type:BookingTimelineDetailsDto}) details!:BookingTimelineDetailsDto;
  static fromDomain(event:BookingTimelineEvent):BookingTimelineEventResponseDto{return {id:event.id,type:event.type,occurredAt:event.occurredAt.toISOString(),actor:event.actorUserId?{userId:event.actorUserId}:null,details:event.details};}
}
class BookingTimelinePageInfoDto { @ApiPropertyOptional({nullable:true}) nextCursor!:string|null; @ApiProperty() hasNextPage!:boolean; }
export class BookingTimelineResponseDto { @ApiProperty({type:BookingTimelineEventResponseDto,isArray:true}) items!:BookingTimelineEventResponseDto[]; @ApiProperty({type:BookingTimelinePageInfoDto}) pageInfo!:BookingTimelinePageInfoDto; }
